#!/usr/bin/env python3
from pathlib import Path

EDGE = Path('cloudflare/sonara-real-music-v2-edge.mjs')
MARKER = 'sonara-natural-tone-v15-silk'


def require(text: str, marker: str, label: str) -> None:
    if marker not in text:
        raise SystemExit(f'{label}=MISSING')
    print(f'{label}=OK')


def main() -> None:
    text = EDGE.read_text(encoding='utf-8')
    require(text, MARKER, 'EDGE_NATURAL_TONE_V15_SILK')
    require(text, "dcwMode: 'low'", 'EDGE_DCW_LOW')
    require(text, 'dcwLowScaler: 0.02', 'EDGE_DCW_LOW_SCALER')
    require(text, 'dcwHighScaler: 0.0', 'EDGE_DCW_HIGH_SCALER')
    require(text, 'harshnessGuard: true', 'EDGE_HARSHNESS_GUARD')
    require(text, 'smoothTopEnd: true', 'EDGE_SMOOTH_TOP_END')
    require(text, 'fxRestraint: true', 'EDGE_FX_RESTRAINT')
    print('SONARA_NATURAL_TONE_V15_SILK_EDGE=VERIFIED')
    print('PRODUCTION_SOURCE_MUTATION=NONE')


if __name__ == '__main__':
    main()
