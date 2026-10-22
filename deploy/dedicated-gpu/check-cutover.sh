#!/usr/bin/env bash
# Operator-only verification: never prints any private key.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root on the dedicated SONARA GPU VM." >&2
  exit 1
fi

HOST="https://gpu.sonaraenterprise.com"
KEY_FILE="/etc/sonara/gateway.key"
[ -s "$KEY_FILE" ] || { echo "Missing GPU bearer key" >&2; exit 1; }
key="$(cat "$KEY_FILE")"
trap 'unset key' EXIT

for endpoint in "http://127.0.0.1:8002/health" "$HOST/health"; do
  status="$(curl -sS --max-time 12 -o /dev/null -w '%{http_code}' "$endpoint" || true)"
  if [ "$status" != "401" ] && [ "$status" != "403" ]; then
    echo "SECURITY_FAILURE: unauthenticated $endpoint gave HTTP $status (expected 401/403)" >&2
    exit 1
  fi
  echo "Unauthorized blocked: $endpoint ($status)"
done

echo "Verifying HTTPS origin authentication and BOTH loaded models..."
curl -fsS --max-time 30 -H "Authorization: Bearer $key" "$HOST/health" |
  python3 -c '
import json,sys
payload=json.load(sys.stdin)
state=payload.get("data", payload)
assert state.get("models_initialized") is True, "DiT not initialized"
assert state.get("llm_initialized") is True, "LM not initialized"
assert "acestep-v15-xl-turbo" in str(state.get("loaded_model","")), "incorrect DiT"
assert "acestep-5Hz-lm-4B" in str(state.get("loaded_lm_model","")), "incorrect LM"
print("SONARA_DEDICATED_GPU_READY=true")
print("MODEL=acestep-v15-xl-turbo")
print("LM=acestep-5Hz-lm-4B")
'

echo "Dedicated GPU private origin is ready. Do not switch production until the Worker and Vercel secrets match."
