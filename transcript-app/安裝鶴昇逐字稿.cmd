@echo off
chcp 65001 >nul
title Install Crane Transcript
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
if errorlevel 1 (
  echo.
  echo Installation failed. Please keep this window and review the error above.
  pause
  exit /b 1
)
echo.
echo Installation completed.
pause
