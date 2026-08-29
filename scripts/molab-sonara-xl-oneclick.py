import urllib.request
from pathlib import Path

CLEAN_ROOT = Path('/marimo/SONARA-ACE-Step-CLEAN')
CLEAN_PY = CLEAN_ROOT / '.venv/bin/python'
MODEL = CLEAN_ROOT / 'checkpoints/acestep-v15-xl-turbo'
OLD_ROOT = Path('/marimo/SONARA-ACE-Step-1.5')

# Pinned immutable revisions so MoLab does not receive a stale cached script.
BOOTSTRAP_URL = 'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/4404f7c23ff1812e939d0f42aa1bb56ef53ca27d/scripts/molab-sonara-xl-clean-bootstrap.py'
REPAIR_URL = 'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/d5fd7a6c4ad3cc407bba235b9885d9bf0016901d/scripts/molab-sonara-xl-repair-checkpoint.py'
SUPERVISOR_URL = 'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/bdbd2f289c3eb33d30bbbd3d7290b4c5b63d5b1b/scripts/molab-sonara-xl-supervisor.py'


def fetch(url):
    req = urllib.request.Request(
        url,
        headers={
            'Cache-Control': 'no-cache, no-store, max-age=0',
            'Pragma': 'no-cache',
            'User-Agent': 'SONARA-MoLab-OneClick/3.0',
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


def main():
    print('=' * 82)
    print(' SONARA MOLAB XL - ONE CLICK ON-DEMAND V3 ')
    print('=' * 82)
    print('URL STABILE=https://molab.sonaraenterprise.com')
    ensure_clean_environment()
    repair_checkpoint()
    print('🚀 Avvio supervisor ON-DEMAND con Named Tunnel stabile...', flush=True)

    supervisor = fetch(SUPERVISOR_URL)
    exec(
        compile(supervisor, SUPERVISOR_URL, 'exec'),
        {'__name__': '__main__', '__file__': SUPERVISOR_URL},
    )


if __name__ == '__main__':
    main()
