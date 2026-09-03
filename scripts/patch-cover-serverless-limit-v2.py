from pathlib import Path

SOURCE = Path('api/music-cover/generate.ts')
SHARED = Path('src/server/musicCoverApi.ts')
ELEVEN = Path('api/eleven-music/[...path].ts')
GEN = Path('src/components/generator/ElevenMusicGenerationControl.tsx')
DEPLOY = Path('.github/workflows/deploy-sonara-music-director-v3.yml')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f'{label}=ALREADY')
        return text
    if old not in text:
        raise SystemExit(f'{label}=MARKER_NOT_FOUND')
    print(f'{label}=PATCHED')
    return text.replace(old, new, 1)


def migrate_cover_handler():
    if SOURCE.exists():
        source = SOURCE.read_text(encoding='utf-8')
        source = replace_once(
            source,
            'export default async function handler(req: any, res: any) {',
            'export async function handleMusicCoverRequest(req: any, res: any) {',
            'COVER_EXPORT_SHARED_HANDLER'
        )
        SHARED.parent.mkdir(parents=True, exist_ok=True)
        SHARED.write_text(source, encoding='utf-8')
        SOURCE.unlink()
        try:
            SOURCE.parent.rmdir()
        except OSError:
            pass
        print('COVER_STANDALONE_FUNCTION=REMOVED')
    elif SHARED.exists():
        print('COVER_SHARED_HANDLER=ALREADY')
    else:
        raise SystemExit('COVER_SOURCE=MISSING')


def patch_eleven_router():
    text = ELEVEN.read_text(encoding='utf-8')
    import_line = "import { handleMusicCoverRequest } from '../../src/server/musicCoverApi';\n"
    if import_line not in text:
        text = import_line + text
        print('ELEVEN_COVER_IMPORT=PATCHED')
    route_old = """export default async function handler(req: any, res: any) {
  const action = actionFromRequest(req);

  if (req.method === 'GET' && action === 'health') {"""
    route_new = """export default async function handler(req: any, res: any) {
  const action = actionFromRequest(req);

  // Cover generation deliberately reuses this existing Vercel function so
  // SONARA stays within the project Serverless Function limit. The cover
  // handler performs its own native/Firebase user authentication.
  if (action === 'cover') return handleMusicCoverRequest(req, res);

  if (req.method === 'GET' && action === 'health') {"""
    text = replace_once(text, route_old, route_new, 'ELEVEN_COVER_ROUTE')
    ELEVEN.write_text(text, encoding='utf-8')


def patch_frontend():
    text = GEN.read_text(encoding='utf-8')
    text = text.replace("fetch('/api/music-cover/generate'", "fetch('/api/eleven-music/cover'")
    GEN.write_text(text, encoding='utf-8')
    print('GEN_COVER_ENDPOINT=PATCHED')


def patch_deploy():
    text = DEPLOY.read_text(encoding='utf-8')
    text = text.replace('      - "api/music-cover/generate.ts"\n', '      - "src/server/musicCoverApi.ts"\n      - "api/eleven-music/[...path].ts"\n')
    text = text.replace("grep -Fq \"'/api/music-cover/generate'\" src/components/generator/ElevenMusicGenerationControl.tsx", "grep -Fq \"'/api/eleven-music/cover'\" src/components/generator/ElevenMusicGenerationControl.tsx")
    text = text.replace("grep -Fq 'OPENAI_IMAGES_URL' api/music-cover/generate.ts", "grep -Fq 'OPENAI_IMAGES_URL' src/server/musicCoverApi.ts\n          grep -Fq \"action === 'cover'\" 'api/eleven-music/[...path].ts'")
    DEPLOY.write_text(text, encoding='utf-8')
    print('DEPLOY_COVER_SERVERLESS_LIMIT=PATCHED')


migrate_cover_handler()
patch_eleven_router()
patch_frontend()
patch_deploy()
print('SONARA_COVER_SERVERLESS_LIMIT_V2=PATCHED')
