@echo off
title VideoToNotes — Full Installer Builder
cd /d "%~dp0"
color 0A

echo.
echo  ================================================
echo    VideoToNotes — Full Installer Builder
echo  ================================================
echo.

:: ── STEP 1: Check Python ─────────────────────────────────────────────────────
echo  [1/5] Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python not found!
    echo.
    echo  Downloading and installing Python 3.12 automatically...
    powershell -NoProfile -Command ^
        "Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.12.9/python-3.12.9-amd64.exe' -OutFile '%TEMP%\python-installer.exe'"
    "%TEMP%\python-installer.exe" /quiet InstallAllUsers=0 PrependPath=1 Include_test=0
    if errorlevel 1 (
        echo  [ERROR] Python install failed. Please install from https://python.org
        pause & exit /b 1
    )
    echo  [OK] Python installed.
    :: Refresh PATH
    set "PATH=%LOCALAPPDATA%\Programs\Python\Python312;%LOCALAPPDATA%\Programs\Python\Python312\Scripts;%PATH%"
)
for /f "tokens=*" %%v in ('python --version 2^>^&1') do echo  [OK] %%v
echo.

:: ── STEP 2: Install Python packages ──────────────────────────────────────────
echo  [2/5] Installing Python packages...
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
pip install --quiet --upgrade pyinstaller pyinstaller-hooks-contrib
echo  [OK] All Python packages installed.
echo.

:: ── STEP 3: Build .exe with PyInstaller ──────────────────────────────────────
echo  [3/5] Building VideoToNotes.exe (this takes 1-2 minutes)...
python -m PyInstaller VideoToNotes.spec --noconfirm --clean
if errorlevel 1 (
    echo  [ERROR] PyInstaller build failed!
    pause & exit /b 1
)
echo  [OK] Exe built successfully.
echo.

:: ── STEP 4: Install Inno Setup (if not present) ──────────────────────────────
echo  [4/5] Checking Inno Setup compiler...
set "ISCC="
if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" (
    set "ISCC=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
)
if exist "C:\Program Files\Inno Setup 6\ISCC.exe" (
    set "ISCC=C:\Program Files\Inno Setup 6\ISCC.exe"
)

if not defined ISCC (
    echo  Inno Setup not found — installing via WinGet...
    winget install --id JRSoftware.InnoSetup --silent --accept-source-agreements --accept-package-agreements
    if errorlevel 1 (
        echo  WinGet failed. Trying direct download...
        powershell -NoProfile -Command ^
            "Invoke-WebRequest -Uri 'https://files.jrsoftware.org/is/6/innosetup-6.3.3.exe' -OutFile '%TEMP%\innosetup.exe'"
        "%TEMP%\innosetup.exe" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-
    )
    :: Try finding it again
    if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" (
        set "ISCC=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
    )
    if exist "C:\Program Files\Inno Setup 6\ISCC.exe" (
        set "ISCC=C:\Program Files\Inno Setup 6\ISCC.exe"
    )
)

if not defined ISCC (
    echo  [ERROR] Could not find Inno Setup. Falling back to ZIP output...
    goto :make_zip
)

echo  [OK] Inno Setup found: %ISCC%
echo.

:: ── STEP 5: Compile the installer ────────────────────────────────────────────
echo  [5/5] Compiling Windows Setup Installer...
if not exist "installer_output" mkdir "installer_output"
"%ISCC%" "VideoToNotes.iss"
if errorlevel 1 (
    echo  [ERROR] Inno Setup compilation failed! Falling back to ZIP...
    goto :make_zip
)
echo.
echo  ================================================
echo   BUILD COMPLETE!
echo.
echo   Installer: installer_output\VideoToNotes-Setup.exe
echo.
echo   Users can:
echo    1. Run VideoToNotes-Setup.exe
echo    2. Click Next → Install
echo    3. App appears on Desktop + Start Menu
echo    4. First launch auto-downloads OpenCode AI
echo  ================================================
echo.
pause
goto :eof

:make_zip
:: Fallback: create ZIP if Inno Setup fails
echo  [5/5] Creating ZIP package as fallback...
powershell -NoProfile -Command ^
    "Compress-Archive -Path 'dist\VideoToNotes\*' -DestinationPath 'VideoToNotes-Setup.zip' -Force"
echo.
echo  ================================================
echo   BUILD COMPLETE! (ZIP fallback)
echo.
echo   Package: VideoToNotes-Setup.zip
echo  ================================================
echo.
pause
