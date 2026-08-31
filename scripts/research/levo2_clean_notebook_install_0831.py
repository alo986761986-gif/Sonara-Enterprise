#!/usr/bin/env python3
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

# SONARA LeVo2 clean R&D sandbox.
# Deliberately separate from ACE-Step, YuE, and the previous LeVo2 environment.
ROOT = Path('/marimo/SONARA-LeVo2-CLEAN')
REPO = ROOT / 'levo2-official'
VENV = ROOT / 'venv'
RUNTIME = ROOT / 'runtime'
MODEL = ROOT / 'songgeneration_v2_large'
PY = VENV / 'bin' / 'python'
OFFICIAL_REPO = 'https://github.com/AMAImedia/SongGeneration2-LeVo2.git'
OFFICIAL_OWNER_REPO = 'AMAImedia/SongGeneration2-LeVo2'


def run(cmd, *, cwd=None, env=None, check=True, timeout=None):
    print('$ ' + ' '.join(map(str, cmd)), flush=True)
    return subprocess.run(cmd, cwd=cwd, env=env, check=check, timeout=timeout)


def banner(text):
    print('\n' + '=' * 80)
    print(text)
    print('=' * 80, flush=True)


def ensure_clean_root():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'README-SONARA.txt').write_text(
        'SONARA LeVo2 CLEAN R&D sandbox\n'
        'Official source: AMAImedia/SongGeneration2-LeVo2\n'
        'Research/education only. Do not use for commercial production.\n',
        encoding='utf-8',
    )


def clone_official_repo():
    if not (REPO / '.git').exists():
        if REPO.exists():
            shutil.rmtree(REPO)
        run(['git', 'clone', '--depth', '1', OFFICIAL_REPO, str(REPO)], timeout=600)
    else:
        run(['git', 'fetch', '--depth', '1', 'origin', 'main'], cwd=REPO, timeout=300)
        run(['git', 'reset', '--hard', 'origin/main'], cwd=REPO)


def materialize_git_lfs_files():
    # A clean git clone may leave LFS pointer files if git-lfs is unavailable.
    # GitHub's media endpoint returns the actual LFS object, so no system package is required.
    pointer_prefix = b'version https://git-lfs.github.com/spec/v1'
    fixed = 0
    for p in REPO.rglob('*'):
        if not p.is_file() or '.git' in p.parts:
            continue
        try:
            with p.open('rb') as f:
                head = f.read(128)
        except OSError:
            continue
        if not head.startswith(pointer_prefix):
            continue
        rel = p.relative_to(REPO).as_posix()
        quoted = urllib.parse.quote(rel, safe='/')
        url = f'https://media.githubusercontent.com/media/{OFFICIAL_OWNER_REPO}/main/{quoted}'
        tmp = p.with_suffix(p.suffix + '.download')
        print(f'LFS: {rel}', flush=True)
        urllib.request.urlretrieve(url, tmp)
        if tmp.stat().st_size < 1024:
            raise RuntimeError(f'Git LFS download non valido: {rel}')
        tmp.replace(p)
        fixed += 1
    print(f'Git LFS files materialized: {fixed}', flush=True)


def _venv_is_python310():
    if not PY.exists():
        return False
    check = subprocess.run(
        [str(PY), '-c', 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")'],
        capture_output=True,
        text=True,
    )
    return check.returncode == 0 and check.stdout.strip() == '3.10'


def make_venv():
    if PY.exists() and not _venv_is_python310():
        print('Venv esistente non Python 3.10: lo ricreo.', flush=True)
        shutil.rmtree(VENV)

    if not PY.exists():
        uv = shutil.which('uv')
        if uv:
            # --seed installs pip/setuptools into the venv when supported by this uv version.
            result = subprocess.run([uv, 'venv', '--python', '3.10', '--seed', str(VENV)])
            if result.returncode != 0:
                # Older uv versions may not support --seed; the venv is still useful because
                # dependency installation below uses `uv pip --python` directly.
                if VENV.exists():
                    shutil.rmtree(VENV)
                result = subprocess.run([uv, 'venv', '--python', '3.10', str(VENV)])
            if result.returncode == 0 and PY.exists():
                return

        py310 = shutil.which('python3.10')
        if not py310:
            raise RuntimeError('Python 3.10 non disponibile. Installa Python 3.10 oppure uv e rilancia.')
        run([py310, '-m', 'venv', str(VENV)])

    if not _venv_is_python310():
        raise RuntimeError(f'Il venv LeVo2 non usa Python 3.10: {PY}')


def ensure_pip_fallback():
    test = subprocess.run([str(PY), '-m', 'pip', '--version'], capture_output=True, text=True)
    if test.returncode == 0:
        return
    print('pip non presente nel venv: bootstrap con ensurepip...', flush=True)
    subprocess.run([str(PY), '-m', 'ensurepip', '--upgrade'], check=False)
    test = subprocess.run([str(PY), '-m', 'pip', '--version'], capture_output=True, text=True)
    if test.returncode != 0:
        raise RuntimeError('Impossibile inizializzare pip nel venv Python 3.10.')


def pip_install(*args, timeout=1800):
    uv = shutil.which('uv')
    if uv:
        # This works even when a freshly-created uv venv has no pip module installed yet.
        run([uv, 'pip', 'install', '--python', str(PY), *args], timeout=timeout)
        return
    ensure_pip_fallback()
    run([str(PY), '-m', 'pip', 'install', *args], timeout=timeout)


def install_dependencies():
    # Installing pip itself also makes the venv convenient for later manual diagnostics.
    pip_install('--upgrade', 'pip', 'wheel', 'setuptools==80.9.0')

    # RTX PRO 6000 Blackwell-safe stack used by the successful SONARA R&D setup.
    pip_install(
        '--index-url', 'https://download.pytorch.org/whl/cu128',
        'torch==2.9.0', 'torchaudio==2.9.0', 'torchvision==0.24.0',
    )

    # Keep upstream dependencies, but do not downgrade the Blackwell CUDA/Torch stack.
    req_in = REPO / 'requirements.txt'
    req_out = ROOT / 'requirements.blackwell.txt'
    kept = []
    for raw in req_in.read_text(encoding='utf-8').splitlines():
        s = raw.strip()
        if not s or s.startswith('#'):
            continue
        name = s.split('==', 1)[0].split('>=', 1)[0].split('<=', 1)[0].strip().lower()
        if name in {'torch', 'torchaudio', 'torchvision'}:
            continue
        kept.append(s)
    req_out.write_text('\n'.join(kept) + '\n', encoding='utf-8')

    pip_install('-r', str(req_out))
    pip_install('-r', str(REPO / 'requirements_nodeps.txt'), '--no-deps')

    # Fixes required by the proven SONARA LeVo2 environment.
    pip_install(
        'huggingface_hub==0.25.2',
        'torchcodec==0.9.0',
        'requests', 'certifi', 'idna', 'charset-normalizer', 'urllib3',
    )

    print('Flash Attention: SKIPPED intentionally (stable standard attention path).', flush=True)


def snapshot(repo_id: str, dest: Path):
    dest.mkdir(parents=True, exist_ok=True)
    code = (
        'from huggingface_hub import snapshot_download; '
        f'snapshot_download(repo_id={repo_id!r}, local_dir=r{str(dest)!r}, '
        'local_dir_use_symlinks=False, resume_download=True)'
    )
    run([str(PY), '-c', code], timeout=None)


def download_runtime_and_model():
    snapshot('lglg666/SongGeneration-Runtime', RUNTIME)
    snapshot('lglg666/SongGeneration-v2-large', MODEL)


def replace_link(dst: Path, src: Path):
    if dst.is_symlink() or dst.is_file():
        dst.unlink()
    elif dst.exists():
        shutil.rmtree(dst)
    os.symlink(src, dst, target_is_directory=True)


def wire_runtime():
    for name in ('ckpt', 'third_party'):
        src = RUNTIME / name
        if not src.exists():
            raise RuntimeError(f'Runtime incompleto: manca {src}')
        replace_link(REPO / name, src)
    replace_link(REPO / 'songgeneration_v2_large', MODEL)


def write_runner():
    runner = ROOT / 'run_levo2.sh'
    runner.write_text(
        '#!/usr/bin/env bash\n'
        'set -euo pipefail\n'
        f'ROOT={str(ROOT)!r}\n'
        f'REPO={str(REPO)!r}\n'
        f'VENV={str(VENV)!r}\n'
        f'MODEL={str(MODEL)!r}\n'
        'export PATH="$VENV/bin:$PATH"\n'
        '# PyTorch >=2.6 defaults torch.load to weights_only=True; upstream LeVo checkpoints need the old behavior.\n'
        'export TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD=1\n'
        'if [ "$#" -lt 2 ]; then\n'
        '  echo "Uso: run_levo2.sh INPUT.jsonl OUTPUT_DIR [altre-opzioni]"\n'
        '  exit 2\n'
        'fi\n'
        'INPUT="$1"; OUTPUT="$2"; shift 2\n'
        'cd "$REPO"\n'
        'exec bash ./generate.sh "$MODEL" "$INPUT" "$OUTPUT" --not_use_flash_attn "$@"\n',
        encoding='utf-8',
    )
    runner.chmod(0o755)


def verify_only_no_generation():
    code = r'''
import torch
print('torch=', torch.__version__)
print('cuda=', torch.version.cuda)
print('cuda_available=', torch.cuda.is_available())
assert torch.cuda.is_available(), 'CUDA non disponibile'
p = torch.cuda.get_device_properties(0)
print('gpu=', p.name)
print('vram_gb=', round(p.total_memory / 1024**3, 2))
print('capability=', torch.cuda.get_device_capability(0))
x = torch.randn((512, 512), device='cuda', dtype=torch.float16)
y = x @ x
print('cuda_compute=OK', float(y[0, 0]))
'''
    run([str(PY), '-c', code])

    required = [
        REPO / 'generate.py',
        REPO / 'generate.sh',
        REPO / 'tools' / 'new_auto_prompt.pt',
        REPO / 'ckpt',
        REPO / 'third_party',
        MODEL,
    ]
    for p in required:
        if not p.exists():
            raise RuntimeError(f'Manca componente LeVo2: {p}')

    prompt_file = REPO / 'tools' / 'new_auto_prompt.pt'
    with prompt_file.open('rb') as f:
        if f.read(64).startswith(b'version https://git-lfs.github.com/spec/v1'):
            raise RuntimeError('new_auto_prompt.pt e ancora un puntatore Git LFS')

    (ROOT / 'LEVO2_READY.txt').write_text(
        'READY\n'
        f'REPO={REPO}\nMODEL={MODEL}\nPYTHON={PY}\n'
        'FLASH_ATTENTION=OFF\nTORCH_WEIGHTS_ONLY_COMPAT=ON\n',
        encoding='utf-8',
    )


def main():
    banner('SONARA - LEVO2 CLEAN NOTEBOOK INSTALLER / R&D ONLY')
    print('Target: isolated clean notebook, RTX PRO 6000 / CUDA 12.8', flush=True)
    print('Official clone:', OFFICIAL_REPO, flush=True)
    print('No ACE-Step files are touched.', flush=True)
    ensure_clean_root()
    clone_official_repo()
    materialize_git_lfs_files()
    make_venv()
    install_dependencies()
    download_runtime_and_model()
    wire_runtime()
    write_runner()
    verify_only_no_generation()
    banner('LEVO2 CLEAN INSTALL COMPLETED')
    print(f'ROOT   : {ROOT}')
    print(f'REPO   : {REPO}')
    print(f'MODEL  : {MODEL}')
    print(f'PYTHON : {PY}')
    print(f'RUNNER : {ROOT / "run_levo2.sh"}')
    print('GENERATION TEST: NOT RUN (installation/CUDA verification only)')
    print('LICENSE: research/education only; commercial/production use prohibited.')


if __name__ == '__main__':
    main()
