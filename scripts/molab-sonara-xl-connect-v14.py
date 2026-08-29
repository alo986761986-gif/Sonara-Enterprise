import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

V13 = "https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/main/scripts/molab-sonara-xl-connect-v13.py"
UV = "/usr/local/bin/uv"


def run(cmd, *, check=True):
    print("$ " + " ".join(map(str, cmd)), flush=True)
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.stdout:
        print(p.stdout.rstrip(), flush=True)
    if p.stderr:
        print(p.stderr.rstrip(), flush=True)
    if check and p.returncode != 0:
        raise RuntimeError("Comando fallito:\n" + (p.stdout or "") + "\n" + (p.stderr or ""))
    return p


def choose_cuda_python():
    candidates = []
    for x in [
        "/marimo/.venv/bin/python",
        "/tmp/uv-venv/bin/python",
        sys.executable,
        "/usr/local/bin/python3.12",
        "/usr/bin/python3.12",
    ]:
        if x and Path(x).exists() and x not in candidates:
            candidates.append(x)
    for py in candidates:
        p = subprocess.run(
            [py, "-c", "import torch; print(torch.__version__); print(torch.version.cuda or ''); print(torch.cuda.is_available())"],
            capture_output=True,
            text=True,
        )
        if p.returncode == 0 and p.stdout.strip().splitlines()[-1] == "True":
            print("PYTHON CUDA SELEZIONATO:", py, flush=True)
            print(p.stdout.strip(), flush=True)
            return py
    raise RuntimeError("Nessun Python MoLab con Torch+CUDA attivo.")


def torch_info(py):
    p = run([
        py,
        "-c",
        "import torch; print(torch.__version__); print(torch.version.cuda or '')",
    ])
    lines = [x.strip() for x in p.stdout.splitlines() if x.strip()]
    full = lines[0]
    cuda = lines[1] if len(lines) > 1 else ""
    base = full.split("+", 1)[0]
    suffix = full.split("+", 1)[1] if "+" in full else ""
    if not suffix.startswith("cu") and cuda:
        suffix = "cu" + cuda.replace(".", "")
    return full, base, cuda, suffix


def can_import(py, module):
    return subprocess.run([py, "-c", f"import {module}"], capture_output=True, text=True).returncode == 0


def install_from_torch_index(py, package, version, suffix):
    index = f"https://download.pytorch.org/whl/{suffix}" if suffix.startswith("cu") else "https://download.pytorch.org/whl/cpu"
    attempts = [f"{package}=={version}"]
    if suffix.startswith("cu"):
        attempts.insert(0, f"{package}=={version}+{suffix}")
    last = None
    for spec in attempts:
        p = run([UV, "pip", "install", "--python", py, "--no-deps", "--index-url", index, spec], check=False)
        last = p
        if p.returncode == 0 and can_import(py, package):
            print(f"{package}=OK", flush=True)
            return
    raise RuntimeError(
        f"Impossibile installare {package} compatibile con Torch.\n"
        + ((last.stdout or "") if last else "")
        + "\n"
        + ((last.stderr or "") if last else "")
    )


def ensure_gpu_companions(py):
    full, base, cuda, suffix = torch_info(py)
    print(f"TORCH={full}", flush=True)
    print(f"CUDA={cuda}", flush=True)
    print(f"PYTORCH_INDEX={suffix or 'cpu'}", flush=True)

    if not can_import(py, "torchaudio"):
        print("torchaudio mancante: installo la build ESATTAMENTE abbinata a Torch.", flush=True)
        install_from_torch_index(py, "torchaudio", base, suffix)
    else:
        print("torchaudio=OK", flush=True)

    if not can_import(py, "torchvision"):
        major_minor = tuple(int(x) for x in base.split(".")[:2])
        vision_map = {
            (2, 10): "0.25.0",
            (2, 9): "0.24.0",
            (2, 8): "0.23.0",
            (2, 7): "0.22.1",
            (2, 6): "0.21.0",
            (2, 5): "0.20.1",
            (2, 4): "0.19.1",
            (2, 3): "0.18.1",
            (2, 2): "0.17.2",
        }
        vv = vision_map.get(major_minor)
        if vv:
            print(f"torchvision mancante: installo {vv} compatibile con Torch {base}.", flush=True)
            install_from_torch_index(py, "torchvision", vv, suffix)
    else:
        print("torchvision=OK", flush=True)

    if not can_import(py, "torchao"):
        print("torchao mancante: installo senza modificare Torch.", flush=True)
        run([UV, "pip", "install", "--python", py, "--no-deps", "torchao>=0.16.0,<0.17.0"])
    else:
        print("torchao=OK", flush=True)

    if not can_import(py, "torchcodec"):
        print("torchcodec mancante: installo senza modificare Torch.", flush=True)
        run([UV, "pip", "install", "--python", py, "--no-deps", "torchcodec>=0.9.1"])
    else:
        print("torchcodec=OK", flush=True)

    verify = run([
        py,
        "-c",
        "import torch,torchaudio; print('GPU_STACK_OK'); print('TORCH='+torch.__version__); print('TORCHAUDIO='+torchaudio.__version__); print('CUDA='+str(torch.cuda.is_available()))",
    ])
    if "GPU_STACK_OK" not in verify.stdout or "CUDA=True" not in verify.stdout:
        raise RuntimeError("Stack GPU non verificato dopo la riparazione.")


def main():
    print("=" * 78)
    print(" SONARA MOLAB XL V14 - RIPARAZIONE DEFINITIVA STACK GPU ")
    print("=" * 78)
    py = choose_cuda_python()
    ensure_gpu_companions(py)
    print("\nStack GPU riparato. Avvio bridge V13...\n", flush=True)
    code = urllib.request.urlopen(V13, timeout=60).read().decode("utf-8")
    exec(compile(code, V13, "exec"), {"__name__": "__main__", "__file__": V13})


if __name__ == "__main__":
    main()
