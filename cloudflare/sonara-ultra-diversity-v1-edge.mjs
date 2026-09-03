// SONARA COVER ROUTE V2 production trigger 2026-09-03
import runtime, { SonaraJobState, SonaraAuthStore } from './sonara-speed-v4-edge.mjs';

export { SonaraJobState, SonaraAuthStore };

const VERSION = 'sonara-ultra-diversity-v1';
const GENERATE_PATHS = new Set(['/api/engine/generate', '/api/billing/generate']);
const ELEVEN_COVER_PATH = '/api/eleven-music/cover';
const VERCEL_ORIGIN = 'https://sonara-enterprise.vercel.app';

const clean = value => String(value ?? '').trim();

function profileOf(body = {}) {
  const raw = clean(body.generationProfileV3 || body.renderProfile || body.generationProfile || body.qualityProfile || 'quality').toLowerCase();
  return ['ultra', 'maximum', 'max', 'studio', 'master'].includes(raw) ? 'ultra' : raw;
}

function freshSeed() {
  const values = crypto.getRandomValues(new Uint32Array(2));
  const mixed = (values[0] ^ values[1] ^ (Date.now() >>> 0)) >>> 0;
  return Math.max(1, mixed % 2_000_000_000);
}

const DIRECTIONS = [
  'Create a genuinely new melodic contour and new chord voicings. Do not reuse the previous hook shape, phrase cadence or motif contour.',
  'Create a genuinely new groove identity: different syncopation, drum fills, bass movement and rhythmic accents while preserving the exact requested BPM.',
  'Create a genuinely new arrangement architecture: change intro design, section transitions, tension/release path, breakdown treatment and final climax.',
  'Create a genuinely new timbral identity: different synth/register choices, sound-design motion, texture layering and call-and-response details without leaving the requested genre.',
  'Create a genuinely new harmonic and bass narrative: different inversion flow, bass phrasing, harmonic rhythm and transition chords while preserving the requested key.',
  'Create a genuinely new hook strategy: different motif rhythm, melodic interval pattern, answer phrases and development across later sections. Avoid any copy-paste musical form.'
];

function variationDirection(seed) {
  return DIRECTIONS[seed % DIRECTIONS.length];
}

function diversifyUltra(body = {}) {
  const seed = freshSeed();
  const direction = variationDirection(seed);
  const originalPrompt = clean(body.prompt || body.creatorPrompt || body.rawPrompt || body.musicPrompt);
  const diversityInstruction = [
    'SONARA ULTRA DIVERSITY ENGINE V1.',
    `Unique generation seed: ${seed}.`,
    direction,
    'This must be a NEW composition, not a close variation of a previous SONARA result.',
    'Preserve the creator-requested genre, subgenre, BPM, key, duration, lyrics, language and vocal identity.',
    'Do not reuse an earlier melody, chord loop, bass phrase, drum pattern, intro, drop, chorus contour or section transition unless the creator explicitly requested exact regeneration.'
  ].join('\n');

  const prompt = [originalPrompt, diversityInstruction].filter(Boolean).join('\n\n').slice(0, 12000);

  return {
    ...body,
    seed,
    prompt,
    rawPrompt: prompt,
    creatorPrompt: prompt,
    creator_prompt: prompt,
    musicPrompt: prompt,
    sonaraUltraDiversity: VERSION,
    sonaraUltraDiversitySeed: seed,
    sonaraUltraDiversityDirection: direction,
    sonaraForceFreshComposition: true,
    sonaraPreviousSeedReuse: false
  };
}

function decorate(response, seed = null) {
  const headers = new Headers(response.headers);
  headers.set('x-sonara-ultra-diversity', VERSION);
  if (seed) headers.set('x-sonara-ultra-seed', String(seed));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function proxyElevenCover(request) {
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');
  headers.set('accept', 'application/json');
  headers.set('cache-control', 'no-cache');
  headers.set('x-sonara-edge-proxy', 'cover-public-entry-v1');

  const response = await fetch(`${VERCEL_ORIGIN}${ELEVEN_COVER_PATH}`, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual'
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.set('cache-control', 'private, no-store');
  responseHeaders.set('x-sonara-cover-route', 'public-worker-entry-v1');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if ((request.method === 'GET' || request.method === 'POST') && url.pathname === ELEVEN_COVER_PATH) {
      return proxyElevenCover(request);
    }

    if (request.method !== 'POST' || !GENERATE_PATHS.has(url.pathname)) {
      return runtime.fetch(request, env, ctx);
    }

    const type = clean(request.headers.get('content-type')).toLowerCase();
    if (!type.includes('application/json')) return runtime.fetch(request, env, ctx);

    let body;
    try { body = await request.clone().json(); }
    catch { return runtime.fetch(request, env, ctx); }

    if (profileOf(body) !== 'ultra') return runtime.fetch(request, env, ctx);

    const diversified = diversifyUltra(body);
    const headers = new Headers(request.headers);
    headers.delete('content-length');
    headers.set('content-type', 'application/json');
    headers.set('x-sonara-ultra-diversity', VERSION);

    const response = await runtime.fetch(new Request(request.url, {
      method: request.method,
      headers,
      body: JSON.stringify(diversified),
      cache: 'no-store',
      redirect: request.redirect
    }), env, ctx);

    return decorate(response, diversified.seed);
  }
};
