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

def active_ace_processes() -> list[tuple[Path, Path]]:
    """Read only the active ACE API root/checkpoints; never expose process credentials."""
    active = []
    proc = Path("/proc")
    if not proc.is_dir():
        return active
    for entry in proc.iterdir():
        if not entry.name.isdigit():
            continue
        try:
            cmdline = (entry / "cmdline").read_bytes()
            if b"acestep.api_server" not in cmdline:
                continue
            project = None
            checkpoints = None
            try:
                # Parse only two non-secret path variables; do not log all environ.
                for part in (entry / "environ").read_bytes().split(b"\0"):
                    if part.startswith(b"ACESTEP_PROJECT_ROOT="):
                        project = part.partition(b"=")[2].decode("utf-8")
                    if part.startswith(b"ACESTEP_CHECKPOINTS_DIR="):
                        checkpoints = part.partition(b"=")[2].decode("utf-8")
            except OSError:
                pass
            root = Path(project).expanduser() if project else (entry / "cwd").resolve()
            root = root.resolve()
            cp = Path(checkpoints).expanduser().resolve() if checkpoints else root / "checkpoints"
            if root.is_dir():
                active.append((root, cp))
        except (OSError, UnicodeError, ValueError):
            continue
    return list(dict.fromkeys(active))


def python_for(root: Path) -> Path | None:
    for name in (".venv/bin/python", ".venv/bin/python3", "venv/bin/python",
                 ".venv/bin/python3.12", ".venv/bin/python3.13"):
        candidate = root / name
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return candidate
    # ACE-Step may use a shared notebook Python instead of a venv in the root.
    if any(active_root == root for active_root, _ in active_ace_processes()):
        return Path(sys.executable)
    return None


def checkpoints_for(root: Path) -> Path:
    for active_root, active_checkpoints in active_ace_processes():
        if active_root == root and active_checkpoints.is_dir():
            return active_checkpoints
    env_root = os.environ.get("ACESTEP_PROJECT_ROOT")
    env_checkpoints = os.environ.get("ACESTEP_CHECKPOINTS_DIR")
    if env_root and env_checkpoints:
        try:
            if Path(env_root).expanduser().resolve() == root:
                candidate = Path(env_checkpoints).expanduser().resolve()
                if candidate.is_dir():
                    return candidate
        except (OSError, ValueError):
            pass
    return root / "checkpoints"


def candidate_roots() -> list[Path]:
    candidates = [Path(p) for p in CANDIDATES]
    for key in ("ACESTEP_PROJECT_ROOT",):
        if os.environ.get(key):
            candidates.append(Path(os.environ[key]).expanduser())
    for root, _ in active_ace_processes():
        candidates.append(root)
    here = Path.cwd()
    candidates.extend((here, here.parent))
    # A MoLab notebook can be recreated under different folder names.
    # Shallow discovery only (max two levels) to avoid scanning user files.
    for parent in (Path("/marimo"), Path("/home/marimo"), Path.home()):
        try:
            for child in list(parent.iterdir())[:80]:
                if not child.is_dir() or child.is_symlink():
                    continue
                if "ace" in child.name.lower() or "sonara" in child.name.lower():
                    candidates.append(child)
                    for sub in list(child.iterdir())[:80]:
                        if sub.is_dir() and not sub.is_symlink() and ("ace" in sub.name.lower() or (sub / "checkpoints").is_dir()):
                            candidates.append(sub)
        except (OSError, PermissionError):
            continue
    return list(dict.fromkeys(p.resolve() for p in candidates if p.is_dir()))


def eligible(root: Path) -> bool:
    cp = checkpoints_for(root)
    if not (root.is_dir() and cp.is_dir() and python_for(root) is not None):
        return False
    if (cp / TURBO).is_dir():
        return True
    # Some active ACE environments use a shared model cache not visible as
    # a named folder. Only accept this if the running API confirms XL Turbo.
    active = any(active_root == root for active_root, _ in active_ace_processes())
    state = health() if active else {}
    return (active and state.get("models_initialized") is True
            and "acestep-v15-xl-turbo" in str(state.get("loaded_model", "")))


def choose_root(explicit: str | None) -> Path:
    if explicit:
        root = Path(explicit).expanduser().resolve(strict=True)
        if not eligible(root):
            raise Blocked("Runtime non verificato nel percorso --root: " + str(root))
        return root
    roots = candidate_roots()
    ready = [root for root in roots if eligible(root)]
    active_roots = [root for root, _ in active_ace_processes()]
    active_ready = [root for root in ready if root in active_roots]
    if len(active_ready) == 1:
        return active_ready[0]
    if len(ready) == 1:
        return ready[0]
    if not ready:
        # Diagnostics intentionally contain paths and booleans only, never tokens.
        snapshots = []
        for root in roots:
            if (root / "checkpoints").is_dir() or python_for(root) is not None:
                cp = checkpoints_for(root)
                snapshots.append({
                    "root": str(root),
                    "checkpoints": str(cp),
                    "turbo": (cp / TURBO).is_dir(),
                    "lm4b": (cp / LM).is_dir(),
                    "python": python_for(root) is not None,
                })
        print("SONARA_XL_SFT_RUNTIME_DIAGNOSTICS=" +
              json.dumps(snapshots[:12], ensure_ascii=False), flush=True)
        print("SONARA_ACE_API_HEALTH=" +
              json.dumps({key: health().get(key) for key in
                          ("models_initialized", "llm_initialized", "loaded_model",
                           "loaded_lm_model")}), flush=True)
        raise Blocked("Runtime ACE-Step non trovato in modo sicuro. Nessuna modifica.")
    print("SONARA_XL_SFT_RUNTIME_CHOICES=" +
          json.dumps([str(root) for root in ready]), flush=True)
    raise Blocked("Piu runtime disponibili: indicare --root con il percorso attivo")


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
    location = checkpoints_for(root) / SFT
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
        checkpoints = checkpoints_for(root)
        target = checkpoints / SFT
        if target.is_symlink():
            raise Blocked("Percorso SFT symlink non sicuro")
        print("SONARA_ACE_STEP_ROOT=" + str(root), flush=True)
        print("SONARA_XL_TURBO_PRESENT=" + str((checkpoints / TURBO).is_dir()), flush=True)
        print("SONARA_LM_4B_PRESENT=" + str((checkpoints / LM).is_dir()), flush=True)
        print("SONARA_CHECKPOINTS_DIR=" + str(checkpoints), flush=True)
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
