@echo off
REM ---------------------------------------------------------------
REM  Monster World - Phone Preview Server
REM  Starts a local HTTP server bound to 0.0.0.0 so a phone on the
REM  same Wi-Fi can open the game by typing the printed URL.
REM ---------------------------------------------------------------
chcp 65001 > nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo ================================================================
echo   Monster World - Phone Preview Server
echo ================================================================
echo.
echo  Make sure your phone and this PC are on the SAME Wi-Fi.
echo.

REM Detect python (or fallback to py launcher)
set "PY="
where python >nul 2>&1 && set "PY=python"
if not defined PY where py >nul 2>&1 && set "PY=py -3"
if not defined PY (
  echo  ERROR: Python not found in PATH.
  echo  Install Python 3 from https://www.python.org/ then re-run.
  pause
  exit /b 1
)

echo  Possible URLs to open on your phone:
echo.
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /R /C:"IPv4"') do (
  set "ip=%%a"
  set "ip=!ip: =!"
  echo      http://!ip!:8765
)
echo.
echo  On this PC: http://localhost:8765
echo.
echo  Tip: if the phone can't connect, allow Python through
echo  Windows Defender Firewall when prompted ^("Allow access"^).
echo.
echo  Press Ctrl+C to stop the server.
echo ================================================================
echo.

%PY% -m http.server 8765 --bind 0.0.0.0

echo.
echo Server stopped.
pause
