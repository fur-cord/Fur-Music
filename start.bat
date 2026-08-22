@echo off
title Katt-Music Server

cd /d "%~dp0"

:: ==========================================
:: SETTINGS
:: Set to 1 to automatically delete all downloaded music on startup
set CLEAR_CACHE_ON_STARTUP=0
:: ==========================================

if "%CLEAR_CACHE_ON_STARTUP%"=="1" (
    echo Clearing music cache ^(Opt-in enabled^)...
    if exist audio\ del /q audio\*.*
    echo Cache cleared!
    echo.
)

echo Installing/updating dependencies...
pip install -r requirements.txt -q
echo.

echo Checking for updates...
git pull origin main
echo.

echo Launching browser in 3 seconds...
start /b cmd /c "timeout /t 3 >nul & start http://localhost:8000"

echo Starting Python server... (Keep this window open to run Katt-Music!)
echo.
python app.py

pause
