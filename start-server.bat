@echo off
echo === ChatGPT Terminal Agent - starting server ===
cd /d "%~dp0\server"
call npm install
if errorlevel 1 (
  echo npm install failed. Check your Node.js installation.
  pause
  exit /b 1
)
echo.
echo Starting server on http://localhost:5747
echo (Keep this window open while using the agent.)
echo.
node server.js
pause
