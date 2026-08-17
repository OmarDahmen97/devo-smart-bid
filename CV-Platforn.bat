@echo off
REM file: start-all.bat (racine C:\cv-platform)

set PROJECT_ROOT=%~dp0

echo Stopping any existing backend/frontend...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do (
    taskkill /PID %%p /F >nul 2>&1
)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
    taskkill /PID %%p /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

echo Starting backend...
start "Backend" cmd /k "cd /d "%PROJECT_ROOT%" && .venv\Scripts\activate && uvicorn app.api:app --reload --host 127.0.0.1 --port 8000"

echo Starting frontend...
start "Frontend" cmd /k "cd /d "%PROJECT_ROOT%frontend" && npm run dev"

timeout /t 2 /nobreak >nul
echo Both services launching in separate windows.