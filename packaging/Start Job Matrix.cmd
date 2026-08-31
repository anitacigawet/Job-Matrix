@echo off
setlocal
cd /d "%~dp0"
title Job Matrix

set "JOB_MATRIX_NODE=%~dp0runtime\node.exe"
if not exist "%JOB_MATRIX_NODE%" (
  where node.exe >nul 2>&1
  if errorlevel 1 (
    echo.
    echo  Job Matrix needs Node.js 22.22.0 or newer.
    echo  Install the current Node.js 24 LTS from https://nodejs.org/ and try again.
    echo.
    pause
    exit /b 1
  )
  set "JOB_MATRIX_NODE=node.exe"
)

echo.
echo  Starting Job Matrix...
echo  Keep this window open while you use the program.
echo  Press Ctrl+C or close this window to stop it.
echo.

"%JOB_MATRIX_NODE%" "%~dp0start.mjs"
set "JOB_MATRIX_EXIT=%ERRORLEVEL%"

echo.
if not "%JOB_MATRIX_EXIT%"=="0" echo  Job Matrix stopped with error code %JOB_MATRIX_EXIT%.
if "%JOB_MATRIX_EXIT%"=="0" echo  Job Matrix has stopped.
echo.
pause
exit /b %JOB_MATRIX_EXIT%
