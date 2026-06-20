# VideoToNotes.spec
# PyInstaller spec file — run:  pyinstaller VideoToNotes.spec
#
# Produces:  dist\VideoToNotes\VideoToNotes.exe  (+ all support files)

import os
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

block_cipher = None

# ── Collect hidden imports ────────────────────────────────────────────────────
hidden = (
    collect_submodules("uvicorn")
    + collect_submodules("fastapi")
    + collect_submodules("starlette")
    + collect_submodules("pydantic")
    + collect_submodules("youtube_transcript_api")
    + collect_submodules("dotenv")
    + collect_submodules("multiprocessing")
    + [
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        "email.mime.text",
        "email.mime.multipart",
    ]
)

# ── Extra data files bundled alongside the exe ────────────────────────────────
datas = [
    # The entire static/ web-app folder
    ("static", "static"),
    # .env (optional — users can edit after install)
    (".env", "."),
]

# Also pull in any data files needed by collected packages
for pkg in ("uvicorn", "fastapi", "starlette"):
    datas += collect_data_files(pkg)

# ── Analysis ──────────────────────────────────────────────────────────────────
a = Analysis(
    ["bootstrap.py"],
    pathex=["."],
    binaries=[],
    datas=datas,
    hiddenimports=hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "numpy", "pandas", "PIL"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

# ── One-dir build (recommended — faster startup than onefile) ─────────────────
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="VideoToNotes",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,           # keep console visible so user sees server status
    icon=None,              # set to "static\\favicon.ico" if you want an icon
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="VideoToNotes",
)
