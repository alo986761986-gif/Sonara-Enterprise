#!/usr/bin/env python3
from pathlib import Path

EDGE = Path('cloudflare/sonara-real-music-v2-edge.mjs')
MARKER = 'sonara-natural-tone-v14'


def replace_all(text: str, old: str, new: str, expected_min: int, label: str) -> str:
    if new in text and old not in text:
        print(f'{label}=ALREADY')
        return text
    count = text.count(old)
    if count < expected_min:
        raise SystemExit(f'{label}=PATTERN_MISSING count={count} expected>={expected_min}')
    print(f'{label}=PATCHED count={count}')
    return text.replace(old, new)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f'{label}=ALREADY')
        return text
    if old not in text:
        raise SystemExit(f'{label}=PATTERN_MISSING')
    print(f'{label}=PATCHED')
    return text.replace(old, new, 1)


def main() -> None:
    text = EDGE.read_text(encoding='utf-8')

    text = replace_once(
        text,
        "const REALISM_API_MARKER = 'sonara-realism-api-v2';\nconst MODEL = 'acestep-v15-xl-turbo';",
        "const REALISM_API_MARKER = 'sonara-realism-api-v2';\nconst NATURAL_TONE_PROFILE = 'sonara-natural-tone-v14';\nconst MODEL = 'acestep-v15-xl-turbo';",
        'V2_EDGE_TONE_MARKER'
    )

    text = replace_all(
        text,
        "    dcwMode: 'double',\n    dcwLowScaler: 0.02,\n    dcwHighScaler: 0.06,",
        "    dcwMode: 'low',\n    dcwLowScaler: 0.02,\n    dcwHighScaler: 0.0,\n    naturalToneProfile: NATURAL_TONE_PROFILE,\n    harshnessGuard: true,\n    smoothTopEnd: true,\n    fxRestraint: true,",
        2,
        'V2_EDGE_CONSERVATIVE_DCW'
    )

    text = replace_once(
        text,
        "    headers.set('x-sonara-realism-api', REALISM_API_MARKER);\n    headers.set('x-sonara-lm-backend', health.lmBackend || 'pt');",
        "    headers.set('x-sonara-realism-api', REALISM_API_MARKER);\n    headers.set('x-sonara-natural-tone', NATURAL_TONE_PROFILE);\n    headers.set('x-sonara-lm-backend', health.lmBackend || 'pt');",
        'V2_EDGE_TONE_HEADER'
    )

    EDGE.write_text(text, encoding='utf-8')

    if MARKER not in text:
        raise SystemExit('V2_EDGE_NATURAL_TONE_MARKER_MISSING')
    if "dcwMode: 'double'" in text or 'dcwHighScaler: 0.06' in text:
        raise SystemExit('V2_EDGE_HARSH_OVERRIDE_STILL_PRESENT')

    print('SONARA_NATURAL_TONE_V14_EDGE=PATCHED')
    print('DCW_OVERRIDE=low low_scaler=0.02 high_scaler=0.0')


if __name__ == '__main__':
    main()
