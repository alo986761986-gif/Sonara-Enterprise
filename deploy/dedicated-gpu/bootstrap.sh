#!/usr/bin/env bash
# SONARA dedicated RTX PRO 6000 bootstrap (run INSIDE a paid Nebius GPU VM).
# Does not provision/bill a VM; requires Docker Compose, NVIDIA runtime, Caddy,
# curl, git, openssl, Python 3 and a correctly configured GPU host.
set -euo pipefail
umask 077

if [ "$(id -u)" -ne 0 ]; then
  echo "Execute with sudo on the dedicated GPU VM." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
UPSTREAM_SHA="ca1e85fe9430179831e6bc6be790c332190a3866"
ACE_DIR="/opt/sonara/ace-step"
BACKEND_DIR="/opt/sonara/backend"
PRIVATE_DIR="/etc/sonara"
KEY_FILE="$PRIVATE_DIR/gateway.key"

for required in docker caddy nvidia-smi git python3 openssl curl systemctl; do
  if ! command -v "$required" >/dev/null 2>&1; then
    echo "Missing prerequisite: $required. See deploy/dedicated-gpu/README.md" >&2
    exit 1
  fi
done
docker compose version >/dev/null
docker info >/dev/null
if ! docker run --rm --gpus all nvidia/cuda:12.8.1-base-ubuntu22.04 nvidia-smi >/dev/null 2>&1; then
  echo "Docker NVIDIA Container Toolkit unavailable. Install NVIDIA Container Toolkit before continuing." >&2
  exit 1
fi

if ! id sonara >/dev/null 2>&1; then
  useradd --system --home /var/lib/sonara --shell /usr/sbin/nologin sonara
fi

install -d -m 0700 "$PRIVATE_DIR"
install -d -m 0755 "$BACKEND_DIR" "$ACE_DIR" /opt/sonara/checkpoints /opt/sonara/output /opt/sonara/hf-cache

if [ ! -s "$KEY_FILE" ]; then
  openssl rand -hex 48 > "$KEY_FILE"
fi
chmod 0640 "$KEY_FILE"
chown root:sonara "$KEY_FILE"
key="$(cat "$KEY_FILE")"
if [ "${#key}" -lt 48 ]; then
  echo "Existing gateway key too short. Refusing to continue." >&2
  exit 1
fi

# Both local APIs authenticate, but ports 8001/8002 bind LOOPBACK only.
printf 'ACESTEP_API_KEY=%s\n' "$key" > "$PRIVATE_DIR/ace-step.env"
chmod 0600 "$PRIVATE_DIR/ace-step.env"
printf 'SONARA_GATEWAY_KEY_FILE=/etc/sonara/gateway.key\nSONARA_GPU_UPSTREAM_API_KEY=%s\n' "$key" > "$PRIVATE_DIR/gateway.env"
chmod 0640 "$PRIVATE_DIR/gateway.env"
chown root:sonara "$PRIVATE_DIR/gateway.env"
unset key

install -m 0644 "$ROOT/scripts/sonara-dedicated-secure-gateway.py" "$BACKEND_DIR/sonara-dedicated-secure-gateway.py"
install -m 0644 "$ROOT/deploy/dedicated-gpu/sonara-gateway.service" /etc/systemd/system/sonara-gateway.service

# Pin exact upstream ACE-Step commit for repeatable model serving.
if [ ! -d "$ACE_DIR/.git" ]; then
  git -C "$ACE_DIR" init -q
  git -C "$ACE_DIR" remote add origin https://github.com/ace-step/ACE-Step-1.5.git
fi
git -C "$ACE_DIR" fetch --depth 1 origin "$UPSTREAM_SHA"
git -C "$ACE_DIR" checkout --detach -q "$UPSTREAM_SHA"

echo "Building ACE-Step XL Turbo + LM 4B container..."
docker compose -f "$ROOT/deploy/dedicated-gpu/docker-compose.yml" up -d --build

# Publish TLS only through the authenticated local gateway.
install -m 0644 "$ROOT/deploy/dedicated-gpu/Caddyfile" /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl daemon-reload
systemctl enable --now sonara-gateway.service
systemctl enable --now caddy.service
systemctl restart caddy.service

# Fail closed when the local gateway does not reject anonymous connections.
status="$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' http://127.0.0.1:8002/health || true)"
if [ "$status" != "401" ] && [ "$status" != "403" ]; then
  echo "Gateway failed anonymous-deny probe: HTTP $status. Inspect service logs before enabling DNS." >&2
  exit 1
fi

echo "SONARA DEDICATED GATEWAY STARTED (model loading may still continue)"
echo "GPU_HOST=https://gpu.sonaraenterprise.com"
echo "LOCAL_8001=LOOPBACK_ONLY"
echo "LOCAL_8002=AUTH_REQUIRED"
echo "PRIVATE_GPU_KEY_FILE=/etc/sonara/gateway.key (do not paste into chat)"
echo "Next: configure Cloudflare DNS A, then run sudo bash deploy/dedicated-gpu/check-cutover.sh"
