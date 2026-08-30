#!/usr/bin/env python3
from __future__ import annotations

import os
import subprocess
import sys
import urllib.request
from pathlib import Path

BASE_URL = (
    "https://raw.githubusercontent.com/alo986761986-gif/"
    "Sonara-Enterprise/main/scripts/sonara_yue_v9_bootstrap.py"
)


def main():
    # scipy==1.10.1 in the upstream YuE-exllamav2 requirements is safest on
    # Python 3.11, while matching ExLlamaV2/FlashAttention wheels exist for it.
    python311 = None
    for candidate in ["python3.11", "/usr/bin/python3.11", "/usr/local/bin/python3.11"]:
        try:
            result = subprocess.run(
                [candidate, "-c", "import sys; print(sys.executable)"],
                capture_output=True,
                text=True,
                check=False,
            )
        except Exception:
            continue
        if result.returncode == 0:
            python311 = result.stdout.strip() or candidate
            break

    request = urllib.request.Request(BASE_URL, headers={"User-Agent": "SONARA-YuE-V9-Safe"})
    with urllib.request.urlopen(request, timeout=30) as response:
        source = response.read().decode("utf-8")

    if python311:
        # Make Python 3.11 the first choice without mutating the base script.
        source = source.replace(
            '        shutil.which("python3.12"),\n        shutil.which("python3.11"),',
            '        shutil.which("python3.11"),\n        shutil.which("python3.12"),',
            1,
        )
    else:
        print("[V9] Python 3.11 non trovato; uso il miglior Python compatibile disponibile.", flush=True)

    target = Path("/marimo/sonara_yue_v9_bootstrap_runtime.py")
    compile(source, str(target), "exec")
    target.write_text(source, encoding="utf-8")

    env = os.environ.copy()
    env.setdefault("SONARA_YUE_V9_SLOTS", "2")
    env.setdefault("SONARA_YUE_V9_GUIDANCE", "0")
    env.setdefault("SONARA_YUE_V9_STAGE1_CACHE_MODE", "FP16")
    env.setdefault("SONARA_YUE_V9_STAGE2_CACHE_MODE", "FP16")
    env.setdefault("SONARA_YUE_V9_STAGE2_CACHE", "65536")

    return subprocess.call([sys.executable, str(target)], env=env)


if __name__ == "__main__":
    raise SystemExit(main())
