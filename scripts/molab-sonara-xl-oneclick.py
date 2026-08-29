import json
import os
import subprocess
import time
import urllib.parse
import urllib.request
from pathlib import Path

CLEAN_ROOT = Path('/marimo/SONARA-ACE-Step-CLEAN')
CLEAN_PY = CLEAN_ROOT / '.venv/bin/python'
MODEL = CLEAN_ROOT / 'checkpoints/acestep-v15-xl-turbo'
OLD_ROOT = Path('/marimo/SONARA-ACE-Step-1.5')
CF_HOME = Path('/marimo/.cloudflared')
CF_BIN = CF_HOME / 'cloudflared'
CF_CONFIG = CF_HOME / 'config.yml'
CF_CERT = CF_HOME / 'cert.pem'
TUNNEL_NAME = 'sonara-molab-xl'
HOSTNAME = 'molab.sonaraenterprise.com'
PUBLIC_URL = 'https://' + HOSTNAME

BOOTSTRAP_URL = 'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/4404f7c23ff1812e939d0f42aa1bb56ef53ca27d/scripts/molab-sonara-xl-clean-bootstrap.py'
REPAIR_URL = 'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/d5fd7a6c4ad3cc407bba235b9885d9bf0016901d/scripts/molab-sonara-xl-repair-checkpoint.py'
SUPERVISOR_URL = 'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/27fe7af26cf9f3f68a91c249fa2f3e5a3f026f80/scripts/molab-sonara-xl-supervisor.py'


def fetch(url):
    req = urllib.request.Request(
        url,
        headers={
            'Cache-Control': 'no-cache, no-store, max-age=0',
            'Pragma': 'no-cache',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
        },
    )
    return urllib.request.urlopen(req, timeout=120).read().decode('utf-8')


def ensure_clean_environment():
    if CLEAN_PY.exists() and MODEL.exists():
        print('✅ Ambiente CLEAN gia presente: lo riuso.', flush=True)
        return

    print('♻️ Ambiente CLEAN assente/incompleto.', flush=True)
    if not OLD_ROOT.exists():
        raise RuntimeError(
            'Non trovo ne CLEAN ne l installazione ACE-Step base in /marimo/SONARA-ACE-Step-1.5. '
            'La sessione MoLab probabilmente e stata ricreata e ACE-Step va reinstallato.'
        )

    print('♻️ Ricreo automaticamente CLEAN riutilizzando i checkpoint gia presenti...', flush=True)
    ns = {'__name__': '_sonara_clean_bootstrap_', '__file__': BOOTSTRAP_URL}
    script = fetch(BOOTSTRAP_URL)
    exec(compile(script, BOOTSTRAP_URL, 'exec'), ns)
    ns['prepare_clean_repo']()
    ns['build_clean_env']()

    if not CLEAN_PY.exists() or not MODEL.exists():
        raise RuntimeError('Bootstrap CLEAN completato ma ambiente/modello non risultano disponibili.')

    print('✅ Ambiente CLEAN ricreato.', flush=True)


def repair_checkpoint():
    print('🔧 Controllo checkpoint XL-Turbo...', flush=True)
    ns = {'__name__': '_sonara_repair_', '__file__': REPAIR_URL}
    script = fetch(REPAIR_URL)
    exec(compile(script, REPAIR_URL, 'exec'), ns)
    ns['repair_model']()


def cf_env():
    env = os.environ.copy()
    env['HOME'] = '/marimo'
    return env


def public_dns_ready():
    query = urllib.parse.urlencode({'name': HOSTNAME, 'type': 'A'})
    req = urllib.request.Request(
        'https://cloudflare-dns.com/dns-query?' + query,
        headers={
            'Accept': 'application/dns-json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8', errors='replace'))
        return int(data.get('Status', 1)) == 0 and bool(data.get('Answer'))
    except Exception:
        return False


def ensure_stable_dns():
    if not CF_BIN.exists() or not CF_CONFIG.exists() or not CF_CERT.exists():
        raise RuntimeError(
            'Named Tunnel non configurato completamente. Esegui una volta molab-sonara-xl-stable-tunnel-setup.py.'
        )

    print('🌐 Verifico/riparo DNS stabile ' + HOSTNAME + '...', flush=True)
    route = subprocess.run(
        [str(CF_BIN), 'tunnel', 'route', 'dns', '--overwrite-dns', TUNNEL_NAME, HOSTNAME],
        env=cf_env(), capture_output=True, text=True,
    )
    text = ((route.stdout or '') + '\n' + (route.stderr or '')).strip()
    if text:
        print(text, flush=True)
    if route.returncode != 0:
        raise RuntimeError('Riparazione DNS Cloudflare fallita: ' + text[-4000:])

    deadline = time.time() + 90
    while time.time() < deadline:
        if public_dns_ready():
            print('✅ DNS STABILE PRONTO: ' + PUBLIC_URL, flush=True)
            return
        time.sleep(3)

    raise RuntimeError('Cloudflare ha accettato la route ma il DNS pubblico non risolve ancora ' + HOSTNAME + '.')


def main():
    print('=' * 82)
    print(' SONARA MOLAB XL - ONE CLICK ON-DEMAND V6 ')
    print('=' * 82)
    print('URL STABILE=' + PUBLIC_URL)
    ensure_clean_environment()
    repair_checkpoint()
    ensure_stable_dns()
    print('🚀 Avvio supervisor con browser-probe Cloudflare...', flush=True)

    supervisor = fetch(SUPERVISOR_URL)
    exec(
        compile(supervisor, SUPERVISOR_URL, 'exec'),
        {'__name__': '__main__', '__file__': SUPERVISOR_URL},
    )


if __name__ == '__main__':
    main()
