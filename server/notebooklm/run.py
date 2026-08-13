#!/usr/bin/env python3
"""
server/notebooklm/run.py

Python entrypoint invoked by Node (`server/services/briefings.ts`) as a
short-lived subprocess. Reads a JSON config from stdin, dispatches to the
appropriate BriefingsClient flow, prints a single JSON result to stdout,
and exits.

This mirrors Job Matrix's existing Python pattern (server/job_scraper.py,
server/job_scraper.py) — Node spawns, Python does, Node parses stdout.

Input format (stdin, single JSON object):

  Action: generate_studio_artifact (audio / video / infographic)
    {
      "action": "generate_studio_artifact",
      "artifact_kind": "audio" | "video" | "infographic",
      "notebook_title": "Daily Coach Briefing 2026-05-16",
      "context_file": "/abs/path/to/context.md",
      "prompt_file": "daily_coach_audio.md",
      "output_path": "/abs/path/to/output.mp4",
      "studio": {
          # for audio: {"audio_format": "DEEP_DIVE", "audio_length": "DEFAULT", "language": "en"}
          # for video: {"video_format": "EXPLAINER", "video_style": "CLASSIC", "language": "en"}
          # for infographic: {"orientation": "PORTRAIT", "detail_level": "DETAILED", "style": "PROFESSIONAL", "language": "en"}
      }
    }

  Action: generate_text (NotebookLM chat output, no Studio artifact)
    {
      "action": "generate_text",
      "notebook_title": "Monthly Retrospective 2026-05",
      "context_file": "/abs/path/to/context.md",
      "prompt_file": "monthly_retrospective.md"
    }

  Action: check_auth
    { "action": "check_auth", "force": false }

  Action: spawn_relogin
    { "action": "spawn_relogin" }

  Action: confirm_relogin
    { "action": "confirm_relogin" }

  Action: relogin_status
    { "action": "relogin_status" }

Output format (stdout, single JSON object):
  All actions print a top-level dict with at least:
    { "status": "ok" | "error" | "auth_expired" | "silent_rejection" | "timeout",
      "details": "human-readable note" }
  Action-specific fields below.
"""
from __future__ import annotations

import asyncio
import json
import logging
import sys
import traceback
from pathlib import Path

# Ensure we can import from the package even when invoked as a script
_HERE = Path(__file__).resolve().parent
if str(_HERE.parent.parent) not in sys.path:
    sys.path.insert(0, str(_HERE.parent.parent))

from server.notebooklm.client import BriefingsClient, StudioSilentRejection  # noqa: E402
from server.notebooklm import auth_check  # noqa: E402

logger = logging.getLogger("notebooklm.run")
logging.basicConfig(
    level=logging.INFO,
    stream=sys.stderr,  # logs to stderr; stdout is the JSON result
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)


def _emit(payload: dict) -> None:
    """Print a JSON result to stdout. Single line, no trailing newline."""
    sys.stdout.write(json.dumps(payload))
    sys.stdout.flush()


async def _generate_studio_artifact(cfg: dict) -> dict:
    """Create a notebook, upload context, configure prompt, generate artifact, download."""
    kind = cfg["artifact_kind"]
    title = cfg["notebook_title"]
    context_file = cfg["context_file"]
    prompt_file = cfg["prompt_file"]
    output_path = cfg["output_path"]
    studio = cfg.get("studio", {})

    client = BriefingsClient()
    await client.open()
    try:
        # 1. Create notebook
        logger.info("Creating NotebookLM notebook: %s", title)
        notebook_id = await client.create_notebook(title)
        logger.info("notebook_id=%s", notebook_id)

        # 2. Upload context as a source
        logger.info("Uploading context file: %s", context_file)
        await client.add_file_source(notebook_id, context_file, wait=True)

        # 3. Load prompt file (front-matter + body)
        _, body = BriefingsClient.load_prompt_with_meta(prompt_file)
        logger.info("Prompt body length: %d chars", len(body))

        # 4. Configure custom prompt
        await client.configure_prompt(notebook_id, body)

        # 5. Generate studio artifact
        if kind == "audio":
            result = await client.generate_audio_overview(
                notebook_id=notebook_id,
                instructions=body,
                audio_format=studio.get("audio_format", "DEEP_DIVE"),
                audio_length=studio.get("audio_length", "DEFAULT"),
                language=studio.get("language", "en"),
                output_path=output_path,
            )
        elif kind == "video":
            result = await client.generate_video_overview(
                notebook_id=notebook_id,
                instructions=body,
                video_format=studio.get("video_format", "EXPLAINER"),
                video_style=studio.get("video_style", "CLASSIC"),
                language=studio.get("language", "en"),
                output_path=output_path,
            )
        elif kind == "infographic":
            result = await client.generate_infographic(
                notebook_id=notebook_id,
                instructions=body,
                orientation=studio.get("orientation", "PORTRAIT"),
                detail_level=studio.get("detail_level", "DETAILED"),
                style=studio.get("style", "PROFESSIONAL"),
                language=studio.get("language", "en"),
                output_path=output_path,
            )
        else:
            return {
                "status": "error",
                "details": f"Unknown artifact_kind: {kind}",
            }

        return {
            "status": result["status"],
            "details": (
                f"Studio {kind} generation: {result['status']}"
                + (f" → {result['downloaded_path']}" if result.get("downloaded_path") else "")
            ),
            "notebook_id": notebook_id,
            "task_id": result.get("task_id"),
            "downloaded_path": result.get("downloaded_path"),
            "is_complete": result.get("is_complete", False),
        }
    finally:
        await client.close()


async def _generate_text(cfg: dict) -> dict:
    """Create a notebook, upload context, configure prompt, query for a text response."""
    title = cfg["notebook_title"]
    context_file = cfg["context_file"]
    prompt_file = cfg["prompt_file"]

    client = BriefingsClient()
    await client.open()
    try:
        notebook_id = await client.create_notebook(title)
        await client.add_file_source(notebook_id, context_file, wait=True)
        _, body = BriefingsClient.load_prompt_with_meta(prompt_file)
        await client.configure_prompt(notebook_id, body)
        # Trigger a single text response. The configured prompt drives the format.
        answer = await client.query(
            notebook_id, "Generate the output exactly as the configured prompt specifies."
        )
        return {
            "status": "ok",
            "details": "Text generation complete",
            "notebook_id": notebook_id,
            "text_content": answer,
        }
    finally:
        await client.close()


async def _dispatch(cfg: dict) -> dict:
    action = cfg.get("action")

    if action == "generate_studio_artifact":
        try:
            return await _generate_studio_artifact(cfg)
        except StudioSilentRejection as e:
            return {"status": "silent_rejection", "details": str(e)}
        except ValueError as e:
            # notebooklm-py raises ValueError on auth-expired
            if "expired" in str(e).lower() or "invalid" in str(e).lower():
                return {"status": "auth_expired", "details": str(e)}
            raise

    if action == "generate_text":
        try:
            return await _generate_text(cfg)
        except ValueError as e:
            if "expired" in str(e).lower() or "invalid" in str(e).lower():
                return {"status": "auth_expired", "details": str(e)}
            raise

    if action == "check_auth":
        force = bool(cfg.get("force", False))
        result = await auth_check.check_auth_status_async(force=force)
        return {"status": "ok", "auth": result}

    if action == "spawn_relogin":
        return {"status": "ok", "relogin": auth_check.spawn_relogin()}

    if action == "confirm_relogin":
        timeout = float(cfg.get("timeout_seconds", 30.0))
        return {"status": "ok", "relogin": auth_check.confirm_relogin(timeout)}

    if action == "relogin_status":
        return {"status": "ok", "relogin": auth_check.relogin_status()}

    return {"status": "error", "details": f"Unknown action: {action!r}"}


def main() -> int:
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            _emit({"status": "error", "details": "No JSON config received on stdin"})
            return 2
        cfg = json.loads(raw)
    except json.JSONDecodeError as e:
        _emit({"status": "error", "details": f"Invalid JSON on stdin: {e}"})
        return 2

    try:
        result = asyncio.run(_dispatch(cfg))
        _emit(result)
        return 0 if result.get("status") in ("ok", "timeout", "silent_rejection") else 1
    except Exception as e:
        logger.exception("Unhandled error in dispatch")
        _emit({
            "status": "error",
            "details": f"{type(e).__name__}: {e}",
            "traceback": traceback.format_exc(),
        })
        return 1


if __name__ == "__main__":
    sys.exit(main())
