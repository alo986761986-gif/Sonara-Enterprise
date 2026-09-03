import { createHash } from 'node:crypto';

const OPENAI_IMAGES_URL = 'https://api.openai.com/v1/images/generations';
const DEFAULT_APP_URL = 'https://sonaraenterprise.com';
const NATIVE_SESSION_MARKER = 'sonara-native-session';
const REQUEST_TIMEOUT_MS = 120_000;
const RATE_WINDOW_MS = 5 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;

const limits = new Map<string, { startedAt: number; count: number }>();

type CoverVariation = 'A' | 'B';
type CoverStyle = 'auto' | 'cinematic' | 'realistic' | 'abstract' | 'minimal' | 'futuristic' | 'dark' | 'tropical' | 'retro';
type CoverTextMode = 'none' | 'title';

type CoverRequest = {
  rawPrompt?: string;
  title?: string;
  genreFamily?: string;
  genre?: string;
  subgenre?: string;
  mood?: string;
  bpm?: number;
  keySignature?: string;
  vocalMode?: string;
  variationId?: CoverVariation;
  generationPairId?: string;
  style?: CoverStyle;
  textMode?: CoverTextMode;
  revision?: number;
};

function json(res: any, status: number, body: Record<string, unknown>) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(body);
}

function bearerToken(req: any): string {
  return String(req.headers?.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
}

async function authenticateWithFirebaseRest(token: string): Promise<string | null> {
  const apiKey = String(process.env.VITE_FIREBASE_API_KEY || process.env.SONARA_FIREBASE_API_KEY || '').trim();
  if (!token || token === NATIVE_SESSION_MARKER || !apiKey) return null;
  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    });
    if (!response.ok) return null;
    const payload = await response.json() as { users?: Array<{ localId?: string }> };
    return String(payload.users?.[0]?.localId || '').trim() || null;
  } catch {
    return null;
  }
}

async function authenticateWithNativeSession(req: any): Promise<string | null> {
  const cookie = String(req.headers?.cookie || '').trim();
  if (!cookie || !/(?:^|;\s*)sonara_session=/.test(cookie)) return null;

  const authBase = String(process.env.SONARA_NATIVE_AUTH_URL || DEFAULT_APP_URL).replace(/\/$/, '');
  try {
    const response = await fetch(`${authBase}/api/sonara-auth/session`, {
      method: 'GET',
      headers: { Accept: 'application/json', Cookie: cookie },
      redirect: 'manual'
    });
    if (!response.ok) return null;
    const payload = await response.json() as { authenticated?: boolean; user?: { uid?: string } | null };
    if (!payload?.authenticated) return null;
    return String(payload.user?.uid || '').trim() || null;
  } catch {
    return null;
  }
}

async function authenticatedUserId(req: any): Promise<string | null> {
  const token = bearerToken(req);
  if (token && token !== NATIVE_SESSION_MARKER) {
    const firebaseUserId = await authenticateWithFirebaseRest(token);
    if (firebaseUserId) return firebaseUserId;
  }
  return authenticateWithNativeSession(req);
}

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const current = limits.get(userId);
  const entry = !current || current.startedAt + RATE_WINDOW_MS <= now
    ? { startedAt: now, count: 0 }
    : current;
  if (entry.count >= MAX_REQUESTS_PER_WINDOW) return true;
  entry.count += 1;
  limits.set(userId, entry);
  return false;
}

function bodyObject(req: any): CoverRequest {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) && !Array.isArray(req.body)) return req.body as CoverRequest;
  if (typeof req.body !== 'string') return {};
  try {
    const parsed = JSON.parse(req.body);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as CoverRequest : {};
  } catch {
    return {};
  }
}

function clean(value: unknown, max = 500): string {
  return String(value || '').replace(/[\u0000-\u001F<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function clampBpm(value: unknown): number {
  const bpm = Number(value);
  return Number.isFinite(bpm) ? Math.max(40, Math.min(240, Math.round(bpm))) : 124;
}

function normalizeStyle(value: unknown): CoverStyle {
  const style = clean(value, 24).toLowerCase();
  return ['auto', 'cinematic', 'realistic', 'abstract', 'minimal', 'futuristic', 'dark', 'tropical', 'retro'].includes(style)
    ? style as CoverStyle
    : 'auto';
}

function normalizeTextMode(value: unknown): CoverTextMode {
  return clean(value, 16).toLowerCase() === 'title' ? 'title' : 'none';
}

function styleDirection(style: CoverStyle): string {
  if (style === 'cinematic') return 'cinematic album artwork, dramatic light, sophisticated depth, premium filmic composition';
  if (style === 'realistic') return 'high-end photographic realism, believable materials and light, editorial music photography';
  if (style === 'abstract') return 'expressive abstract album artwork, bold shapes, rhythm-driven geometry and sophisticated texture';
  if (style === 'minimal') return 'minimal premium album artwork, one iconic focal idea, restrained geometry and generous negative space';
  if (style === 'futuristic') return 'futuristic premium album artwork, advanced materials, luminous atmosphere and elegant sci-fi visual language';
  if (style === 'dark') return 'dark cinematic album artwork, deep contrast, nocturnal atmosphere, controlled dramatic highlights';
  if (style === 'tropical') return 'lush contemporary tropical album artwork, organic light, rich foliage or coastal atmosphere, sophisticated not touristy';
  if (style === 'retro') return 'refined retro-inspired album artwork with period-aware texture, typography-free poster composition and modern finish';
  return 'choose the strongest professional visual direction from the music genre, subgenre, mood and creator brief';
}

function paletteDirection(genre: string, subgenre: string, mood: string): string {
  const haystack = `${genre} ${subgenre} ${mood}`.toLowerCase();
  if (/(tribal|afro|percussion|organic)/.test(haystack)) return 'warm amber, ember orange and deep earth balanced by electric cyan, violet or indigo accents';
  if (/(deep house|melodic|progressive|ambient)/.test(haystack)) return 'deep midnight blue, violet, lilac and restrained cyan with elegant luminous highlights';
  if (/(trap|drill|dark|industrial)/.test(haystack)) return 'black, charcoal, chrome, controlled crimson and cold blue highlights';
  if (/(reggae|dub|tropical)/.test(haystack)) return 'golden sunlight, deep natural green, warm earth and rich analog shadows';
  if (/(rock|metal|punk)/.test(haystack)) return 'high-contrast charcoal, weathered neutrals, selective red or electric accent light';
  if (/(jazz|soul|blues)/.test(haystack)) return 'smoky black, warm tungsten, burgundy, brass and deep blue accents';
  if (/(pop|dance|edm|house)/.test(haystack)) return 'premium violet, cobalt, cyan and magenta gradients with controlled black negative space';
  return 'a coherent premium palette inferred from the requested genre and mood, with strong contrast and streaming-cover readability';
}

function buildCoverPrompt(input: CoverRequest): { prompt: string; variationId: CoverVariation; pairSignature: string } {
  const variationId: CoverVariation = input.variationId === 'B' ? 'B' : 'A';
  const rawPrompt = clean(input.rawPrompt, 900);
  const title = clean(input.title, 120) || 'SONARA Track';
  const genreFamily = clean(input.genreFamily, 80) || 'Music';
  const genre = clean(input.genre, 80) || 'Music';
  const subgenre = clean(input.subgenre, 100) || genre;
  const mood = clean(input.mood, 100) || 'Authentic';
  const keySignature = clean(input.keySignature, 32);
  const vocalMode = clean(input.vocalMode, 24) || 'instrumental';
  const bpm = clampBpm(input.bpm);
  const style = normalizeStyle(input.style);
  const textMode = normalizeTextMode(input.textMode);
  const revision = Math.max(0, Math.min(20, Number(input.revision) || 0));
  const pairId = clean(input.generationPairId, 100) || `${genre}-${subgenre}-${title}`;
  const pairSignature = createHash('sha256').update(pairId).digest('hex').slice(0, 12);

  const variationDirection = variationId === 'A'
    ? 'MASTER A visual: iconic hero composition, direct emotional focal point, strong immediately readable silhouette or central visual motif, polished and memorable.'
    : 'MASTER B visual: alternate composition from the exact same artistic world as A, clearly different scene, framing, camera angle or focal motif; more environmental or cinematic, never a duplicate and never a different genre identity.';

  const revisionDirection = revision > 0
    ? `This is cover regeneration revision ${revision}. Keep the exact music identity and palette family but invent a fresh composition that is visibly different from earlier attempts.`
    : 'First cover pass: prioritize a strong original concept that feels intentional rather than generic stock artwork.';

  const textDirection = textMode === 'title'
    ? `Include only the exact track title “${title}” as restrained professional cover typography. No other words, logos or labels.`
    : 'No visible text, no letters, no logo, no watermark and no user-interface elements.';

  const prompt = [
    'Create an ORIGINAL square album cover for a SONARA-generated music track. This is artwork only, not an app interface.',
    `Shared A/B visual-series identity code: ${pairSignature}. Both covers belong to the same release world and must feel art-directed together.`,
    `Music taxonomy: ${genreFamily} > ${genre} > ${subgenre}. Mood: ${mood}. Tempo: ${bpm} BPM.${keySignature ? ` Key: ${keySignature}.` : ''} Vocal mode: ${vocalMode}.`,
    rawPrompt ? `Creator music brief: ${rawPrompt}.` : '',
    `Art direction: ${styleDirection(style)}.`,
    `Palette direction: ${paletteDirection(genre, subgenre, mood)}.`,
    variationDirection,
    revisionDirection,
    'The image must read instantly at small streaming-platform thumbnail size, with a premium contemporary music-release finish, controlled detail, strong hierarchy, believable lighting and no cheap clip-art look.',
    'Do not imitate or reproduce an existing album cover, artist identity, platform brand, copyrighted character, logo or recognizable trademark.',
    textDirection,
    'Square 1:1 composition. Album-cover quality. No border or mockup frame.'
  ].filter(Boolean).join('\n');

  return { prompt, variationId, pairSignature };
}

function openAIError(status: number, raw: string) {
  const text = raw.toLowerCase();
  if (status === 401 || status === 403) return { status: 503, code: 'COVER_OPENAI_AUTH', message: 'Il motore copertine SONARA non è autorizzato.' };
  if (status === 429 || text.includes('insufficient_quota') || text.includes('billing')) return { status: 503, code: 'COVER_OPENAI_QUOTA', message: 'Il motore copertine SONARA ha raggiunto il limite API.' };
  if (status === 404 || text.includes('model_not_found')) return { status: 503, code: 'COVER_MODEL_UNAVAILABLE', message: 'Il modello immagini SONARA non è disponibile.' };
  return { status: 502, code: 'COVER_UPSTREAM_ERROR', message: 'La generazione della copertina non è riuscita.' };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (String(req.headers?.['sec-fetch-site'] || '').toLowerCase() === 'cross-site') {
    return json(res, 403, { error: { code: 'COVER_CROSS_SITE_REJECTED', message: 'Richiesta cross-site non consentita.' } });
  }

  if (req.method === 'GET') {
    return json(res, 200, {
      enabled: Boolean(String(process.env.OPENAI_API_KEY || '').trim()),
      model: String(process.env.SONARA_COVER_IMAGE_MODEL || '').trim() || 'gpt-image-1.5',
      size: '1024x1024',
      outputFormat: 'webp',
      parallelAB: true
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Metodo non consentito.' } });
  }

  const userId = await authenticatedUserId(req);
  if (!userId) {
    return json(res, 401, { error: { code: 'AUTH_SESSION_INVALID', message: 'Accedi a SONARA per generare le copertine.' } });
  }
  if (isRateLimited(userId)) {
    return json(res, 429, { error: { code: 'COVER_RATE_LIMITED', message: 'Troppe rigenerazioni copertina. Riprova tra qualche minuto.' } });
  }

  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    return json(res, 503, { error: { code: 'COVER_NOT_CONFIGURED', message: 'Il motore copertine SONARA non è configurato.' } });
  }

  const input = bodyObject(req);
  const rawPrompt = clean(input.rawPrompt, 900);
  const genre = clean(input.genre, 80);
  if (!rawPrompt && !genre) {
    return json(res, 400, { error: { code: 'COVER_INVALID_REQUEST', message: 'Manca lo stile musicale per creare la copertina.' } });
  }

  const built = buildCoverPrompt(input);
  const model = String(process.env.SONARA_COVER_IMAGE_MODEL || '').trim() || 'gpt-image-1.5';
  const configuredQuality = String(process.env.SONARA_COVER_IMAGE_QUALITY || 'medium').trim().toLowerCase();
  const quality = ['low', 'medium', 'high', 'auto'].includes(configuredQuality) ? configuredQuality : 'medium';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(OPENAI_IMAGES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        prompt: built.prompt,
        n: 1,
        size: '1024x1024',
        quality,
        output_format: 'webp',
        background: 'opaque'
      }),
      signal: controller.signal
    });

    const raw = await response.text();
    if (!response.ok) {
      const mapped = openAIError(response.status, raw);
      console.warn(`[SONARA COVER] OpenAI image generation failed: HTTP ${response.status}`);
      return json(res, mapped.status, { error: { code: mapped.code, message: mapped.message } });
    }

    let payload: any = {};
    try { payload = JSON.parse(raw); } catch {}
    const b64 = String(payload?.data?.[0]?.b64_json || '').trim();
    if (!b64) {
      return json(res, 502, { error: { code: 'COVER_EMPTY_IMAGE', message: 'Il motore copertine non ha restituito un’immagine valida.' } });
    }

    return json(res, 200, {
      coverDataUrl: `data:image/webp;base64,${b64}`,
      coverMime: 'image/webp',
      coverFormat: 'webp',
      coverPrompt: built.prompt,
      variationId: built.variationId,
      pairSignature: built.pairSignature,
      model,
      quality,
      size: '1024x1024'
    });
  } catch (error) {
    console.warn('[SONARA COVER] image request failed', error instanceof Error ? error.name : 'unknown');
    return json(res, 502, { error: { code: 'COVER_UPSTREAM_ERROR', message: 'La generazione della copertina non è riuscita.' } });
  } finally {
    clearTimeout(timeout);
  }
}
