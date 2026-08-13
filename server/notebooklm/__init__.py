"""
Job Matrix NotebookLM bridge.

Async Python wrapper around the unofficial `notebooklm-py` library, used to
generate the Studio outputs (Audio Overview, Video Overview, Infographic,
etc.) that power Job Matrix's briefing features — daily personal job
reports, weekly market summaries, and the personal-coach audio tracks.

Pre-requisite (one-time, on the host running the worker):
    pip install notebooklm-py
    notebooklm login

Modules:
    client.py      -- BriefingsClient: rate-limited async wrapper
    auth_check.py  -- session-cookie health check + relogin helper

Curated NotebookLM prompts live under: server/notebooklm/prompts/

NotebookLM has no official public API. The library this wraps reverse-
engineers the web app's session cookies. Be a good citizen: rate-limit
every call, never parallelize, and surface failures honestly.
"""

__version__ = "0.2.0-beta"
