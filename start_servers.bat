@echo off
title VideoToNotes Local Servers
cd /d "g:\videotonotes"

echo Starting OpenCode Local Inference Server...
start "OpenCode Server" cmd /c "opencode serve --port 4096"

echo Starting FastAPI Application Server...
start "FastAPI Web Server" cmd /c "python -m uvicorn main:app --host 127.0.0.1 --port 8000"

echo Local servers launched!
echo Opening standalone desktop app in 2 seconds...
timeout /t 2 /nobreak >nul
start msedge --app=http://127.0.0.1:8000
exit
