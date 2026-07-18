# PyInstaller spec for Career Tracker desktop app.
#
# Build (from the repo root, with the backend venv active):
#   pyinstaller build/career_tracker.spec --noconfirm
#
# Produces a single windowed executable in dist/ (CareerTracker.exe on Windows,
# CareerTracker.app on macOS). The built React frontend (frontend/dist) is
# bundled and served by the embedded FastAPI backend; see backend/desktop.py.
#
# NOTE: PyInstaller does not cross-compile — run this on Windows to get the .exe
# and on macOS to get the .app (the GitHub Actions matrix does both).

import os
import sys

from PyInstaller.utils.hooks import collect_submodules, collect_data_files, collect_all

PROJECT_ROOT = os.path.abspath(os.path.join(SPECPATH, ".."))
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
FRONTEND_DIST = os.path.join(PROJECT_ROOT, "frontend", "dist")

if not os.path.isdir(FRONTEND_DIST):
    raise SystemExit(
        "frontend/dist not found — run `npm run build` in frontend/ before packaging."
    )

# Bundle the built SPA (main.py reads it from sys._MEIPASS/frontend_dist when frozen).
datas = [(FRONTEND_DIST, "frontend_dist")]
datas += collect_data_files("webview")  # pywebview's bundled JS shims

# uvicorn/webview load parts of themselves lazily, so PyInstaller's static
# analysis misses them — pull the whole subpackages in explicitly.
hiddenimports = []
hiddenimports += collect_submodules("uvicorn")
hiddenimports += collect_submodules("webview")
hiddenimports += ["main", "bootstrap_ollama"]

# openai ships data files (e.g. tokenizer assets) that must travel with it.
openai_datas, openai_binaries, openai_hidden = collect_all("openai")
datas += openai_datas
hiddenimports += openai_hidden

# Optional app icon — only used if present (add build/icon.ico / build/icon.icns later).
_icon_ico = os.path.join(SPECPATH, "icon.ico")
_icon_icns = os.path.join(SPECPATH, "icon.icns")
if sys.platform == "darwin" and os.path.isfile(_icon_icns):
    icon = _icon_icns
elif sys.platform == "win32" and os.path.isfile(_icon_ico):
    icon = _icon_ico
else:
    icon = None


a = Analysis(
    [os.path.join(BACKEND_DIR, "desktop.py")],
    pathex=[BACKEND_DIR],
    binaries=openai_binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="CareerTracker",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,          # windowed app — no terminal window
    disable_windowed_traceback=False,
    icon=icon,
)

# On macOS, wrap the executable in a proper .app bundle so it launches from Finder.
if sys.platform == "darwin":
    app = BUNDLE(
        exe,
        name="CareerTracker.app",
        icon=icon,
        bundle_identifier="com.careertracker.app",
        info_plist={"NSHighResolutionCapable": True},
    )
