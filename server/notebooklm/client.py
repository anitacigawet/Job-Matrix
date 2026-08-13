"""
Job Matrix NotebookLM client — thin async wrapper around the unofficial
`notebooklm` Python library.

Pre-requisite: run `notebooklm login` once to generate session cookies.
The client loads them via `NotebookLMClient.from_storage()`.

IMPORTANT: NotebookLM has no official public API. The library used here is a
community wrapper that reverse-engineers the web app. Be a good citizen:

  - Default cooldown of 8 seconds between queries (configurable via env).
  - Exponential backoff on errors.
  - No more than ~6-8 queries per minute by default.

Set NOTEBOOKLM_COOLDOWN to override the per-call delay (in seconds).
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# ── Rate limiting defaults ────────────────────────────────────────
_DEFAULT_COOLDOWN_SECONDS = float(os.environ.get('NOTEBOOKLM_COOLDOWN', '8.0'))
_MAX_RETRIES = int(os.environ.get('NOTEBOOKLM_MAX_RETRIES', '3'))
_BACKOFF_BASE = 2.0  # exponential backoff base, seconds

# Generation timeouts (seconds). Studio media takes minutes. Defaults are
# generous — override with NOTEBOOKLM_STUDIO_TIMEOUT if NotebookLM speeds up.
_STUDIO_TIMEOUT_AUDIO = float(os.environ.get("NOTEBOOKLM_AUDIO_TIMEOUT", "1500"))   # 25 min
_STUDIO_TIMEOUT_VIDEO = float(os.environ.get("NOTEBOOKLM_VIDEO_TIMEOUT", "1800"))   # 30 min
_STUDIO_TIMEOUT_INFOGRAPHIC = float(os.environ.get("NOTEBOOKLM_INFOGRAPHIC_TIMEOUT", "600"))  # 10 min

# ── Studio "silent rejection" retry ───────────────────────────────
# Sometimes NotebookLM accepts an artifact-create call (HTTP 200) but
# returns an empty task_id, which means Google quietly refused to actually
# kick off the generation. There's no error to catch — the response just
# has no task to track. Without a guard we'd poll a non-existent task for
# the full timeout (~25 min for audio) and only then fail.
#
# When we see an empty task_id we now retry the create call up to
# NOTEBOOKLM_STUDIO_CREATE_MAX_ATTEMPTS times with exponential backoff, then
# give up cleanly with status="silent_rejection" so the caller can mark
# the output as a dud and move on. The polling/download path is untouched
# — we only retry the create itself.
_STUDIO_CREATE_MAX_ATTEMPTS = int(os.environ.get("NOTEBOOKLM_STUDIO_CREATE_MAX_ATTEMPTS", "3"))
_STUDIO_CREATE_BACKOFF_BASE = float(os.environ.get("NOTEBOOKLM_STUDIO_CREATE_BACKOFF", "60.0"))


class StudioSilentRejection(RuntimeError):
    """Studio create call returned 200 OK with an empty task_id — Google
    silently refused to start the generation. Retried automatically; only
    surfaces when retries are exhausted."""

# ── Style menu (informational, NOT a ban list) ────────────────────
# The wrapper does NOT block any style; the prompt file's front-matter
# picks which one is used per output. The menus below are a reference
# guide for the values you can pass.
#
# VideoStyle options:
#   AUTO_SELECT, CUSTOM, CLASSIC, WHITEBOARD, KAWAII, ANIME, WATERCOLOR,
#   RETRO_PRINT, HERITAGE, PAPER_CRAFT
#
# InfographicStyle options:
#   AUTO_SELECT, SKETCH_NOTE, PROFESSIONAL, BENTO_GRID, EDITORIAL,
#   INSTRUCTIONAL, BRICKS, CLAY, ANIME, KAWAII, SCIENTIFIC


class BrandSafetyError(RuntimeError):
    """
    Reserved for future use. Currently the bridge does NOT enforce a style
    ban list — every NotebookLM Studio style is allowed, and the prompt
    file's front-matter picks per-output.
    """


def _parse_simple_yaml(text: str) -> dict:
    """
    Minimal YAML-ish parser for prompt front-matter when PyYAML isn't available.
    Handles: top-level `key: value` and one level of nesting under `key:`.
    Indentation must be consistent; values are returned as strings.
    """
    result: dict = {}
    cur_key: str | None = None
    cur_indent: int | None = None
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].rstrip()
        if not line.strip():
            continue
        indent = len(line) - len(line.lstrip())
        stripped = line.lstrip()
        if ":" not in stripped:
            continue
        key, _, val = stripped.partition(":")
        key = key.strip()
        val = val.strip()
        if val.startswith('"') and val.endswith('"'):
            val = val[1:-1]
        if indent == 0:
            if val:
                result[key] = val
                cur_key = None
                cur_indent = None
            else:
                result[key] = {}
                cur_key = key
                cur_indent = None
        else:
            # Nested under cur_key
            if cur_key is None:
                continue
            if cur_indent is None:
                cur_indent = indent
            if isinstance(result.get(cur_key), dict):
                result[cur_key][key] = val
    return result


class BriefingsClient:
    """
    Polite async client. Lifecycle:
        client = BriefingsClient()
        await client.open()
        try:
            answer = await client.query(notebook_id, prompt_text)
        finally:
            await client.close()
    """

    def __init__(self, cooldown_seconds: float = _DEFAULT_COOLDOWN_SECONDS):
        self._client_instance = None
        self._client = None
        self._last_call_at: float = 0.0
        self._cooldown = cooldown_seconds
        self._lock = asyncio.Lock()

    async def open(self) -> None:
        """Load session cookies and open the underlying client."""
        from notebooklm import NotebookLMClient  # imported lazily

        self._client_instance = await NotebookLMClient.from_storage()
        self._client = await self._client_instance.__aenter__()
        logger.info("NotebookLM client opened (cooldown=%.1fs)", self._cooldown)

    async def close(self) -> None:
        if self._client_instance:
            await self._client_instance.__aexit__(None, None, None)
            self._client_instance = None
            self._client = None
            logger.info("NotebookLM client closed")

    async def _respect_cooldown(self) -> None:
        """Enforce the minimum delay between calls."""
        elapsed = time.monotonic() - self._last_call_at
        if elapsed < self._cooldown:
            wait = self._cooldown - elapsed
            logger.debug("Cooldown: sleeping %.2fs before next NotebookLM call", wait)
            await asyncio.sleep(wait)

    async def create_notebook(self, title: str) -> str:
        """Create a new NotebookLM notebook. Returns the notebook ID."""
        if self._client is None:
            raise RuntimeError("Client not opened. Call await client.open() first.")
        async with self._lock:
            await self._respect_cooldown()
            try:
                nb = await self._client.notebooks.create(title)
                return nb.id
            finally:
                self._last_call_at = time.monotonic()

    async def add_url_source(self, notebook_id: str, url: str, wait: bool = True) -> None:
        """
        Upload a URL (e.g., YouTube video) as a source on a notebook.
        wait=True blocks until ingestion / transcription completes.
        """
        if self._client is None:
            raise RuntimeError("Client not opened. Call await client.open() first.")
        async with self._lock:
            await self._respect_cooldown()
            try:
                await self._client.sources.add_url(notebook_id, url, wait=wait)
            finally:
                self._last_call_at = time.monotonic()

    async def add_file_source(
        self, notebook_id: str, file_path: str, wait: bool = True
    ) -> None:
        """
        Upload a local file (markdown, txt, pdf, etc.) as a source on a
        notebook. For Job Matrix's briefing flow this is how we hand
        NotebookLM the generated context document describing the user's
        current job-search state.
        wait=True blocks until ingestion completes.
        """
        if self._client is None:
            raise RuntimeError("Client not opened. Call await client.open() first.")
        async with self._lock:
            await self._respect_cooldown()
            try:
                await self._client.sources.add_file(notebook_id, file_path, wait=wait)
            finally:
                self._last_call_at = time.monotonic()

    async def configure_prompt(self, notebook_id: str, prompt_text: str) -> None:
        """
        Apply a custom prompt to a notebook before querying it.
        Sets goal=CUSTOM and response_length=LONGER.
        """
        from notebooklm import ChatGoal, ChatResponseLength
        if self._client is None:
            raise RuntimeError("Client not opened. Call await client.open() first.")

        async with self._lock:
            await self._respect_cooldown()
            try:
                await self._client.chat.configure(
                    notebook_id=notebook_id,
                    goal=ChatGoal.CUSTOM,
                    response_length=ChatResponseLength.LONGER,
                    custom_prompt=prompt_text,
                )
            finally:
                self._last_call_at = time.monotonic()

    async def query(self, notebook_id: str, query_text: str) -> str:
        """Send a query to a notebook. Returns the text answer."""
        if self._client is None:
            raise RuntimeError("Client not opened. Call await client.open() first.")

        last_error: Optional[Exception] = None
        for attempt in range(1, _MAX_RETRIES + 1):
            async with self._lock:
                await self._respect_cooldown()
                try:
                    result = await self._client.chat.ask(notebook_id, query_text)
                    self._last_call_at = time.monotonic()
                    return result.answer
                except Exception as e:
                    self._last_call_at = time.monotonic()
                    last_error = e
                    backoff = _BACKOFF_BASE ** attempt
                    logger.warning(
                        "NotebookLM query failed (attempt %d/%d): %s. Backing off %.1fs",
                        attempt, _MAX_RETRIES, e, backoff
                    )
            if attempt < _MAX_RETRIES:
                await asyncio.sleep(backoff)

        raise RuntimeError(f"NotebookLM query failed after {_MAX_RETRIES} attempts: {last_error}")

    # ── Studio artifact generation (audio / video / infographic) ───
    #
    # The wrapper's ArtifactsAPI exposes generate_*, wait_for_completion,
    # and download_*. We add brand-safety guards before dispatching and
    # serialize calls under our cooldown lock.

    async def _wait_for_artifact(
        self, notebook_id: str, task_id: str, timeout_seconds: float
    ):
        """Block until the artifact is ready (or timeout). Returns final status."""
        if self._client is None:
            raise RuntimeError("Client not opened.")
        # ArtifactsAPI.wait_for_completion has its own internal polling cadence
        # (exponential backoff). We don't hold our own lock during the wait —
        # that would serialize multiple parallel waits, which is fine for our
        # serial-by-design worker.
        return await self._client.artifacts.wait_for_completion(
            notebook_id=notebook_id,
            task_id=task_id,
            timeout=timeout_seconds,
        )

    async def _poll_download(
        self,
        download_callable,
        notebook_id: str,
        artifact_id: str,
        output_path: str,
        timeout_seconds: float,
        artifact_label: str,
    ) -> str | None:
        """
        Poll the wrapper's download_* function with backoff. Bypasses
        wait_for_completion (which has been observed to get stuck downgrading
        COMPLETED to PROCESSING via _is_media_ready). The download function
        does its own COMPLETED-status check and succeeds the moment the
        artifact is truly ready. Returns the downloaded path, or None on
        timeout.

        download_callable must be an async function with signature:
            (notebook_id, output_path, artifact_id) -> str
        """
        from notebooklm.types import ArtifactNotReadyError, ArtifactDownloadError

        deadline = time.monotonic() + timeout_seconds
        delay = 30.0  # seconds between download attempts; gentle on the API
        attempt = 0
        while True:
            attempt += 1
            async with self._lock:
                await self._respect_cooldown()
                try:
                    path = await download_callable(
                        notebook_id=notebook_id,
                        output_path=output_path,
                        artifact_id=artifact_id,
                    )
                    self._last_call_at = time.monotonic()
                    logger.info("%s: download succeeded on attempt %d (id=%s)",
                                artifact_label, attempt, artifact_id)
                    return path
                except (ArtifactNotReadyError, ArtifactDownloadError) as e:
                    self._last_call_at = time.monotonic()
                    logger.debug("%s: not ready on attempt %d (%s)",
                                 artifact_label, attempt, e)
                except Exception:
                    self._last_call_at = time.monotonic()
                    logger.exception("%s: unexpected download error on attempt %d",
                                     artifact_label, attempt)
                    raise

            remaining = deadline - time.monotonic()
            if remaining <= 0:
                logger.warning("%s: download timed out after %.0fs (id=%s)",
                               artifact_label, timeout_seconds, artifact_id)
                return None
            await asyncio.sleep(min(delay, remaining))

    async def _create_studio_with_retry(self, label: str, create_callable):
        """
        Run a studio artifact-create call with automatic retry on silent
        rejection (HTTP 200 + empty task_id). Each attempt acquires the
        lock and respects cooldown. After _STUDIO_CREATE_MAX_ATTEMPTS empty
        responses we give up and raise StudioSilentRejection — the caller
        surfaces it as status="silent_rejection" so the WO output is
        marked a dud and the operator sees a red error.

        `create_callable` is a zero-arg async callable that performs the
        actual create RPC and returns the wrapper's GenerationResult
        (with `.task_id`).
        """
        for attempt in range(1, _STUDIO_CREATE_MAX_ATTEMPTS + 1):
            async with self._lock:
                await self._respect_cooldown()
                try:
                    gen = await create_callable()
                finally:
                    self._last_call_at = time.monotonic()

            task_id = getattr(gen, "task_id", None)
            if task_id:
                if attempt > 1:
                    logger.info(
                        "%s: create succeeded on attempt %d after silent rejection(s)",
                        label, attempt,
                    )
                return gen

            logger.warning(
                "%s: silent rejection (empty task_id) on attempt %d/%d",
                label, attempt, _STUDIO_CREATE_MAX_ATTEMPTS,
            )
            if attempt < _STUDIO_CREATE_MAX_ATTEMPTS:
                backoff = _STUDIO_CREATE_BACKOFF_BASE * attempt
                logger.info("%s: retrying create in %.0fs", label, backoff)
                await asyncio.sleep(backoff)

        raise StudioSilentRejection(
            f"{label}: NotebookLM silently rejected create "
            f"{_STUDIO_CREATE_MAX_ATTEMPTS} times (empty task_id each time)"
        )

    async def generate_audio_overview(
        self,
        notebook_id: str,
        instructions: str,
        audio_format: str = "DEEP_DIVE",
        audio_length: str = "LONG",
        language: str = "en",
        output_path: str | None = None,
    ) -> dict:
        """
        Generate an Audio Overview ("Deep Dive" podcast). Returns:
          { task_id, status, downloaded_path | None }

        On silent rejection (Google returns HTTP 200 + empty task_id) we
        retry the create up to _STUDIO_CREATE_MAX_ATTEMPTS times before
        returning status="silent_rejection".
        """
        if self._client is None:
            raise RuntimeError("Client not opened.")
        from notebooklm.rpc import AudioFormat, AudioLength

        fmt = AudioFormat[audio_format]
        length = AudioLength[audio_length]

        async def _create():
            return await self._client.artifacts.generate_audio(
                notebook_id=notebook_id,
                instructions=instructions,
                audio_format=fmt,
                audio_length=length,
                language=language,
            )

        try:
            gen = await self._create_studio_with_retry("audio", _create)
        except StudioSilentRejection as e:
            logger.error(str(e))
            return {"task_id": None, "status": "silent_rejection",
                    "is_complete": False, "downloaded_path": None}

        logger.info("audio: task %s queued, polling download up to %.0fs",
                    gen.task_id, _STUDIO_TIMEOUT_AUDIO)
        downloaded = None
        if output_path:
            downloaded = await self._poll_download(
                download_callable=self._client.artifacts.download_audio,
                notebook_id=notebook_id,
                artifact_id=gen.task_id,
                output_path=output_path,
                timeout_seconds=_STUDIO_TIMEOUT_AUDIO,
                artifact_label="audio",
            )
        return {"task_id": gen.task_id,
                "status": "ok" if downloaded else "timeout",
                "is_complete": downloaded is not None,
                "downloaded_path": downloaded}

    async def generate_video_overview(
        self,
        notebook_id: str,
        instructions: str,
        video_format: str = "EXPLAINER",
        video_style: str = "CLASSIC",
        language: str = "en",
        output_path: str | None = None,
    ) -> dict:
        """Generate a Video Overview. Style is whatever the prompt selects."""
        if self._client is None:
            raise RuntimeError("Client not opened.")
        from notebooklm.rpc import VideoFormat, VideoStyle

        fmt = VideoFormat[video_format]
        style = VideoStyle[video_style]

        async def _create():
            return await self._client.artifacts.generate_video(
                notebook_id=notebook_id,
                instructions=instructions,
                video_format=fmt,
                video_style=style,
                language=language,
            )

        try:
            gen = await self._create_studio_with_retry("video", _create)
        except StudioSilentRejection as e:
            logger.error(str(e))
            return {"task_id": None, "status": "silent_rejection",
                    "is_complete": False, "downloaded_path": None}

        logger.info("video: task %s queued, polling download up to %.0fs",
                    gen.task_id, _STUDIO_TIMEOUT_VIDEO)
        downloaded = None
        if output_path:
            downloaded = await self._poll_download(
                download_callable=self._client.artifacts.download_video,
                notebook_id=notebook_id,
                artifact_id=gen.task_id,
                output_path=output_path,
                timeout_seconds=_STUDIO_TIMEOUT_VIDEO,
                artifact_label="video",
            )
        return {"task_id": gen.task_id,
                "status": "ok" if downloaded else "timeout",
                "is_complete": downloaded is not None,
                "downloaded_path": downloaded}

    async def generate_infographic(
        self,
        notebook_id: str,
        instructions: str,
        orientation: str = "PORTRAIT",
        detail_level: str = "DETAILED",
        style: str = "PROFESSIONAL",
        language: str = "en",
        output_path: str | None = None,
    ) -> dict:
        """Generate an Infographic. Style is whatever the prompt selects."""
        if self._client is None:
            raise RuntimeError("Client not opened.")
        from notebooklm.rpc import InfographicOrientation, InfographicDetail, InfographicStyle

        orient = InfographicOrientation[orientation]
        detail = InfographicDetail[detail_level]
        st = InfographicStyle[style]

        async def _create():
            return await self._client.artifacts.generate_infographic(
                notebook_id=notebook_id,
                instructions=instructions,
                orientation=orient,
                detail_level=detail,
                style=st,
                language=language,
            )

        try:
            gen = await self._create_studio_with_retry("infographic", _create)
        except StudioSilentRejection as e:
            logger.error(str(e))
            return {"task_id": None, "status": "silent_rejection",
                    "is_complete": False, "downloaded_path": None}

        logger.info("infographic: task %s queued, polling download up to %.0fs",
                    gen.task_id, _STUDIO_TIMEOUT_INFOGRAPHIC)
        downloaded = None
        if output_path:
            downloaded = await self._poll_download(
                download_callable=self._client.artifacts.download_infographic,
                notebook_id=notebook_id,
                artifact_id=gen.task_id,
                output_path=output_path,
                timeout_seconds=_STUDIO_TIMEOUT_INFOGRAPHIC,
                artifact_label="infographic",
            )
        return {"task_id": gen.task_id,
                "status": "ok" if downloaded else "timeout",
                "is_complete": downloaded is not None,
                "downloaded_path": downloaded}

    # ── Convenience: load a prompt file from prompts/ ──────────────

    @staticmethod
    def load_prompt_file(prompt_filename: str) -> str:
        """Load just the body of a prompt file (front-matter stripped)."""
        _, body = BriefingsClient.load_prompt_with_meta(prompt_filename)
        return body

    @staticmethod
    def load_prompt_with_meta(prompt_filename: str) -> tuple[dict, str]:
        """
        Load a prompt file. Returns (front_matter_dict, body_text).
        Front-matter is parsed leniently: YAML if PyYAML is available,
        otherwise a tiny key:value parser for the simple cases we need.

        The body has the bridge's "Instructions (sent to Studio)" or any
        leading prose stripped — only the actual instruction text is returned.
        """
        prompts_dir = Path(__file__).resolve().parent / "prompts"
        path = prompts_dir / prompt_filename
        if not path.exists():
            raise FileNotFoundError(f"Prompt file not found: {path}")

        text = path.read_text(encoding="utf-8")

        # Split front-matter and body
        front_matter_raw = ""
        body = text
        if text.startswith("---"):
            end = text.find("---", 3)
            if end != -1:
                front_matter_raw = text[3:end].strip()
                body = text[end + 3:].lstrip()

        # Parse front-matter (PyYAML preferred; tiny fallback for environments without it)
        meta: dict = {}
        try:
            import yaml  # type: ignore
            meta = yaml.safe_load(front_matter_raw) or {}
        except ImportError:
            meta = _parse_simple_yaml(front_matter_raw)
        except Exception:
            meta = {}

        # Normalise: if the body has an "## Instructions" or "## STRUCTURAL
        # GUIDANCE" heading, prefer the content after that heading. This lets
        # prompt files include human-facing notes (TODO blocks, examples,
        # context) without sending them to the model.
        instructions_heading_markers = (
            "## Instructions (sent to Studio)",
            "## Instructions (sent as the chat query / configure prompt)",
            "## STRUCTURAL GUIDANCE — sent to Studio",
            "## STRUCTURAL GUIDANCE",
            "## DESIGN BLOCK — sent to Studio",
            "## DESIGN BLOCK",
            "## Instructions",
        )
        for marker in instructions_heading_markers:
            idx = body.find(marker)
            if idx != -1:
                body = body[idx + len(marker):].lstrip()
                # Stop at the next heading if there is one
                next_heading = body.find("\n## ")
                if next_heading != -1:
                    body = body[:next_heading].strip()
                break

        return meta, body.strip()
