import os
import sys
import urllib.request
from pathlib import Path

PINNED_V3 = "https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/e4924bff04775f23566ba4c3801139e6e58cb812/scripts/molab-sonara-xl-connect.py"


def prepare_active_env():
    active = os.environ.get("VIRTUAL_ENV", "").strip()
    if not active and Path("/tmp/uv-venv").exists():
        active = "/tmp/uv-venv"
        os.environ["VIRTUAL_ENV"] = active

    if not active:
        print("VIRTUAL_ENV non impostato; continuo con il rilevamento standard.", flush=True)
        return None

    env_root = Path(active)
    bin_dir = env_root / "bin"
    current_path = os.environ.get("PATH", "")
    if bin_dir.exists():
        os.environ["PATH"] = f"{bin_dir}:{current_path}"

    print(f"MoLab active VIRTUAL_ENV: {env_root}", flush=True)
    print(f"PATH prioritario: {bin_dir}", flush=True)

    cli = bin_dir / "acestep-api"
    py = bin_dir / "python"
    py3 = bin_dir / "python3"
    print(f"acestep-api diretto: {cli} | exists={cli.exists()}", flush=True)
    print(f"python attivo: {py if py.exists() else py3} | exists={py.exists() or py3.exists()}", flush=True)

    # Evita che uv ignori l'ambiente MoLab quando il bridge arriva al fallback uv.
    os.environ["UV_PROJECT_ENVIRONMENT"] = active
    return env_root


def run_bridge():
    prepare_active_env()

    req = urllib.request.Request(
        PINNED_V3,
        headers={"Cache-Control": "no-cache", "Pragma": "no-cache"},
    )
    source = urllib.request.urlopen(req, timeout=60).read().decode("utf-8")
    if "find_python_runtimes" not in source:
        raise RuntimeError("Bridge V3 inatteso: file non valido.")

    # Patch mirata: se V3 deve usare uv, forza --active per rispettare /tmp/uv-venv.
    source = source.replace(
        "return [uv, 'run', '--no-sync', 'acestep-api'], base",
        "return [uv, 'run', '--active', '--no-sync', 'acestep-api'], base",
    )

    namespace = {"__name__": "__main__"}
    exec(compile(source, "sonara_molab_v4_runtime.py", "exec"), namespace)


if __name__ == "__main__":
    run_bridge()
