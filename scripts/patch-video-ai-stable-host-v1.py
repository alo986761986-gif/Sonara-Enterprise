#!/usr/bin/env python3
from pathlib import Path

PROVIDER = Path('api/video/provider.ts')
ROUTE = Path('api/video/[...path].ts')
STABLE = 'https://video-ai.sonaraenterprise.com'


def patch_provider(text: str) -> str:
    candidates = [
        "function molabBaseUrl() {\n  return String(process.env.SONARA_MOLAB_VIDEO_URL || '').trim().replace(/\\/+$/, '');\n}",
        "const SONARA_STABLE_MOLAB_VIDEO_URL = 'https://video-ai.sonaraenterprise.com';\n\nfunction molabBaseUrl() {\n  return String(process.env.SONARA_MOLAB_VIDEO_URL || SONARA_STABLE_MOLAB_VIDEO_URL).trim().replace(/\\/+$/, '');\n}"
    ]
    replacement = "const SONARA_STABLE_MOLAB_VIDEO_URL = 'https://video-ai.sonaraenterprise.com';\n\nfunction molabBaseUrl() {\n  return SONARA_STABLE_MOLAB_VIDEO_URL;\n}"
    if replacement in text:
        return text
    for old in candidates:
        if old in text:
            return text.replace(old, replacement, 1)
    raise SystemExit('PROVIDER_STABLE_HOST_PATTERN_MISSING')


def patch_route(text: str) -> str:
    candidates = [
        "  const base = String(process.env.SONARA_MOLAB_VIDEO_URL || '').trim().replace(/\\/+$/, '');",
        "  const base = String(process.env.SONARA_MOLAB_VIDEO_URL || 'https://video-ai.sonaraenterprise.com').trim().replace(/\\/+$/, '');"
    ]
    replacement = "  const base = 'https://video-ai.sonaraenterprise.com';"
    if replacement in text:
        return text
    for old in candidates:
        if old in text:
            return text.replace(old, replacement, 1)
    raise SystemExit('ROUTE_STABLE_HOST_PATTERN_MISSING')


def main() -> None:
    p = patch_provider(PROVIDER.read_text(encoding='utf-8'))
    r = patch_route(ROUTE.read_text(encoding='utf-8'))
    PROVIDER.write_text(p, encoding='utf-8')
    ROUTE.write_text(r, encoding='utf-8')
    if STABLE not in p or STABLE not in r:
        raise SystemExit('STABLE_VIDEO_HOST_MARKER_MISSING')
    if 'return SONARA_STABLE_MOLAB_VIDEO_URL;' not in p:
        raise SystemExit('PROVIDER_NOT_FORCED_TO_STABLE_HOST')
    if "const base = 'https://video-ai.sonaraenterprise.com';" not in r:
        raise SystemExit('ROUTE_NOT_FORCED_TO_STABLE_HOST')
    print('SONARA_VIDEO_AI_STABLE_HOST=FORCED')
    print(f'SONARA_MOLAB_VIDEO_URL={STABLE}')
    print('TOKEN=SERVER_ENV_ONLY')


if __name__ == '__main__':
    main()
