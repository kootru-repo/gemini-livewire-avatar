@echo off
echo Killing old Python processes...
taskkill /F /IM python.exe /T 2>nul
timeout /t 2 /nobreak >nul

echo Starting backend...
start "Backend" cmd /k "cd /d %~dp0 && python backend\main.py"
timeout /t 3 /nobreak >nul

echo Starting frontend...
start "Frontend" cmd /k "cd /d %~dp0\frontend && python -m http.server 8000"

echo.
echo ========================================
echo Backend: ws://localhost:8080
echo Frontend: http://localhost:8000
echo ========================================
echo.
echo Press any key to close this window...
pause >nul
