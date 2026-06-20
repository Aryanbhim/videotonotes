"""
VideoToNotes Desktop Launcher
─────────────────────────────
• Checks for OpenCode CLI; if missing, auto-downloads from GitHub
• Starts the OpenCode inference server on :4096
• Starts FastAPI backend on :8000
• Opens the web app in the default browser
• Works as a plain .py AND as a PyInstaller-frozen .exe
"""

import json
import multiprocessing
import os
import shutil
import socket
import ssl
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
import webbrowser
import zipfile

# SSL context that skips verification — safe for known GitHub URLs
# (needed because PyInstaller frozen exes lack the system CA bundle)
_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE

# ── Base directory (frozen exe or plain script) ──────────────────────────────
if getattr(sys, "frozen", False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

# Where we store our own copy of the opencode binary
OPENCODE_DIR  = os.path.join(BASE_DIR, "opencode")
OPENCODE_EXE  = os.path.join(OPENCODE_DIR, "opencode.exe")

# GitHub API — correct repo is anomalyco/opencode (mirrors sst/opencode)
GITHUB_API_URLS = [
    "https://api.github.com/repos/anomalyco/opencode/releases/latest",
    "https://api.github.com/repos/sst/opencode/releases/latest",
]

# Hardcoded fallback download URLs (direct exe, no zip extraction needed)
# These are updated to the latest known working release
FALLBACK_WIN_URLS = [
    # Windows x64 CLI zip (contains opencode.exe)
    "https://github.com/anomalyco/opencode/releases/latest/download/opencode-windows-x64.zip",
    # Windows x64 desktop exe (can also run serve --port)
    "https://github.com/anomalyco/opencode/releases/latest/download/opencode-desktop-win-x64.exe",
    # Specific known-good version as last resort
    "https://github.com/anomalyco/opencode/releases/download/v1.17.7/opencode-windows-x64.zip",
]

# Asset names to look for in the GitHub release (in priority order)
WIN_ASSET_NAMES = [
    "opencode-windows-x64.zip",
    "opencode-win-x64.zip",
    "opencode-windows-x86_64.zip",
]

# ── Console colors ────────────────────────────────────────────────────────────
CYAN   = "\033[96m"
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

def banner():
    os.system("cls" if os.name == "nt" else "clear")
    print(f"""{CYAN}{BOLD}
  ╔══════════════════════════════════════════════╗
  ║        VideoToNotes — Desktop Launcher       ║
  ║     AI-Powered YouTube Summarizer & Chat     ║
  ╚══════════════════════════════════════════════╝{RESET}
""")

def info(msg):  print(f"  {CYAN}[•]{RESET} {msg}")
def ok(msg):    print(f"  {GREEN}[✓]{RESET} {msg}")
def warn(msg):  print(f"  {YELLOW}[!]{RESET} {msg}")
def err(msg):   print(f"  {RED}[✗]{RESET} {msg}")


class Spinner:
    def __init__(self, label: str):
        self.label = label
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._spin, daemon=True)

    def _spin(self):
        frames = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"]
        i = 0
        while not self._stop.is_set():
            print(f"\r  {CYAN}{frames[i % len(frames)]}{RESET} {self.label} …", end="", flush=True)
            i += 1
            time.sleep(0.1)

    def __enter__(self):
        self._thread.start()
        return self

    def __exit__(self, *_):
        self._stop.set()
        self._thread.join()
        print("\r" + " " * (len(self.label) + 10) + "\r", end="")


# ── Network helpers ───────────────────────────────────────────────────────────

def is_port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) != 0


def _download_via_powershell(url: str, dest_path: str) -> bool:
    """
    Download using PowerShell's Invoke-WebRequest.
    Uses Windows' native certificate store — always works on Windows.
    Returns True on success.
    """
    try:
        result = subprocess.run(
            [
                "powershell", "-NoProfile", "-NonInteractive", "-Command",
                f"[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;"
                f"Invoke-WebRequest -Uri '{url}' -OutFile '{dest_path}' "
                f"-UseBasicParsing -TimeoutSec 120"
            ],
            capture_output=True,
            text=True,
            timeout=180,
        )
        return result.returncode == 0 and os.path.isfile(dest_path) and os.path.getsize(dest_path) > 0
    except Exception:
        return False


def _download_via_urllib(url: str, dest_path: str) -> bool:
    """
    Download using urllib with SSL verification disabled.
    Fallback for when PowerShell is unavailable.
    """
    try:
        headers = {"User-Agent": "VideoToNotes-Launcher/1.0"}
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=120, context=_SSL_CTX) as resp:
            with open(dest_path, "wb") as f:
                while True:
                    data = resp.read(65536)
                    if not data:
                        break
                    f.write(data)
        return os.path.isfile(dest_path) and os.path.getsize(dest_path) > 0
    except Exception:
        return False


def download_with_progress(url: str, dest_path: str, label: str = "Downloading"):
    """
    Download a file to dest_path.
    Tries PowerShell first (uses Windows cert store), then urllib with SSL bypass.
    Shows a simple progress indicator.
    """
    print(f"  {CYAN}[↓]{RESET} {label} …", flush=True)

    # Method 1: PowerShell (most reliable on Windows — uses native cert store)
    if _download_via_powershell(url, dest_path):
        mb = os.path.getsize(dest_path) / 1_048_576
        print(f"  {GREEN}[✓]{RESET} Downloaded {mb:.1f} MB")
        return

    # Method 2: urllib with SSL verification disabled
    if _download_via_urllib(url, dest_path):
        mb = os.path.getsize(dest_path) / 1_048_576
        print(f"  {GREEN}[✓]{RESET} Downloaded {mb:.1f} MB")
        return

    raise RuntimeError(f"Failed to download from {url}")


def get_latest_windows_download_url() -> tuple[str, bool]:
    """
    Query the GitHub API for the latest release and return
    (download_url, is_zip). Tries multiple API endpoints.
    Returns (url, is_zip) where is_zip=False means it's a direct .exe.
    """
    headers = {"User-Agent": "VideoToNotes-Launcher/1.0"}

    for api_url in GITHUB_API_URLS:
        try:
            req = urllib.request.Request(api_url, headers=headers)
            # Use SSL-bypass context so frozen exe can reach GitHub
            with urllib.request.urlopen(req, timeout=15, context=_SSL_CTX) as resp:
                data = json.loads(resp.read())

            assets = data.get("assets", [])
            asset_map = {a["name"]: a["browser_download_url"] for a in assets}

            # Try zip assets first (preferred — contains CLI binary)
            for name in WIN_ASSET_NAMES:
                if name in asset_map:
                    return asset_map[name], True

            # Fall back to desktop exe
            for name in ["opencode-desktop-win-x64.exe", "opencode-desktop-win-arm64.exe"]:
                if name in asset_map:
                    return asset_map[name], False

            # Construct URL from tag
            tag = data.get("tag_name", "")
            if tag:
                return (
                    f"https://github.com/anomalyco/opencode/releases/download/{tag}/opencode-windows-x64.zip",
                    True
                )
        except Exception:
            continue

    raise RuntimeError("Could not reach GitHub API")


# ── OpenCode installation ─────────────────────────────────────────────────────

def find_opencode() -> str | None:
    """Return path to opencode.exe if already available."""
    # 1. Our bundled copy (highest priority)
    if os.path.isfile(OPENCODE_EXE):
        return OPENCODE_EXE

    # 2. System PATH
    found = shutil.which("opencode")
    if found:
        return found

    # 3. Common WinGet locations
    for candidate in [
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Links\opencode.exe"),
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\opencode\opencode.exe"),
        r"C:\Program Files\opencode\opencode.exe",
    ]:
        if os.path.isfile(candidate):
            return candidate

    return None


def install_opencode_from_github() -> str:
    """
    Download OpenCode for Windows from GitHub (tries API then hardcoded URLs).
    Returns path to the installed opencode.exe.
    """
    os.makedirs(OPENCODE_DIR, exist_ok=True)

    # Strategy 1: Query GitHub API for latest release URL
    download_url = None
    is_zip = True
    try:
        info("Fetching latest OpenCode release info …")
        download_url, is_zip = get_latest_windows_download_url()
        info(f"Found: {download_url.split('/')[-1]}")
    except Exception as exc:
        warn(f"GitHub API unavailable ({exc}), using fallback URLs …")

    # Strategy 2: Try hardcoded fallback URLs
    urls_to_try = []
    if download_url:
        urls_to_try.append((download_url, is_zip))
    for url in FALLBACK_WIN_URLS:
        urls_to_try.append((url, url.endswith(".zip")))

    last_err = None
    for url, try_zip in urls_to_try:
        fname = url.split("/")[-1]
        tmp_path = os.path.join(tempfile.gettempdir(), fname)
        try:
            info(f"Downloading {fname} …")
            download_with_progress(url, tmp_path, label="OpenCode")

            if try_zip:
                _extract_opencode_zip(tmp_path)
            else:
                # Direct exe download — just copy it
                shutil.copy2(tmp_path, OPENCODE_EXE)

            if os.path.isfile(OPENCODE_EXE):
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass
                return OPENCODE_EXE

        except Exception as exc:
            last_err = exc
            warn(f"Failed ({exc}), trying next source …")
            try:
                os.remove(tmp_path)
            except Exception:
                pass
            continue

    raise RuntimeError(f"All download sources failed. Last error: {last_err}")


def _extract_opencode_zip(zip_path: str):
    """Extract opencode binary from a zip file into OPENCODE_DIR."""
    with zipfile.ZipFile(zip_path, "r") as zf:
        names = zf.namelist()
        # Find any .exe or extensionless binary named opencode
        candidates = [
            n for n in names
            if os.path.basename(n).lower() in ("opencode.exe", "opencode")
               and not n.endswith("/")
        ]
        if candidates:
            target = candidates[0]
            with zf.open(target) as src, open(OPENCODE_EXE, "wb") as dst:
                shutil.copyfileobj(src, dst)
        else:
            # Extract all and search
            zf.extractall(OPENCODE_DIR)
            for root, _, files in os.walk(OPENCODE_DIR):
                for fname in files:
                    if fname.lower() in ("opencode.exe", "opencode"):
                        found = os.path.join(root, fname)
                        if found != OPENCODE_EXE:
                            shutil.move(found, OPENCODE_EXE)
                        break


def ensure_opencode() -> str:
    """Guarantee OpenCode is available; auto-install if not. Returns exe path."""
    exe = find_opencode()
    if exe:
        ok(f"OpenCode CLI found: {exe}")
        return exe

    print()
    warn("OpenCode CLI is not installed — downloading automatically …")
    print()

    try:
        exe = install_opencode_from_github()
        ok(f"OpenCode CLI ready: {exe}")
        return exe
    except Exception as exc:
        print()
        err(f"Auto-download failed: {exc}")
        print()
        warn("Trying WinGet fallback …")
        if shutil.which("winget"):
            try:
                result = subprocess.run(
                    ["winget", "install", "--id", "SST.opencode",
                     "--silent", "--accept-source-agreements", "--accept-package-agreements"],
                    capture_output=True, text=True
                )
                if result.returncode == 0:
                    time.sleep(3)
                    exe = find_opencode()
                    if exe:
                        ok(f"OpenCode installed via WinGet: {exe}")
                        return exe
            except Exception:
                pass

        err("Could not install OpenCode automatically.")
        err("Please install it manually from:  https://opencode.ai")
        print()
        input("  Press Enter to exit …")
        sys.exit(1)


# ── FastAPI child process ─────────────────────────────────────────────────────

def _run_fastapi():
    os.chdir(BASE_DIR)
    if BASE_DIR not in sys.path:
        sys.path.insert(0, BASE_DIR)
    import uvicorn
    from main import app  # noqa: F401
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    multiprocessing.freeze_support()
    
    # Detect if running from Windows Temp directory (which happens when double-clicking inside a ZIP)
    if getattr(sys, "frozen", False):
        if "temp" in BASE_DIR.lower() or "appdata\\local\\temp" in BASE_DIR.lower():
            import ctypes
            ctypes.windll.user32.MessageBoxW(
                0,
                "Please extract the ZIP archive fully before running VideoToNotes.\n\nRunning directly from a ZIP file is not supported and will cause files/dependencies to be missing.",
                "VideoToNotes - Extract ZIP First",
                0x10 | 0x0  # MB_ICONERROR | MB_OK
            )
            sys.exit(1)

    banner()

    # 1. Ensure OpenCode is installed (auto-downloads if missing)
    opencode_exe = ensure_opencode()
    print()

    # 2. Start OpenCode inference server on :4096
    if is_port_free(4096):
        info("Starting OpenCode AI inference server on :4096 …")
        try:
            subprocess.Popen(
                [opencode_exe, "serve", "--port", "4096"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
            ok("OpenCode server started.")
        except Exception as exc:
            warn(f"Could not start OpenCode server: {exc}")
    else:
        ok("OpenCode server already running on :4096.")

    # 3. Start FastAPI / uvicorn on :8000
    if is_port_free(8000):
        info("Starting VideoToNotes web server on :8000 …")
        server_proc = multiprocessing.Process(target=_run_fastapi, daemon=True)
        server_proc.start()
    else:
        ok("VideoToNotes web server already running on :8000.")
        server_proc = None

    # 4. Wait for server ready (max 20 s)
    with Spinner("Waiting for server to start"):
        for _ in range(40):
            time.sleep(0.5)
            if not is_port_free(8000):
                break

    ok("Server is ready!")
    print()

    # 5. Open browser
    info("Opening VideoToNotes in your browser …")
    webbrowser.open("http://127.0.0.1:8000")

    print(f"""
  {GREEN}{BOLD}VideoToNotes is running!{RESET}
  {CYAN}→  http://127.0.0.1:8000{RESET}

  Close this window to stop the application.
""")

    # 6. Keep alive
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print(f"\n  {YELLOW}Shutting down …{RESET}")
        if server_proc and server_proc.is_alive():
            server_proc.terminate()
        print(f"  {GREEN}Goodbye!{RESET}\n")


if __name__ == "__main__":
    main()
