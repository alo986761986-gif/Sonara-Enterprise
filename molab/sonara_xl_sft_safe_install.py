#!/usr/bin/env python3
"""Install ACE-Step XL SFT weights alongside an existing XL Turbo + LM 4B on MoLab.

This is a checkpoint-only operation. It does not restart the ACE API, modify
Cloudflare, alter existing models, create jobs or activate SFT on the live site.
Run INSIDE the authorized MoLab notebook, not on a GitHub runner.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request

SFT = "acestep-v15-xl-sft"
TURBO = "acestep-v15-xl-turbo"
LM = "acestep-5Hz-lm-4B"
MIN_MODEL_BYTES = 18_000_000_000
MIN_FREE_BYTES = 24_000_000_000
CANDIDATES = (
    "/marimo/SONARA-ACE-Step-CLEAN",
    "/home/marimo/ACE-STEP/ACE-Step-1.5",
    "/marimo/SONARA-ACE-Step-1.5",
    "/marimo/ACE-Step-1.5",
    "/home/marimo/SONARA-ACE-Step-CLEAN",
    "/home/marimo/SONARA-ACE-Step-1.5",
)

class Blocked(RuntimeError):
    pass

def python_for(root: Path) -> Path | None:
    for name in (".venv/bin/python", ".venv/bin/python3", "venv/bin/python"):
        candidate = root / name
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return candidate
    return None

def eligible(root: Path) -> bool:
    checkpoints = root / "checkpoints"
    return (root.is_dir() and python_for(root) is not None
            and (checkpoints / TURBO).is_dir()
            and (checkpoints / LM).is_dir())

def active_cwds() -> set[Path]:
    results = set()
    proc = Path("/proc")
    if proc.is_dir():
        for entry in proc.iterdir():
            if not entry.name.isdigit():
                continue
            try:
                if b"acestep.api_server" in (entry / "cmdline").read_bytes():
                    results.add((entry / "cwd").resolve(strict=True))
            except (OSError, RuntimeError):
                pass
    return results

def choose_root(explicit: str | None) -> Path:
    if explicit:
        root = Path(explicit).expanduser().resolve(strict=True)
        if not eligible(root):
            raise Blocked("Il percorso non contiene il runtime ACE-Step Turbo + LM 4B")
        return root
    found = list(dict.fromkeys(Path(p).resolve() for p in CANDIDATES if eligible(Path(p))))
    if not found:
        raise Blocked("Ambiente ACE-Step Turbo + LM 4B non individuato. Nessuna modifica.")
    if len(found) == 1:
        return found[0]
    matches = [root for root in found if root in active_cwds()]
    if len(matches) == 1:
        return matches[0]
    print("SONARA_RUNTIMES_FOUND=" + json.dumps([str(x) for x in found]), flush=True)
    raise Blocked("Trovati piu runtime: ripetere con --root PERCORSO_DEL_RUNTIME_ATTIVO")

def health() -> dict:
    try:
        op = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        req = urllib.request.Request("http://127.0.0.1:8001/health",
                                     headers={"Accept": "application/json"})
        with op.open(req, timeout=4) as response:
            data = json.load(response) if response.status == 200 else {}
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError, TimeoutError):
        return {}

def weights_verified(folder: Path, minimum: int = MIN_MODEL_BYTES) -> tuple[bool, str]:
    if folder.is_symlink() or not folder.is_dir():
        return False, "cartella mancante o symlink"
    index_file = folder / "model.safetensors.index.json"
    config_file = folder / "config.json"
    if not index_file.is_file() or not config_file.is_file():
        return False, "config o indice dei pesi mancanti"
    try:
        index = json.loads(index_file.read_text("utf-8"))
        json.loads(config_file.read_text("utf-8"))
        names = set(index["weight_map"].values())
        if len(names) != 4 or any(not isinstance(n, str) or n != Path(n).name
                                   or not n.endswith(".safetensors") for n in names):
            return False, "indice dei quattro shard non valido"
        total = 0
        for name in names:
            item = folder / name
            if item.is_symlink() or not item.is_file():
                return False, "shard mancante: " + name
            total += item.stat().st_size
        expected = int(index.get("metadata", {}).get("total_size", 0) or 0)
        if total < max(minimum, expected):
            return False, "shard incompleti: " + str(total) + " bytes"
        if not any(folder.glob("modeling*.py")) or not (folder / "silence_latent.pt").is_file():
            return False, "codice modello o silence_latent mancante"
        return True, "4 shards, " + str(total) + " bytes"
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return False, "indice non leggibile"

def inventory(folder: Path) -> dict[str, tuple[int, int]]:
    """Check that model weights already used by SONARA remain untouched."""
    found = {}
    for current, dirs, files in os.walk(folder, followlinks=False):
        dirs[:] = [d for d in dirs if not (Path(current) / d).is_symlink()]
        for filename in files:
            item = Path(current) / filename
            st = item.lstat()
            found[str(item.relative_to(folder))] = (st.st_size, st.st_mtime_ns)
    return found

def download_only_new_model(python: Path, root: Path) -> None:
    test = subprocess.run([str(python), "-c",
                           "from huggingface_hub import snapshot_download"],
                          cwd=root, capture_output=True, timeout=80, check=False)
    if test.returncode:
        raise Blocked("huggingface_hub non disponibile nella venv ACE-Step. Ambiente non modificato.")
    code = (
        "import sys\n"
        "from huggingface_hub import snapshot_download\n"
        "snapshot_download(repo_id='ACE-Step/acestep-v15-xl-sft', local_dir=sys.argv[1])\n"
        "print('SONARA_XL_SFT_OFFICIAL_DOWNLOAD_OK=True', flush=True)\n"
    )
    location = root / "checkpoints" / SFT
    environment = os.environ.copy()
    environment["PYTHONUNBUFFERED"] = "1"
    completed = subprocess.run([str(python), "-u", "-c", code, str(location)],
                               cwd=root, env=environment, check=False)
    if completed.returncode:
        raise Blocked("Download Hugging Face interrotto; Turbo e LM originali non toccati")

def run(argv=None) -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="Controllo senza scaricare")
    mode.add_argument("--install", action="store_true", help="Installa solo XL SFT")
    parser.add_argument("--root", help="Percorso ACE-Step se ci sono piu runtime")
    args = parser.parse_args(argv)
    print("=== SONARA XL SFT - INSTALLAZIONE ISOLATA ===", flush=True)
    try:
        root = choose_root(args.root)
        checkpoints = root / "checkpoints"
        target = checkpoints / SFT
        if target.is_symlink():
            raise Blocked("Percorso SFT symlink non sicuro")
        print("SONARA_ACE_STEP_ROOT=" + str(root), flush=True)
        print("SONARA_XL_TURBO_PRESENT=True", flush=True)
        print("SONARA_LM_4B_PRESENT=True", flush=True)
        api_before = health()
        print("SONARA_ACE_HTTP_200=" + str(bool(api_before)), flush=True)
        print("SONARA_ACE_ACTIVE_MODEL=" + str(api_before.get("loaded_model", "unknown")), flush=True)
        done, description = weights_verified(target)
        if args.check:
            print("SONARA_XL_SFT_ON_DISK=" + str(done), flush=True)
            print("SONARA_XL_SFT_DETAIL=" + description, flush=True)
            print("SONARA_NO_CHANGES_MADE=True", flush=True)
            return 0
        if not done:
            free = shutil.disk_usage(checkpoints).free
            print("SONARA_FREE_DISK_GB=" + str(round(free / 1e9, 1)), flush=True)
            if free < MIN_FREE_BYTES:
                raise Blocked("Spazio libero insufficiente: servono almeno 24 GB")
            before_turbo = inventory(checkpoints / TURBO)
            before_lm = inventory(checkpoints / LM)
            python = python_for(root)
            assert python is not None
            download_only_new_model(python, root)
            if (before_turbo != inventory(checkpoints / TURBO)
                    or before_lm != inventory(checkpoints / LM)):
                raise Blocked("Rilevata modifica concorrente nei file Turbo o LM")
        done, description = weights_verified(target)
        if not done:
            raise Blocked("Checkpoint SFT non completo: " + description)
        api_after = health()
        if api_before.get("models_initialized") is True and api_after.get("models_initialized") is not True:
            raise Blocked("API ACE-Step non piu pronta; verificare la porta 8001")
        print("SONARA_XL_SFT_INSTALLED_ON_DISK=True", flush=True)
        print("SONARA_XL_SFT_CHECKPOINT_VERIFIED=True", flush=True)
        print("SONARA_XL_SFT_DETAIL=" + description, flush=True)
        print("SONARA_XL_TURBO_UNCHANGED=True", flush=True)
        print("SONARA_LM_4B_UNCHANGED=True", flush=True)
        print("SONARA_API_RESTARTED=False", flush=True)
        print("SONARA_RELAY_RESTARTED=False", flush=True)
        print("SONARA_CUSTOMER_JOBS_CREATED=0", flush=True)
        print("SONARA_XL_SFT_LIVE_ROUTING_ENABLED=False", flush=True)
        return 0
    except (Blocked, OSError, ValueError) as exc:
        print("SONARA_XL_SFT_INSTALL_BLOCKED=" + str(exc), flush=True)
        print("SONARA_EXISTING_ACE_STEP_UNCHANGED=True", flush=True)
        return 1

if __name__ == "__main__":
    raise SystemExit(run())
