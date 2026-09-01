import runtime, { SonaraJobState, SonaraAuthStore } from './sonara-studio-transient-poll-guard.mjs';

export { SonaraJobState, SonaraAuthStore };

const VERSION = 'sonara-vocal-refinement-1';
const ENDPOINT = '/api/studio/vocal-refine';
const DEFAULT_ISSUES = [
  'metallic or phasey vocal artifacts',
  'harsh sibilance and brittle consonants',
  'unstable formants or synthetic vowel tone',
  'poor lyric intelligibility',
  'unnatural breath or phrase transitions',
  'singer identity inconsistency',
  'vocal masking against the instrumental'
];

const clean = value => String(value ?? '').trim();

function json(request, data, status = 200) {
  const origin = clean(request.headers.get('origin'));
  const allowed = new Set([
    'https://sonaraenterprise.com',
    'https://www.sonaraenterprise.com',
    'https://api.sonaraenterprise.com'
  ]);
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'private, no-store',
      'x-sonara-vocal-refinement': VERSION,
      'access-control-allow-origin': allowed.has(origin) ? origin : 'https://sonaraenterprise.com',
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'Authorization,Content-Type,Cache-Control,Pragma,X-Sonara-Internal-Secret',
      vary: 'Origin'
    }
  });
}

function normalizeIssues(value) {
  const custom = Array.isArray(value)
    ? value.map(clean).filter(Boolean)
    : typeof value === 'string'
      ? value.split(',').map(clean).filter(Boolean)
      : [];
  return [...new Set([...DEFAULT_ISSUES, ...custom])].slice(0, 12);
}

async function vocalRefine(request, env, ctx) {
  let body;
  try { body = await request.clone().json(); }
  catch { return json(request, { status: 'FAILED', error: 'Vocal Refinement richiede un payload JSON valido.' }, 400); }

  const sourceAudioUrl = clean(body.sourceAudioUrl || body.audioUrl || body.sourceUrl);
  if (!sourceAudioUrl) return json(request, { status: 'FAILED', error: 'sourceAudioUrl mancante.' }, 400);

  const preserveStrength = Math.max(0.82, Math.min(0.96, Number(body.preserveStrength || 0.91)));
  const issues = normalizeIssues(body.issues);
  const rewrittenBody = {
    ...body,
    sourceAudioUrl,
    audioUrl: sourceAudioUrl,
    preserveStrength,
    issues,
    sonaraVocalRefinement: VERSION,
    sonaraVocalIdentityLock: true,
    sonaraLyricsLock: true,
    sonaraArrangementLock: true,
    prompt: clean(body.prompt) || 'Refine only the lead vocal quality. Preserve lyrics word-for-word, singer identity, melody, timing, BPM, key, arrangement and instrumental production. Improve natural vocal timbre, articulation, breaths, formants and mix integration without changing the song.'
  };

  const url = new URL(request.url);
  url.pathname = '/api/studio/repair';
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json');
  headers.set('x-sonara-vocal-refinement', VERSION);

  const response = await runtime.fetch(new Request(url.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify(rewrittenBody),
    cache: 'no-store'
  }), env, ctx);

  let data = null;
  try { data = await response.clone().json(); } catch {}
  if (!data) return response;

  const outHeaders = new Headers(response.headers);
  outHeaders.delete('content-length');
  outHeaders.set('content-type', 'application/json; charset=UTF-8');
  outHeaders.set('x-sonara-vocal-refinement', VERSION);
  return new Response(JSON.stringify({
    ...data,
    requestedOperation: 'vocal-refine',
    vocalRefinement: {
      version: VERSION,
      preserveStrength,
      lyricsLocked: true,
      singerIdentityLocked: true,
      arrangementLocked: true,
      issues
    }
  }), { status: response.status, statusText: response.statusText, headers: outHeaders });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === ENDPOINT && request.method === 'OPTIONS') {
      return json(request, { ok: true, version: VERSION }, 200);
    }
    if (url.pathname === ENDPOINT && request.method === 'POST') {
      return vocalRefine(request, env, ctx);
    }
    return runtime.fetch(request, env, ctx);
  }
};
