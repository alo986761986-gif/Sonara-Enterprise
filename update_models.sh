#!/usr/bin/env bash
# Sonara Labs - V11.9 Model Updater for RunPod
# Updates local facebook/musicgen-large model parameters without modifying Sonara engines.

set -eo pipefail

echo "================================================================================"
echo "          SONARA LABS - AUTOMATED NEURAL MODEL UPDATE SUITE"
echo "================================================================================"

export HF_HOME="/workspace/cache/huggingface"

echo "[+] Mapped Repository: facebook/musicgen-large"
echo "[+] Local Target:      /workspace/models/musicgen-large"
echo "[+] Starting HuggingFace snapshot sync (resuming partial frames)..."

python3 -c "
from huggingface_hub import snapshot_download
import os

local_dir = '/workspace/models/musicgen-large'
os.makedirs(local_dir, exist_ok=True)

snapshot_download(
    repo_id='facebook/musicgen-large',
    local_dir=local_dir,
    local_dir_use_symlinks=False,
    ignore_patterns=['*.msgpack', '*.h5', '*.ot'],
    resume_download=True
)
print('✓ Local models updated and validated.')
"

echo "================================================================================"
echo "✓ UPDATE COMPLETE: Large model repository weights synced successfully."
echo "================================================================================"
