import json
import os
import subprocess
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path('/marimo/SONARA-ACE-Step-CLEAN')
PY = ROOT / '.venv/bin/python'
MODEL_NAME = 'acestep-v15-xl-turbo'
MODEL_DIR = ROOT / 'checkpoints' / MODEL_NAME
HF_REPO = 'ACE-Step/acestep-v15-xl-turbo'
HF_BASE = f'https://huggingface.co/{HF_REPO}/resolve/main'

SMALL_FILES = [
    'config.json',
    'configuration_acestep_v15.py',
    'modeling_acestep_v15_xl_turbo.py',
    'model.safetensors.index.json',
]
OPTIONAL_SMALL = ['silence_latent.pt']


def log(msg):
    print('[SONARA REPAIR] ' + msg, flush=True)


def atomic_download(filename):
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    url = f'{HF_BASE}/{filename}?download=true'
    target = MODEL_DIR / filename
    fd, tmp_name = tempfile.mkstemp(prefix=filename.replace('/', '_') + '.', suffix='.tmp', dir=str(MODEL_DIR))
    os.close(fd)
    tmp = Path(tmp_name)
    try:
        log(f'Download ufficiale: {filename}')
        req = urllib.request.Request(url, headers={'User-Agent': 'SONARA-MoLab-Repair/1.0'})
        with urllib.request.urlopen(req, timeout=120) as r, open(tmp, 'wb') as out:
            while True:
                chunk = r.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
        if tmp.stat().st_size == 0:
            raise RuntimeError(f'Download vuoto: {filename}')
        os.replace(tmp, target)
    finally:
        if tmp.exists():
            tmp.unlink(missing_ok=True)


def load_json(path):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return None


def config_valid():
    cfg = load_json(MODEL_DIR / 'config.json')
    if not isinstance(cfg, dict):
        return False
    auto_map = cfg.get('auto_map') or {}
    return (
        cfg.get('model_type') == 'acestep'
        and 'AceStepConditionGenerationModel' in (cfg.get('architectures') or [])
        and 'modeling_acestep_v15_xl_turbo' in str(auto_map.get('AutoModel') or '')
        and 'configuration_acestep_v15' in str(auto_map.get('AutoConfig') or '')
    )


def index_and_shards():
    idx = load_json(MODEL_DIR / 'model.safetensors.index.json')
    if not isinstance(idx, dict):
        return None, []
    weight_map = idx.get('weight_map')
    if not isinstance(weight_map, dict) or not weight_map:
        return idx, []
    shards = sorted(set(str(v) for v in weight_map.values() if v))
    return idx, shards


def small_files_need_refresh():
    if not config_valid():
        return True
    minimum_sizes = {
        'configuration_acestep_v15.py': 4000,
        'modeling_acestep_v15_xl_turbo.py': 20000,
        'model.safetensors.index.json': 1000,
    }
    for name, min_size in minimum_sizes.items():
        p = MODEL_DIR / name
        if not p.exists() or p.stat().st_size < min_size:
            return True
    _, shards = index_and_shards()
    return len(shards) < 4


def refresh_metadata():
    for name in SMALL_FILES:
        atomic_download(name)
    silence = MODEL_DIR / 'silence_latent.pt'
    if not silence.exists() or silence.stat().st_size < 1024 * 1024:
        atomic_download('silence_latent.pt')


def missing_shards(shards):
    missing = []
    for name in shards:
        p = MODEL_DIR / name
        # Official XL shards are ~5 GB. A tiny file here is a broken/Xet pointer/incomplete download.
        if not p.exists() or p.stat().st_size < 1024 * 1024 * 1024:
            missing.append(name)
    return missing


def download_missing_shards(names):
    if not names:
        return
    if not PY.exists():
        raise RuntimeError(f'Python CLEAN non trovato: {PY}')
    log('Shard mancanti/incompleti: ' + ', '.join(names))
    code = (
        "from huggingface_hub import snapshot_download; "
        f"snapshot_download(repo_id={HF_REPO!r}, local_dir={str(MODEL_DIR)!r}, "
        f"allow_patterns={names!r})"
    )
    env = os.environ.copy()
    env.setdefault('HF_HUB_DISABLE_PROGRESS_BARS', '0')
    proc = subprocess.run([str(PY), '-c', code], cwd=str(ROOT), env=env, text=True)
    if proc.returncode != 0:
        raise RuntimeError('Download shard Hugging Face fallito.')


def repair_model():
    log('Controllo checkpoint XL-Turbo...')
    if not MODEL_DIR.exists():
        MODEL_DIR.mkdir(parents=True, exist_ok=True)

    if small_files_need_refresh():
        log('Metadata checkpoint non valide/incomplete: ripristino dai file ufficiali ACE-Step.')
        refresh_metadata()
    else:
        log('Metadata checkpoint valide.')

    if not config_valid():
        raise RuntimeError('config.json ancora non valido dopo il ripristino.')

    cfg = load_json(MODEL_DIR / 'config.json')
    log('CONFIG model_type=' + str(cfg.get('model_type')))
    log('CONFIG AutoModel=' + str((cfg.get('auto_map') or {}).get('AutoModel')))

    _, shards = index_and_shards()
    if len(shards) < 4:
        raise RuntimeError(f'Indice XL non valido: shard rilevati={shards}')

    missing = missing_shards(shards)
    if missing:
        download_missing_shards(missing)

    still_missing = missing_shards(shards)
    if still_missing:
        raise RuntimeError('Shard ancora mancanti/incompleti: ' + ', '.join(still_missing))

    log('CHECKPOINT XL-TURBO OK')
    print('SONARA_XL_CHECKPOINT=OK', flush=True)
    return True


if __name__ == '__main__':
    repair_model()
