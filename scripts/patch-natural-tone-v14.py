#!/usr/bin/env python3
from pathlib import Path

PROMPT = Path('cloudflare/sonara-engine-v15-authoritative-prompt.mjs')
ROUTER = Path('cloudflare/sonara-molab-xl-router.mjs')
MARKER = 'sonara-natural-tone-v15-silk'


def require(text: str, marker: str, label: str) -> None:
    if marker not in text:
        raise SystemExit(f'{label}=MISSING')
    print(f'{label}=OK')


def main() -> None:
    prompt = PROMPT.read_text(encoding='utf-8')
    router = ROUTER.read_text(encoding='utf-8')

    require(prompt, MARKER, 'PROMPT_NATURAL_TONE_V15_SILK')
    require(router, MARKER, 'ROUTER_NATURAL_TONE_V15_SILK')
    require(prompt, 'sonaraHarshnessGuard: true', 'PROMPT_HARSHNESS_GUARD')
    require(prompt, 'sonaraSmoothTopEnd: true', 'PROMPT_SMOOTH_TOP_END')
    require(prompt, 'sonaraFxRestraint: true', 'PROMPT_FX_RESTRAINT')
    require(router, "dcw_mode: 'low'", 'ROUTER_DCW_LOW')
    require(router, 'dcw_scaler: 0.02', 'ROUTER_DCW_SCALER')
    require(router, 'dcw_high_scaler: 0.0', 'ROUTER_DCW_HIGH_SCALER')

    print('SONARA_NATURAL_TONE_V15_SILK=VERIFIED')
    print('PRODUCTION_SOURCE_MUTATION=NONE')


if __name__ == '__main__':
    main()
