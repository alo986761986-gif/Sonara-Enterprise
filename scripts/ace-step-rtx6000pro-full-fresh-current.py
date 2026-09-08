#!/usr/bin/env python3
from __future__ import annotations

import urllib.request

SOURCE = (
    "https://raw.githubusercontent.com/"
    "alo986761986-gif/Sonara-Enterprise/"
    "ddde735330ebb0ec15f6b497d7077036c37ed1a7/"
    "scripts/ace-step-rtx6000pro-full-fresh-bootstrap-0905.py"
)
LATEST_SONARA_PIN = "ddde735330ebb0ec15f6b497d7077036c37ed1a7"


def fetch(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "Cache-Control": "no-cache, no-store, max-age=0",
            "Pragma": "no-cache",
            "User-Agent": "SONARA-RTX6000PRO-CURRENT/20260908",
        },
    )
    with urllib.request.urlopen(req, timeout=180) as response:
        return response.read().decode("utf-8")


def main() -> None:
    print("=" * 112, flush=True)
    print(" SONARA RTX 6000 PRO - ACE-STEP XL-TURBO - FULL FRESH CURRENT ", flush=True)
    print("=" * 112, flush=True)
    print(f"SONARA_SOURCE_PIN={LATEST_SONARA_PIN}", flush=True)
    print("MODEL=acestep-v15-xl-turbo", flush=True)
    print("REFINEMENT_MODEL=acestep-v15-xl-base", flush=True)
    print("LM_MODEL=acestep-5Hz-lm-4B", flush=True)
    print("FAST=1_STEP QUALITY=2_STEPS ULTRA=2_STEPS MAX_BATCH_SIZE=2", flush=True)
    print("VOCAL_ASR_V3=ON", flush=True)
    print("CPU_OFFLOAD=OFF", flush=True)
    print("EDGE_PROFILES=CURRENT_SONARA_MAIN", flush=True)
    print("=" * 112, flush=True)

    code = fetch(SOURCE)

    # Move the proven full-fresh installer to the latest verified SONARA source pin.
    code = code.replace(
        "SONARA_PIN = 'eab023fb99127b85318e8a7522cdb8db6d6d5d09'",
        f"SONARA_PIN = '{LATEST_SONARA_PIN}'",
        1,
    )

    # The production contract currently used by SONARA is FAST1 / QUALITY2 / ULTRA2.
    code = code.replace("PRODUCTION_SPEED=FAST1_QUALITY2_ULTRA8", "PRODUCTION_SPEED=FAST1_QUALITY2_ULTRA2")
    code = code.replace("'ultra_inference_steps': 8,", "'ultra_inference_steps': 2,")
    code = code.replace(
        "SONARA RTX 6000 PRO FULL FRESH 0905",
        "SONARA RTX 6000 PRO FULL FRESH CURRENT 20260908",
    )

    ns = {
        "__name__": "_sonara_rtx6000pro_current_",
        "__file__": SOURCE,
    }
    exec(compile(code, SOURCE, "exec"), ns)
    ns["main"]()


if __name__ == "__main__":
    main()
