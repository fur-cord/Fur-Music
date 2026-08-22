@echo off
title Katt-Music Shutdown

cd /d "%~dp0"

:: ==========================================
:: SETTINGS
:: Set to 1 to automatically delete all downloaded music when stopping the server
set CLEAR_CACHE_ON_STOP=0
:: ==========================================

echo Shutting down Katt-Music Server...
taskkill /F /IM python.exe /T
echo Server Stopped!

if "%CLEAR_CACHE_ON_STOP%"=="1" (
    echo.
    echo Clearing music cache ^(Opt-in enabled^)...
    if exist audio\ del /q audio\*.*
    echo Cache cleared!
)

pause