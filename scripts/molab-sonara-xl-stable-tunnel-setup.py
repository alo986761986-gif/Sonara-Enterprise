import json
import os
import platform
import subprocess
import urllib.request
from pathlib import Path

HOSTNAME = 'molab.sonaraenterprise.com'
PUBLIC_URL = 'https://' + HOSTNAME
TUNNEL_NAME = 'sonara-molab-xl'
PORT = 8001
HOME = Path('/marimo')
CF_DIR = HOME / '.cloudflared'
CF_DIR.mkdir(parents=True, exist_ok=True)
BINARY = CF_DIR / 'cloudflared'
CONFIG = CF_DIR / 'config.yml'
CERT = CF_DIR / 'cert.pem'


def env():
    e = os.environ.copy()
    e['HOME'] = str(HOME)
    return e


def ensure_cloudflared():
    if BINARY.exists() and os.access(BINARY, os.X_OK):
        return
    arch = 'arm64' if platform.machine().lower() in {'arm64', 'aarch64'} else 'amd64'
    print('Scarico cloudflared...')
    urllib.request.urlretrieve(
        f'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-{arch}',
        BINARY,
    )
    BINARY.chmod(0o755)


def tunnel_id():
    result = subprocess.run(
        [str(BINARY), 'tunnel', 'list', '--output', 'json'],
        env=env(), capture_output=True, text=True,
    )
    if result.returncode != 0:
        return None
    try:
        rows = json.loads(result.stdout or '[]')
    except Exception:
        return None
    for row in rows:
        if str(row.get('name') or '') == TUNNEL_NAME:
            return str(row.get('id') or row.get('uuid') or '').strip() or None
    return None


def main():
    ensure_cloudflared()

    if not CERT.exists():
        print('\n' + '=' * 78)
        print('SONARA MOLAB - AUTORIZZAZIONE CLOUDFLARE UNA SOLA VOLTA')
        print('=' * 78)
        print('Apri il link che Cloudflare mostrera qui sotto, accedi e scegli sonaraenterprise.com.')
        print('Dopo l autorizzazione questa cella continuera automaticamente.\n')
        result = subprocess.run([str(BINARY), 'tunnel', 'login'], env=env())
        if result.returncode != 0 or not CERT.exists():
            raise RuntimeError('Login Cloudflare non completato. Rilancia questa cella e completa il link di autorizzazione.')

    tid = tunnel_id()
    if not tid:
        print('Creo il Named Tunnel stabile SONARA...')
        result = subprocess.run([str(BINARY), 'tunnel', 'create', TUNNEL_NAME], env=env())
        if result.returncode != 0:
            raise RuntimeError('Creazione tunnel Cloudflare non riuscita.')
        tid = tunnel_id()
    if not tid:
        raise RuntimeError('Impossibile ricavare ID del tunnel SONARA.')

    credentials = CF_DIR / f'{tid}.json'
    if not credentials.exists():
        raise RuntimeError(f'Credenziali tunnel mancanti: {credentials}')

    CONFIG.write_text(
        f"tunnel: {tid}\n"
        f"credentials-file: {credentials}\n"
        "ingress:\n"
        f"  - hostname: {HOSTNAME}\n"
        f"    service: http://127.0.0.1:{PORT}\n"
        "  - service: http_status:404\n",
        encoding='utf-8',
    )

    print('Configuro DNS stabile:', HOSTNAME)
    route = subprocess.run(
        [str(BINARY), 'tunnel', 'route', 'dns', TUNNEL_NAME, HOSTNAME],
        env=env(), capture_output=True, text=True,
    )
    route_text = ((route.stdout or '') + '\n' + (route.stderr or '')).strip()
    if route_text:
        print(route_text)
    if route.returncode != 0 and 'already exists' not in route_text.lower():
        raise RuntimeError('Configurazione DNS Cloudflare non riuscita.')

    print('\n' + '=' * 78)
    print('✅ NAMED TUNNEL SONARA CONFIGURATO')
    print('URL STABILE=' + PUBLIC_URL)
    print('TUNNEL=' + TUNNEL_NAME)
    print('CONFIG=' + str(CONFIG))
    print('=' * 78)
    print('Da ora puoi spegnere MoLab quando non lo usi. Quando lo riaccendi, l URL resta lo stesso.')
    print('Adesso avvia il supervisor SONARA aggiornato.')


if __name__ == '__main__':
    main()
