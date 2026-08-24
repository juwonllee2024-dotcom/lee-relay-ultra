@echo off
echo === Lee Relay Ultra - starting server ===
if "%AGENT_CWD%"=="" set "AGENT_CWD=%~dp0"
if "%AGENT_TOKEN%"=="" set "AGENT_TOKEN=chatgpt-agent-local-v1"
cd /d "%~dp0\server"
call npm install
if errorlevel 1 (
  echo npm install failed. Check your Node.js installation.
  pause
  exit /b 1
)
echo.
echo Starting Ultra host on http://localhost:5747
echo (Keep this window open while using the agent.)
echo.
node server.js
pause
