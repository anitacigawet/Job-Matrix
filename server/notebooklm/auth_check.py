"""
Job Matrix NotebookLM auth health check.

Purpose: Detect the silent-failure auth-expired condition (silent-failure auth-expired) without
spamming the unofficial API. The wrapper's `from_storage()` is the cheapest
auth probe — it loads cookies from the local store and verifies them by
hitting one endpoint. We cache the result for several minutes so the UI
can poll without bothering NotebookLM repeatedly.

Public API:
    check_auth_status(force=False) -> dict
        Returns: {
          "status":     "valid" | "expired" | "missing" | "unknown",
          "checked_at": ISO timestamp string,
          "details":    short human-readable note,
          "cached":     bool,
        }

    spawn_relogin() -> dict
        Spawns `python -m notebooklm login` as a detached subprocess on
        the host. Returns: { "spawned": bool, "cmd": str, "note": str,
        "error"?: str }

Cache TTL is 300s by default — override via NOTEBOOKLM_AUTH_CHECK_TTL.
"""
from __future__ import annotations

import asyncio
import logging
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

_CACHE_TTL_SECONDS = float(os.environ.get("NOTEBOOKLM_AUTH_CHECK_TTL", "300"))

# Module-level cache. Single-process — a separate worker will have its
# own cache instance. That's fine; staleness is bounded by TTL.
_cached_status: Optional[dict] = None
_cached_at: float = 0.0


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _probe() -> dict:
    """
    Probe NotebookLM auth by attempting `from_storage()`. The wrapper's
    own auth verification raises ValueError("Authentication expired or
    invalid...") when the cookie session is dead.
    """
    try:
        from notebooklm import NotebookLMClient
    except ImportError as e:
        return {
            "status": "missing",
            "details": f"notebooklm-py is not installed: {e}",
        }

    try:
        client_instance = await NotebookLMClient.from_storage()
        # Don't actually open the client — just verifying credentials load.
        # The from_storage() call itself raises on expired auth.
        return {
            "status": "valid",
            "details": "Cookies loaded and verified.",
        }
    except FileNotFoundError as e:
        return {
            "status": "missing",
            "details": f"No saved cookies — has `notebooklm login` been run? ({e})",
        }
    except ValueError as e:
        msg = str(e)
        if "expired" in msg.lower() or "invalid" in msg.lower():
            return {
                "status": "expired",
                "details": "Session cookies expired. Re-run `notebooklm login`.",
            }
        return {"status": "unknown", "details": msg}
    except Exception as e:
        logger.exception("auth probe failed unexpectedly")
        return {"status": "unknown", "details": f"{type(e).__name__}: {e}"}


def _cache_lookup(force: bool) -> Optional[dict]:
    """Return cached result if still fresh, else None."""
    if force or _cached_status is None:
        return None
    age = time.monotonic() - _cached_at
    if age >= _CACHE_TTL_SECONDS:
        return None
    return {**_cached_status, "cached": True, "cache_age_seconds": round(age, 1)}


def _cache_store(result: dict) -> None:
    global _cached_status, _cached_at
    _cached_status = result
    _cached_at = time.monotonic()


async def check_auth_status_async(force: bool = False) -> dict:
    """
    Async-context auth health check. Use this from inside an existing event
    loop (e.g. the worker's `_run_once`). Awaits `_probe` directly so we
    don't trip the "asyncio.run() cannot be called from a running event loop"
    guard.
    """
    cached = _cache_lookup(force)
    if cached is not None:
        return cached

    result = await _probe()
    result["checked_at"] = _now_iso()
    result["cached"] = False
    _cache_store(result)
    return result


def check_auth_status(force: bool = False) -> dict:
    """
    Check NotebookLM auth, with caching. Synchronous wrapper for callers
    that are NOT inside an event loop (Flask request handlers, CLI scripts).

    If you're inside an async context, call `check_auth_status_async` instead
    — calling this from a running loop will return a `status=unknown` stub
    rather than crashing.

    Pass force=True to bypass the cache (used after a successful re-login).
    """
    cached = _cache_lookup(force)
    if cached is not None:
        return cached

    try:
        result = asyncio.run(_probe())
    except RuntimeError as e:
        # If we're already inside an event loop (e.g. async caller), surface a hint
        if "asyncio.run() cannot be called" in str(e):
            return {
                "status": "unknown",
                "checked_at": _now_iso(),
                "details": "auth probe must run from sync context — use check_auth_status_async()",
                "cached": False,
            }
        raise

    result["checked_at"] = _now_iso()
    result["cached"] = False
    _cache_store(result)
    return result


def invalidate_cache() -> None:
    """Force the next check_auth_status call to actually probe."""
    global _cached_status, _cached_at
    _cached_status = None
    _cached_at = 0.0


# Module-level handle to the in-flight `notebooklm login` subprocess.
# Single-user dev workflow — only one re-auth in flight at a time.
_relogin_proc: subprocess.Popen | None = None


def _relogin_alive() -> bool:
    """True if there's a re-auth subprocess that's still running."""
    return _relogin_proc is not None and _relogin_proc.poll() is None


def spawn_relogin() -> dict:
    """
    Spawn `notebooklm login` as a *detached* subprocess that outlives this
    Python invocation. The subprocess will:
      1. Open a Playwright-controlled Chromium window for Google sign-in.
      2. Block on its own stdin waiting for ENTER (the CLI's confirmation prompt).
      3. Save cookies on ENTER and exit cleanly.

    On Windows we use `CREATE_NEW_CONSOLE` so the subprocess gets its own
    visible cmd window. The user interacts with that window directly —
    presses ENTER there after completing sign-in. This avoids the cross-
    process IPC headache of trying to pipe ENTER from a short-lived parent.

    On POSIX we don't have a clean "open a new terminal" primitive (the
    answer varies per terminal emulator), so we return guidance telling
    the user to run the command manually in their own terminal.

    Either way, the Settings UI auto-polls auth status; when the cookies
    land on disk the badge flips to "Connected" without further button
    clicks.
    """
    py = sys.executable or "python"
    cmd = [py, "-m", "notebooklm", "login"]

    try:
        if os.name == "nt":
            # CREATE_NEW_CONSOLE = 0x00000010 — child gets its own console window
            CREATE_NEW_CONSOLE = 0x00000010
            subprocess.Popen(
                cmd,
                creationflags=CREATE_NEW_CONSOLE,
                close_fds=True,
            )
            invalidate_cache()
            return {
                "spawned": True,
                "cmd": " ".join(cmd),
                "platform": "windows",
                "note": (
                    "A new command window opened. Complete the Google sign-in "
                    "in the Chromium window that appears, then press ENTER in "
                    "the command window to save the session. The Settings "
                    "card will auto-refresh."
                ),
            }
        else:
            # POSIX: surface instructions instead of pretending to spawn.
            return {
                "spawned": False,
                "cmd": " ".join(cmd),
                "platform": "posix",
                "note": (
                    "Open a terminal, activate the Job Matrix Python venv, "
                    "and run the command above. Press ENTER after completing "
                    "Google sign-in. Then refresh the Settings card."
                ),
            }
    except Exception as e:
        logger.exception("failed to spawn notebooklm login")
        return {"spawned": False, "cmd": " ".join(cmd), "error": str(e)}


def confirm_relogin(timeout_seconds: float = 30.0) -> dict:
    """
    Feed ENTER to the in-flight `notebooklm login` subprocess and wait for
    it to exit, signalling cookie save is complete.

    Returns: { confirmed: bool, exit_code: int|None, output: str, error?: str }

    Call this from the UI ONLY after the user has actually completed the
    Google sign-in in the launched browser.
    """
    global _relogin_proc

    if _relogin_proc is None:
        return {
            "confirmed": False,
            "error": "No re-auth in progress. Click 'Re-authenticate' first.",
        }
    if _relogin_proc.poll() is not None:
        # Already exited
        out = _read_remaining(_relogin_proc)
        code = _relogin_proc.returncode
        _relogin_proc = None
        invalidate_cache()
        return {
            "confirmed": True,
            "exit_code": code,
            "output": out,
            "note": "Subprocess had already exited before confirm. "
                    "Cookies state may or may not be saved — check status.",
        }

    try:
        # Write the ENTER the CLI is waiting for, then wait for exit.
        try:
            _relogin_proc.stdin.write(b"\n")
            _relogin_proc.stdin.flush()
            _relogin_proc.stdin.close()
        except (BrokenPipeError, OSError) as e:
            logger.warning("stdin write failed (process may have already exited): %s", e)

        try:
            _relogin_proc.wait(timeout=timeout_seconds)
        except subprocess.TimeoutExpired:
            _relogin_proc.kill()
            _relogin_proc.wait(timeout=2)
            out = _read_remaining(_relogin_proc)
            _relogin_proc = None
            invalidate_cache()
            return {
                "confirmed": False,
                "exit_code": None,
                "output": out,
                "error": f"Login subprocess didn't finish within {timeout_seconds:.0f}s "
                         f"after ENTER. Killed it.",
            }

        out = _read_remaining(_relogin_proc)
        code = _relogin_proc.returncode
        _relogin_proc = None
        invalidate_cache()
        return {
            "confirmed": code == 0,
            "exit_code": code,
            "output": out,
        }
    except Exception as e:
        logger.exception("confirm_relogin failed")
        return {"confirmed": False, "error": str(e)}


def _read_remaining(proc: subprocess.Popen) -> str:
    """Drain whatever's in the subprocess's stdout pipe — best-effort, non-blocking."""
    try:
        if proc.stdout is None:
            return ""
        # Set non-blocking would be ideal but cross-platform on Windows is messy.
        # Since the process has exited (or we're about to abandon), readall is safe.
        data = proc.stdout.read()
        if isinstance(data, bytes):
            return data.decode("utf-8", errors="replace")
        return data or ""
    except Exception:
        return ""


def relogin_status() -> dict:
    """Lightweight probe: is a re-auth in flight, exited, or absent?"""
    global _relogin_proc
    if _relogin_proc is None:
        return {"in_flight": False, "exited": False}
    code = _relogin_proc.poll()
    if code is None:
        return {"in_flight": True, "exited": False, "pid": _relogin_proc.pid}
    # Already exited but no one has called confirm yet — surface it.
    return {"in_flight": False, "exited": True, "exit_code": code}
