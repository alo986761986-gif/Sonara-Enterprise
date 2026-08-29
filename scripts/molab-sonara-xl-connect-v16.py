import subprocess
import urllib.request
from pathlib import Path

PY = "/marimo/.venv/bin/python"
UV = "/usr/local/bin/uv"
V15 = "https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/main/scripts/molab-sonara-xl-connect-v15.py"


def run(cmd, check=True):
    print("$ " + " ".join(map(str, cmd)), flush=True)
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.stdout:
        print(p.stdout.rstrip(), flush=True)
    if p.stderr:
        print(p.stderr.rstrip(), flush=True)
    if check and p.returncode != 0:
        raise RuntimeError((p.stdout or "") + "\n" + (p.stderr or ""))
    return p


def main():
    print("=" * 78)
    print(" SONARA MOLAB XL V16 - ACCELERATE + META-TENSOR FIX ")
    print("=" * 78)

    if not Path(PY).exists():
        raise RuntimeError(f"Python CUDA non trovato: {PY}")

    print("Installo/verifico accelerate nello stesso ambiente CUDA MoLab...", flush=True)
    run([UV, "pip", "install", "--python", PY, "accelerate>=1.12.0"])

    verify = run([
        PY,
        "-c",
        "import torch,accelerate,vector_quantize_pytorch; "
        "print('ACCELERATE='+accelerate.__version__); "
        "print('VECTOR_QUANTIZE=OK'); "
        "print('TORCH='+torch.__version__); "
        "print('CUDA='+str(torch.cuda.is_available()))",
    ])
    if "CUDA=True" not in verify.stdout:
        raise RuntimeError("CUDA non disponibile dopo installazione accelerate")

    print("\nAccelerate OK. Rilancio la patch meta-tensor V15 e ACE-Step XL...\n", flush=True)
    code = urllib.request.urlopen(V15, timeout=60).read().decode("utf-8")
    exec(compile(code, V15, "exec"), {"__name__": "__main__", "__file__": V15})


if __name__ == "__main__":
    main()
