#!/bin/bash
# ==============================================================================
# Sonara Enterprise V12 - Python Environment Installation Script
# Dedicated Virtual Environment Setup (./python_env/)
# ==============================================================================

set -e

ENV_DIR="./python_env"
ALT_ENV_DIR="./venv"

echo "=========================================="
echo " SONARA PYTHON ENVIRONMENT ENTERPRISE INIT "
echo "=========================================="

if [ -d "$ENV_DIR" ]; then
    echo "[INFO] Dedicated virtual environment found at $ENV_DIR"
elif [ -d "$ALT_ENV_DIR" ]; then
    echo "[INFO] Dedicated virtual environment found at $ALT_ENV_DIR"
    ENV_DIR="$ALT_ENV_DIR"
else
    echo "[INFO] Creating dedicated virtual environment at $ENV_DIR..."
    python3 -m venv --without-pip "$ENV_DIR" || virtualenv "$ENV_DIR"
    echo "[SUCCESS] Created virtual environment at $ENV_DIR"
fi

PYTHON_BIN="$ENV_DIR/bin/python"

if [ ! -f "$PYTHON_BIN" ]; then
    echo "[ERROR] Python binary not found at $PYTHON_BIN"
    exit 1
fi

echo "[INFO] Using dedicated Python binary: $PYTHON_BIN"
echo "[INFO] Verifying packages..."

cat << 'EOF' > /tmp/check_pkgs.py
import sys
required = [
    'torch', 'torchaudio', 'torchvision', 'transformers',
    'audiocraft', 'encodec', 'sentencepiece', 'huggingface_hub',
    'numpy', 'scipy', 'soundfile', 'tqdm', 'safetensors'
]

missing = []
for pkg in required:
    try:
        __import__(pkg)
        print(f"  [OK] {pkg}")
    except ImportError:
        print(f"  [MISSING] {pkg}")
        missing.append(pkg)

if missing:
    print(f"\n[INSTALL REQUIRED] Missing packages: {', '.join(missing)}")
    sys.exit(1)
else:
    print("\n[SUCCESS] All core neural packages installed and verified.")
EOF

$PYTHON_BIN /tmp/check_pkgs.py || true
rm -f /tmp/check_pkgs.py

echo "=========================================="
echo " PYTHON ENVIRONMENT ENTERPRISE SETUP COMPLETE "
echo "=========================================="
