import os
import re
import shutil
import subprocess
import time
import urllib.request
from pathlib import Path

SOURCE = "https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/main/scripts/molab-sonara-xl-connect-v8.py"
ACE_DIR = Path("/marimo/SONARA-ACE-Step-1.5")
VENV = ACE_DIR / ".venv"
MODEL = "acestep-v15-xl-turbo"

print("SONARA MoLab XL bridge V11: venv dedicata + API persistente", flush=True)

source = urllib.request.urlopen(SOURCE, timeout=60).read().decode("utf-8")
source = source.replace('/marimo/ACE-Step-1.5', str(ACE_DIR))
source = source.replace('[uv, "run", "--project",', '[uv, "run", "--no-sync", "--project",')

scope = {"__name__": "sonara_molab_bridge_v11_base", "__file__": SOURCE}
exec(compile(source, SOURCE, "exec"), scope, scope)
run_checked = scope["run_checked"]


def fixed_env():
    env = os.environ.copy()
    env.pop("VIRTUAL_ENV", None)
    env["UV_PROJECT_ENVIRONMENT"] = str(VENV)
    env["UV_PYTHON_DOWNLOADS"] = "automatic"
    return env


def ensure_project_env_v11():
    if not ACE_DIR.exists():
        raise RuntimeError(f"ACE-Step non trovato: {ACE_DIR}")
    uv = shutil.which("uv")
    if not uv:
        raise RuntimeError("uv non trovato su MoLab")

    env = fixed_env()
    print(f"ACE_DIR={ACE_DIR}", flush=True)
    print(f"UV_PROJECT_ENVIRONMENT={VENV}", flush=True)

    run_checked([uv, "python", "install", "3.12"], env=env, timeout=600)

    if not (VENV / "bin" / "python").exists():
        if VENV.exists():
            shutil.rmtree(VENV)
        run_checked([uv, "venv", str(VENV), "--python", "3.12"], cwd=str(ACE_DIR), env=env, timeout=600)

    run_checked(
        [uv, "sync", "--project", str(ACE_DIR), "--python", "3.12", "--no-dev"],
        cwd=str(ACE_DIR), env=env, timeout=3600,
    )

    python_bin = VENV / "bin" / "python"
    if not python_bin.exists():
        raise RuntimeError(f"Python ancora assente dopo uv sync: {python_bin}")

    probe = subprocess.run(
        [str(python_bin), "-c",
         "import sys,loguru,torch,fastapi,uvicorn; import acestep.api_server; "
         "print('PYTHON=' + sys.executable); print('LOGURU=OK'); "
         "print('TORCH=' + torch.__version__); print('CUDA=' + str(torch.cuda.is_available())); "
         "print('ACE_STEP_API=OK')"],
        cwd=str(ACE_DIR), env=env, capture_output=True, text=True,
    )
    if probe.returncode != 0:
        raise RuntimeError("Probe ACE-Step fallito:\n" + (probe.stdout or "") + "\n" + (probe.stderr or ""))
    print(probe.stdout.strip(), flush=True)
    if "CUDA=True" not in probe.stdout:
        raise RuntimeError("CUDA non disponibile nel venv ACE-Step")
    return uv, env


scope["ensure_project_env"] = ensure_project_env_v11
scope["main"]()

print("\nSONARA MOLAB BRIDGE ATTIVO. NON FERMARE QUESTA CELLA.", flush=True)
try:
    while True:
        time.sleep(3600)
except KeyboardInterrupt:
    print("SONARA MoLab bridge arrestato.", flush=True)
