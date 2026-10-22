#!/usr/bin/env bash
set -Eeuo pipefail

MODEL="${ACESTEP_CONFIG_PATH:-acestep-v15-xl-turbo}"
LM_MODEL="${ACESTEP_LM_MODEL_PATH:-acestep-5Hz-lm-4B}"
PORT="${ACESTEP_API_PORT:-8001}"
ROOT="${ACESTEP_APP_ROOT:-/app}"
PERSIST_ROOT="/workspace/sonara-acestep"
CHECKPOINTS="${PERSIST_ROOT}/checkpoints"
OUTPUT="${PERSIST_ROOT}/output"

log() {
  printf '[SONARA RUNPOD] %s\n' "$*"
}

log "Preparing persistent SONARA ACE-Step XL-Turbo runtime"
mkdir -p "${CHECKPOINTS}" "${OUTPUT}"

# Keep checkpoints on RunPod persistent storage. If the image contains any
# initial checkpoint files, seed the persistent directory once before linking.
if [ -e "${ROOT}/checkpoints" ] && [ ! -L "${ROOT}/checkpoints" ]; then
  cp -an "${ROOT}/checkpoints/." "${CHECKPOINTS}/"
  mv "${ROOT}/checkpoints" "${ROOT}/checkpoints.pre-sonara-$(date +%s)"
fi
ln -sfn "${CHECKPOINTS}" "${ROOT}/checkpoints"

export ACESTEP_CONFIG_PATH="${MODEL}"
export ACESTEP_DEVICE="cuda"
export ACESTEP_INIT_LLM="true"
export ACESTEP_LM_MODEL_PATH="${LM_MODEL}"
export ACESTEP_USE_FLASH_ATTENTION="false"
export ACESTEP_OFFLOAD_TO_CPU="false"
export ACESTEP_OFFLOAD_DIT_TO_CPU="false"
export ACESTEP_LM_OFFLOAD_TO_CPU="false"
export ACESTEP_NO_INIT="false"
export ACESTEP_API_HOST="0.0.0.0"
export ACESTEP_API_PORT="${PORT}"
export ACESTEP_API_WORKERS="1"
export ACESTEP_QUEUE_WORKERS="1"
export ACESTEP_QUEUE_MAXSIZE="64"
export ACESTEP_DOWNLOAD_SOURCE="huggingface"
export ACESTEP_OUTPUT_DIR="${OUTPUT}"
export TOKENIZERS_PARALLELISM="false"
export MPLBACKEND="Agg"
export PYTHONUNBUFFERED="1"
export PYTORCH_CUDA_ALLOC_CONF="expandable_segments:True"

API_KEY="${SONARA_ACESTEP_API_KEY:-${ACESTEP_API_KEY:-}}"
if [ -z "${API_KEY}" ]; then
  log "ERROR: SONARA_ACESTEP_API_KEY or ACESTEP_API_KEY is required."
  exit 1
fi
export ACESTEP_API_KEY="${API_KEY}"
unset API_KEY

PY="${ROOT}/.venv/bin/python"
if [ ! -x "${PY}" ]; then
  log "ERROR: ${PY} not found in ACE-Step image"
  exit 1
fi

log "MODEL=${MODEL}"
log "LM_MODEL=${LM_MODEL}"
log "AUTH=enabled"
log "PORT=${PORT}"
log "CHECKPOINTS=${CHECKPOINTS}"
log "OUTPUT=${OUTPUT}"
log "Starting self-healing API loop"

while true; do
  set +e
  "${PY}" -m acestep.api_server \
    --host 0.0.0.0 \
    --port "${PORT}" \
    --download-source huggingface
  rc=$?
  set -e
  log "ACE-Step API exited with code ${rc}; restarting in 10 seconds"
  sleep 10
done
