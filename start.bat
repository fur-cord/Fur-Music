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

if not exist .git (
    echo Initializing Git repository for updates...
    git init
    git remote add origin https://github.com/katt-dev/Katt-Music.git
    git branch -M main
)

echo Checking for updates...
git fetch origin main
git reset --hard origin/main
echo.

echo Launching browser in 3 seconds...
start /b cmd /c "timeout /t 3 >nul & start http://localhost:8000"

echo Starting Python server... (Keep this window open to run Katt-Music!)
echo.
python app.py

pause
