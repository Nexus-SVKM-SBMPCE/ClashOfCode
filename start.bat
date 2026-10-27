@echo off
setlocal enabledelayedexpansion
title Code Clash — Local Arena Launcher
cd /d "%~dp0"

echo ===================================================
echo       CODE CLASH — LOCAL ARENA STARTUP SCRIPT       
echo ===================================================
echo.

:: --------------------------------------------------
:: 1. Docker & Judge0 Isolation Check (Non-blocking)
:: --------------------------------------------------
echo [1/4] Checking Docker status...
where docker >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] Docker is not installed on this system.
    echo [INFO] Skipping Judge0 execution engine.
    echo [INFO] Arena will start in native / offline mode without container isolation.
) else (
    docker info >nul 2>nul
    if %errorlevel% neq 0 (
        echo [WARN] Docker is installed but Docker Desktop / daemon is not running.
        echo [WARN] Skipping Judge0 containers. Starting backend and frontend in local mode.
    ) else (
        echo [OK] Docker daemon is running.
        if exist "judge0\docker-compose.yml" (
            echo [INFO] Starting Judge0 containers in background...
            cd judge0
            docker compose up -d >nul 2>nul
            cd ..
            echo [OK] Judge0 containers launched.
        )
    )
)
echo.

:: --------------------------------------------------
:: 2. Python Virtual Environment & Backend Packages
:: --------------------------------------------------
echo [2/4] Checking Python environment and backend packages...
if not exist "backend\.venv\Scripts\activate.bat" (
    echo [INFO] Creating Python virtual environment in .venv...
    python -m venv .venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment. Ensure Python is in your PATH.
        pause
        exit /b 1
    )
)

call backend\.venv\Scripts\activate.bat
echo [OK] Virtual environment activated.

echo [INFO] Verifying backend dependencies (backend\requirements.txt)...
pip install -r backend\requirements.txt --quiet
if %errorlevel% neq 0 (
    echo [WARN] pip install encountered an issue, retrying with verbose output...
    pip install -r backend\requirements.txt
) else (
    echo [OK] Backend dependencies are up to date.
)
echo.

:: --------------------------------------------------
:: 3. Node.js & Frontend Packages
:: --------------------------------------------------
echo [3/4] Checking Node.js environment and frontend packages...
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] npm is not found in PATH! Node.js is required to run the frontend.
    pause
    exit /b 1
)

cd frontend
echo [INFO] Verifying frontend dependencies (frontend\package.json)...
call npm install --silent
if %errorlevel% neq 0 (
    echo [WARN] npm install encountered an issue, retrying...
    call npm install
) else (
    echo [OK] Frontend dependencies are up to date.
)
cd ..
echo.

:: --------------------------------------------------
:: 4. Resolve Local LAN IP Address
:: --------------------------------------------------
set "LAN_IP="
for /f "tokens=*" %%a in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi*','Ethernet*' -ErrorAction SilentlyContinue | Where-Object {$_.IPAddress -notlike '127*' -and $_.IPAddress -notlike '169.254*'}).IPAddress | Select-Object -First 1"') do (
    set "LAN_IP=%%a"
)
if "!LAN_IP!"=="" set "LAN_IP=127.0.0.1"

echo ===================================================
echo               ARENA NETWORK ACCESS                 
echo ===================================================
echo  Host (This Machine):  http://localhost:5173
echo  LAN (Other Machines): http://!LAN_IP!:5173
echo  Backend API Docs:     http://!LAN_IP!:8000/docs
echo ===================================================
echo.

:: --------------------------------------------------
:: 5. Launch Backend & Frontend Services
:: --------------------------------------------------
echo [4/4] Starting Arena services...

echo Starting Backend Server on 0.0.0.0:8000...
start "CodeClash Backend [:8000]" cmd /k "cd /d "%~dp0backend" && call .venv\Scripts\activate.bat && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"

echo Starting Frontend Server on 0.0.0.0:5173...
start "CodeClash Frontend [:5173]" cmd /k "cd /d "%~dp0frontend" && npm run dev -- --host 0.0.0.0"

echo.
echo Both servers have been launched in dedicated terminal windows.
echo Opening browser to http://localhost:5173 ...
timeout /t 3 >nul
start http://localhost:5173

echo.
echo To stop the arena, close the Backend and Frontend terminal windows.
pause
