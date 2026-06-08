@echo off
REM ----------------------------------------------------------------
REM  install-ai-art.bat
REM  AIで生成した画像を assets\monsters\raw\ に入れて このBATを実行すると、
REM  512x512 PNG にリサイズして assets\monsters\<id>.png に配置する。
REM  ASCII content + %~dp0 anchor (日本語パス対策)
REM ----------------------------------------------------------------
chcp 65001 > nul
setlocal

set "PS_SCRIPT=%~dp0install-ai-art.ps1"

echo.
echo ================================================================
echo   AI モンスター画像 インストーラ
echo ================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%"

echo.
pause
