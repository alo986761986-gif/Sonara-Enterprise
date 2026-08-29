import urllib.request
from pathlib import Path

CLEAN_ROOT = Path('/marimo/SONARA-ACE-Step-CLEAN')
CLEAN_PY = CLEAN_ROOT / '.venv/bin/python'
MODEL = CLEAN_ROOT / 'checkpoints/acestep-v15-xl-turbo'
BOOTSTRAP_URL = 'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/main/scripts/molab-sonara-xl-clean-bootstrap.py'
SUPERVISOR_URL = 'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/main/scripts/molab-sonara-xl-supervisor.py'


def fetch(url):
    return urllib.request.urlopen(url, timeout=60).read().decode('utf-8')


def ensure_clean_environment():
    if CLEAN_PY.exists() and MODEL.exists():
        print('✅ Ambiente CLEAN gia presente: lo riuso.', flush=True)
        return

    print('♻️ Ambiente CLEAN assente/incompleto: lo ricreo automaticamente...', flush=True)
    ns = {'__name__': '_sonara_clean_bootstrap_', '__file__': BOOTSTRAP_URL}
    code = fetch(BOOTSTRAP_URL)
    exec(compile(code, BOOTSTRAP_URL, 'exec'), ns)

    ns['prepare_clean_repo']()
    ns['build_clean_env']()

    if not CLEAN_PY.exists() or not MODEL.exists():
        raise RuntimeError('Bootstrap CLEAN completato ma ambiente/modello non risultano disponibili.')

    print('✅ Ambiente CLEAN ricreato.', flush=True)


def main():
    print('=' * 82)
    print(' SONARA MOLAB XL - ONE CLICK LAUNCHER ')
    print('=' * 82)
    ensure_clean_environment()
    print('🚀 Avvio supervisor auto-riparante...', flush=True)

    code = fetch(SUPERVISOR_URL)
    exec(
        compile(code, SUPERVISOR_URL, 'exec'),
        {'__name__': '__main__', '__file__': SUPERVISOR_URL},
    )


if __name__ == '__main__':
    main()
