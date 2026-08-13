@echo off
REM =====================================================================
REM  Job Matrix - Local Dev Server Launcher (Windows)
REM
REM  Double-click this file to start the dev server. Closing this window
REM  (X button) or pressing Ctrl+C will stop the server cleanly.
REM
REM  How it works:
REM    1. cd's into the directory containing this script
REM    2. Finds the first free port between PORT_START and PORT_END
REM    3. Hands it to `pnpm dev` via the PORT env var
REM    4. Stays in the foreground until the window closes
REM
REM  Reuse on another pnpm-based project: drop this file in that
REM  project's root and edit TITLE below. Nothing else needs to change.
REM =====================================================================

setlocal EnableDelayedExpansion

set "TITLE=Job Matrix"
set "PORT_START=3000"
set "PORT_END=3050"

REM Run from the directory containing this script, no matter where it
REM was launched from.
cd /d "%~dp0"

title %TITLE% - Local Dev Server

REM --- Find a free port -----------------------------------------------
set "PORT=%PORT_START%"
:checkport
netstat -ano | findstr "LISTENING" | findstr ":!PORT! " >nul 2>&1
if !errorlevel! equ 0 (
  set /a PORT=PORT+1
  if !PORT! gtr %PORT_END% (
    echo.
    echo  ERROR: no free port between %PORT_START% and %PORT_END%.
    echo.
    pause
    exit /b 1
  )
  goto checkport
)

echo.
echo  =============================================
echo    %TITLE% - Local Dev Server
echo  =============================================
echo.
echo    URL:  http://localhost:!PORT!/
echo.
echo    Close this window or press Ctrl+C to stop.
echo  ---------------------------------------------
echo.

REM PORT is exported to the dev server's environment.
call pnpm dev

endlocal
