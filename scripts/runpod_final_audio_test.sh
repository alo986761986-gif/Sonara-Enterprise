#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ACE_STEP_URL="${ACE_STEP_API_URL:-http://127.0.0.1:8000}"
SONARA_PORT="${SONARA_TEST_PORT:-3100}"
SONARA_URL="http://127.0.0.1:${SONARA_PORT}"
QA_DIR="${PROJECT_ROOT}/storage/qa"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
REQUEST_FILE="${QA_DIR}/runpod-final-request-${RUN_ID}.json"
STATUS_FILE="${QA_DIR}/runpod-final-status-${RUN_ID}.json"
SERVER_LOG="${QA_DIR}/runpod-final-server-${RUN_ID}.log"
SERVER_PID=""

fail() {
  echo "[FAIL] $*" >&2
  exit 1
}

cleanup() {
  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}"
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

cd "${PROJECT_ROOT}"
mkdir -p "${QA_DIR}"

command -v nvidia-smi >/dev/null || fail "nvidia-smi non disponibile: il test richiede una GPU RunPod reale."
command -v curl >/dev/null || fail "curl non disponibile."
command -v node >/dev/null || fail "Node.js non disponibile."

echo "[1/8] GPU reale"
nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader

if [[ -n "${SONARA_PYTHON_BIN:-}" ]]; then
  PYTHON_BIN="${SONARA_PYTHON_BIN}"
elif [[ -x "${PROJECT_ROOT}/python_env/bin/python" ]]; then
  PYTHON_BIN="${PROJECT_ROOT}/python_env/bin/python"
elif [[ -x "/workspace/ACE-Step/venv/bin/python" ]]; then
  PYTHON_BIN="/workspace/ACE-Step/venv/bin/python"
else
  fail "Nessun ambiente Python dedicato trovato."
fi

echo "[2/8] CUDA, FFmpeg, TorchCodec e Demucs v4"
if ! command -v ffmpeg >/dev/null 2>&1; then
  command -v apt-get >/dev/null || fail "FFmpeg mancante e apt-get non disponibile."
  apt-get update
  apt-get install -y ffmpeg
fi

TORCH_VERSION="$(${PYTHON_BIN} -c 'import torch; print(torch.__version__)')"
if [[ "${TORCH_VERSION}" == 2.11* ]] && ! "${PYTHON_BIN}" -c 'import torchcodec' >/dev/null 2>&1; then
  "${PYTHON_BIN}" -m pip install \
    --index-url https://download.pytorch.org/whl/cu128 \
    'torchcodec==0.11.1+cu128'
fi
if [[ "${TORCH_VERSION}" == 2.11* ]]; then
  "${PYTHON_BIN}" -c 'import torchcodec; from torchcodec.decoders import AudioDecoder; print(f"torchcodec={torchcodec.__version__}")'
fi

if ! "${PYTHON_BIN}" -c 'import demucs' >/dev/null 2>&1; then
  "${PYTHON_BIN}" -m pip install 'demucs==4.0.1'
fi
"${PYTHON_BIN}" -c 'import torch, demucs; assert torch.cuda.is_available(), "CUDA non disponibile"; print(f"CUDA={torch.cuda.get_device_name(0)} | torch={torch.__version__} | demucs=4.x")'

echo "[3/8] ACE-Step health"
curl --fail --silent --show-error --max-time 20 "${ACE_STEP_URL}/health"
echo

echo "[4/8] Build Sonara"
if [[ ! -d node_modules ]]; then
  npm install
fi
npm run build

echo "[5/8] Avvio backend isolato sulla porta ${SONARA_PORT}"
NODE_ENV=production \
PORT="${SONARA_PORT}" \
ACE_STEP_API_URL="${ACE_STEP_URL}" \
SONARA_REQUIRE_STEMS=true \
SONARA_PYTHON_BIN="${PYTHON_BIN}" \
npm start >"${SERVER_LOG}" 2>&1 &
SERVER_PID="$!"

for _ in $(seq 1 30); do
  if curl --fail --silent --max-time 2 "${SONARA_URL}/api/health" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
    fail "Il backend Sonara si è arrestato. Log: ${SERVER_LOG}"
  fi
  sleep 1
done
curl --fail --silent --show-error --max-time 5 "${SONARA_URL}/api/health" >/dev/null \
  || fail "Backend Sonara non raggiungibile. Log: ${SERVER_LOG}"

echo "[6/8] Generazione neurale reale"
curl --fail --silent --show-error --max-time 30 \
  -H 'Content-Type: application/json' \
  --data-binary '{"title":"SONARA RunPod Final QA","prompt":"Professional melodic house track with a tight four-on-the-floor kick, phase-locked sub bass, crisp sixteenth-note hats, clear snare backbeat, controlled syncopated percussion, emotional minor harmony, clean transitions on four-bar phrase boundaries and a complete final measure","genre":"Melodic House","mood":"Energetic and emotional","lyrics":"","bpm":124,"durationSec":30}' \
  "${SONARA_URL}/api/engine/generate" >"${REQUEST_FILE}"

JOB_ID="$(node -e 'const fs=require("fs"); const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).jobId; if(!value) process.exit(1); process.stdout.write(value)' "${REQUEST_FILE}")" \
  || fail "La richiesta non ha restituito un jobId. Risposta: ${REQUEST_FILE}"
echo "Job: ${JOB_ID}"

echo "[7/8] Attesa master e quattro stem GPU"
for attempt in $(seq 1 180); do
  NEXT_STATUS="${STATUS_FILE}.next"
  curl --fail --silent --show-error --max-time 10 \
    "${SONARA_URL}/api/music/job/${JOB_ID}" >"${NEXT_STATUS}"
  mv "${NEXT_STATUS}" "${STATUS_FILE}"

  STATUS="$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).status||"")' "${STATUS_FILE}")"
  PROGRESS="$(node -e 'const fs=require("fs"); process.stdout.write(String(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).progress??0))' "${STATUS_FILE}")"
  echo "  ${STATUS} ${PROGRESS}%"

  [[ "${STATUS}" == "COMPLETED" ]] && break
  if [[ "${STATUS}" == "FAILED" ]]; then
    fail "Pipeline fallita. Stato: ${STATUS_FILE} | Log: ${SERVER_LOG}"
  fi
  [[ "${attempt}" -lt 180 ]] && sleep 5
done

echo "[8/8] Audit finale"
node --import tsx scripts/validate_runpod_audio_test.ts "${STATUS_FILE}" "${PROJECT_ROOT}"
echo "[PASS] Collaudo RunPod definitivo completato senza fallback."
echo "Stato: ${STATUS_FILE}"
echo "Log: ${SERVER_LOG}"
