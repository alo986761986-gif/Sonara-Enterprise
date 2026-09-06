#!/usr/bin/env python3
from pathlib import Path

PROVIDER = Path('api/video/provider.ts')
ROUTE = Path('api/video/[...path].ts')
STABLE = 'https://video-ai.sonaraenterprise.com'


def patch_file(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding='utf-8')
    if new in text:
        print(f'{label}=ALREADY')
        return
    if old not in text:
        raise SystemExit(f'{label}=PATTERN_MISSING')
    text = text.replace(old, new, 1)
    path.write_text(text, encoding='utf-8')
    print(f'{label}=PATCHED')


def main() -> None:
    patch_file(
        PROVIDER,
        "function molabBaseUrl() {\n  return String(process.env.SONARA_MOLAB_VIDEO_URL || '').trim().replace(/\\/+$/, '');\n}",
        "const SONARA_STABLE_MOLAB_VIDEO_URL = 'https://video-ai.sonaraenterprise.com';\n\nfunction molabBaseUrl() {\n  return String(process.env.SONARA_MOLAB_VIDEO_URL || SONARA_STABLE_MOLAB_VIDEO_URL).trim().replace(/\\/+$/, '');\n}",
        'PROVIDER_STABLE_HOST'
    )

    patch_file(
        ROUTE,
        "  const base = String(process.env.SONARA_MOLAB_VIDEO_URL || '').trim().replace(/\\/+$/, '');",
        "  const base = String(process.env.SONARA_MOLAB_VIDEO_URL || 'https://video-ai.sonaraenterprise.com').trim().replace(/\\/+$/, '');",
        'ROUTE_STABLE_HOST'
    )

    p = PROVIDER.read_text(encoding='utf-8')
    r = ROUTE.read_text(encoding='utf-8')
    if STABLE not in p or STABLE not in r:
        raise SystemExit('STABLE_VIDEO_HOST_MARKER_MISSING')

    print('SONARA_VIDEO_AI_STABLE_HOST=PATCHED')
    print(f'SONARA_MOLAB_VIDEO_URL_DEFAULT={STABLE}')
    print('TOKEN=SERVER_ENV_ONLY')


if __name__ == '__main__':
    main()
