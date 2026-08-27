import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

BASE = Path('/kaggle/working/ACE-Step-1.5')
CHECKPOINTS = BASE / 'checkpoints'
VENV_PYTHON = BASE / '.venv/bin/python'
LOCK_SCRIPT = Path('/kaggle/working/kaggle-sonara-t4-fp32-lock.py')
LOCK_URL = (
    'https://raw.githubusercontent.com/alo986761986-gif/'
    'Sonara-Enterprise/main/scripts/kaggle-sonara-t4-fp32-lock.py'
)

WEIGHT_FILENAMES = (
    'model.safetensors',
    'model.safetensors.index.json',
    'pytorch_model.bin',
    'pytorch_model.bin.index.json',
    'diffusion_pytorch_model.safetensors',
    'diffusion_pytorch_model.safetensors.index.json',
    'diffusion_pytorch_model.bin',
    'diffusion_pytorch_model.bin.index.json',
)

REQUIRED_COMPONENTS = (
    'acestep-v15-turbo',
    'vae',
    'Qwen3-Embedding-0.6B',
)


def has_weights(component: str) -> bool:
    root = CHECKPOINTS / component
    return root.is_dir() and any((root / name).exists() for name in WEIGHT_FILENAMES)


def stop_acestep_workers() -> None:
    try:
        rows = subprocess.check_output(['ps', '-eo', 'pid=,args='], text=True)
    except Exception:
        return
    pids = []
    for row in rows.splitlines():
        parts = row.strip().split(maxsplit=1)
        if len(parts) != 2:
            continue
        try:
            pid = int(parts[0])
        except ValueError:
            continue
        cmd = parts[1].lower()
        if (
            pid != os.getpid()
            and 'acestep' in cmd
            and 'cloudflared' not in cmd
            and 'kaggle-sonara-t4-self-heal.py' not in cmd
        ):
            pids.append(pid)
    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
        except Exception:
            pass
    if pids:
        time.sleep(2)
    for pid in pids:
        try:
            os.kill(pid, 0)
            os.kill(pid, signal.SIGKILL)
        except Exception:
            pass
    print(f'ACE-Step workers fermati: {len(pids)}')


def download_missing_components(missing: list[str]) -> None:
    patterns = [f'{component}/*' for component in missing]
    code = f'''from huggingface_hub import snapshot_download\nsnapshot_download(\n    repo_id="ACE-Step/Ace-Step1.5",\n    local_dir={str(CHECKPOINTS)!r},\n    allow_patterns={patterns!r},\n)\n'''
    print('Download/ripristino componenti:', ', '.join(missing))
    subprocess.run(
        [str(VENV_PYTHON), '-c', code],
        cwd=str(BASE),
        check=True,
    )


def sync_turbo_model_code() -> None:
    src = BASE / 'acestep/models/turbo'
    dst = CHECKPOINTS / 'acestep-v15-turbo'
    if not src.is_dir() or not dst.is_dir():
        return
    for source in src.glob('*.py'):
        if source.name == '__init__.py':
            continue
        shutil.copy2(source, dst / source.name)
    print('Codice modello Turbo sincronizzato con il runtime ACE-Step.')


def main() -> None:
    if not BASE.is_dir():
        raise RuntimeError(f'ACE-Step non trovato: {BASE}')
    if not VENV_PYTHON.exists():
        raise RuntimeError(f'Venv ACE-Step non trovato: {VENV_PYTHON}')

    print('=' * 68)
    print(' SONARA KAGGLE T4 x2 SELF-HEAL BOOT ')
    print('=' * 68)

    stop_acestep_workers()
    CHECKPOINTS.mkdir(parents=True, exist_ok=True)

    missing = [component for component in REQUIRED_COMPONENTS if not has_weights(component)]
    if missing:
        download_missing_components(missing)
    else:
        print('Checkpoint essenziali gia presenti.')

    sync_turbo_model_code()

    remaining = [component for component in REQUIRED_COMPONENTS if not has_weights(component)]
    if remaining:
        raise RuntimeError(
            'Checkpoint ancora incompleti dopo il ripristino: ' + ', '.join(remaining)
        )

    print('Checkpoint ACE-Step verificati: Turbo + VAE + Qwen text encoder.')
    urllib.request.urlretrieve(LOCK_URL, LOCK_SCRIPT)
    print('Avvio bootstrap SONARA FP32 T4 x2...')
    subprocess.run([sys.executable, str(LOCK_SCRIPT)], check=True)


if __name__ == '__main__':
    main()
