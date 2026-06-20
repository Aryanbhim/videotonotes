@echo off
title VideoToNotes — Build Script
cd /d "%~dp0"

echo ================================================
echo   VideoToNotes — Windows Desktop Builder
echo ================================================
echo.

:: ── 1. Check Python ──────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Please install Python 3.11+ from https://python.org
    pause & exit /b 1
)

:: ── 2. Install / upgrade build tools ─────────────
echo [Step 1/4] Installing build dependencies ...
pip install --quiet --upgrade pyinstaller pyinstaller-hooks-contrib
pip install --quiet -r requirements.txt
echo  Done.
echo.

:: ── 3. Run PyInstaller ───────────────────────────
echo [Step 2/4] Building .exe with PyInstaller ...
python -m PyInstaller VideoToNotes.spec --noconfirm --clean
if errorlevel 1 (
    echo [ERROR] PyInstaller build failed. See output above.
    pause & exit /b 1
)
echo  Done.
echo.

:: ── 4. Copy optional config files into dist ──────
echo [Step 3/4] Copying config files ...
if exist ".env" (
    copy /Y ".env" "dist\VideoToNotes\.env" >nul
    echo  Copied .env
)
echo  Done.
echo.

:: ── 5. Zip the output folder ─────────────────────
echo [Step 4/4] Creating VideoToNotes-Setup.zip ...
if exist "VideoToNotes-Setup.zip" del "VideoToNotes-Setup.zip"

powershell -NoProfile -Command ^
    "Compress-Archive -Path 'dist\VideoToNotes\*' -DestinationPath 'VideoToNotes-Setup.zip' -Force"

if errorlevel 1 (
    echo [ERROR] Failed to create zip. Check PowerShell permissions.
    pause & exit /b 1
)

echo.
echo ================================================
echo  BUILD COMPLETE!
echo.
echo  Your distributable package:
echo    VideoToNotes-Setup.zip
echo.
echo  To install on any Windows PC:
echo    1. Extract VideoToNotes-Setup.zip anywhere
echo    2. Double-click VideoToNotes.exe
echo    3. App opens automatically in your browser!
echo ================================================
echo.
pause
