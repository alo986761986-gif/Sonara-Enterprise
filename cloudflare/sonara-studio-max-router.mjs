import worldStyleRuntime from './sonara-world-style-production-router.mjs';
import { buildStudioMaxBlueprint, SONARA_STUDIO_MAX_VERSION } from '../src/sonaraStudioMaxIntelligence.ts';
export { SonaraJobState } from './sonara-world-style-production-router.mjs';

const GENERATE_PATHS = new Set(['/api/billing/generate', '/api/engine/generate']);
const PROFILE_PATH = '/api/studio-max-profile';

const clean = (value, fallback = '') => {
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text || fallback;
};

function contextFrom(body = {}) {
  return {
    durationSec: body.durationSec ?? body.duration,
    bpm: body.requestedBpm ?? body.targetBpm ?? body.preferredBpm ?? body.bpm,
    key: body.key || body.key_scale,
    lyrics: body.lyrics,
    vocalLanguage: body.vocalLanguage || body.vocal_language,
    vocalMode: body.vocalMode || body.lyricsMode,
    family: body.sonaraSelectedFamily || body.genreFamily || body.family,
    genre: body.sonaraSelectedGenre || body.genre,
    subgenre: body.sonaraSelectedSubgenre || body.subgenre || body.style,
    mood: body.sonaraSelectedMood || body.mood,
    styleIdentity: body.sonaraWorldStyleIdentity,
    instrumentation: body.sonaraWorldStyleInstrumentation,
    rhythm: body.sonaraWorldStyleRhythm,
    harmony: body.sonaraWorldStyleHarmony,
    arrangement: body.sonaraWorldStyleArrangement,
    production: body.sonaraWorldStyleProduction
  };
}

async function rewriteStudioMaxRequest(request) {
  const url = new URL(request.url);
  if (request.method !== 'POST' || !GENERATE_PATHS.has(url.pathname)) return request;
  if (!String(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) return request;

  try {
    const body = await request.clone().json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return request;
    const blueprint = buildStudioMaxBlueprint(contextFrom(body));
    const creatorPrompt = clean(body.rawPrompt || body.creatorPrompt || body.creator_prompt || body.musicPrompt || body.prompt, '');
    const prompt = [
      creatorPrompt ? `CREATOR INTENT — HIGHEST CREATIVE PRIORITY:\n${creatorPrompt}` : '',
      blueprint.promptContract,
      body.sonaraWorldStyleIdentity ? `STYLE IDENTITY: ${body.sonaraWorldStyleIdentity}` : '',
      body.sonaraWorldStyleInstrumentation ? `AUTHENTIC INSTRUMENTATION: ${body.sonaraWorldStyleInstrumentation}` : '',
      body.sonaraWorldStyleRhythm ? `RHYTHM DNA: ${body.sonaraWorldStyleRhythm}` : '',
      body.sonaraWorldStyleHarmony ? `HARMONY DNA: ${body.sonaraWorldStyleHarmony}` : '',
      body.sonaraWorldStyleArrangement ? `STYLE ARRANGEMENT DNA: ${body.sonaraWorldStyleArrangement}` : '',
      body.sonaraWorldStyleProduction ? `STYLE PRODUCTION DNA: ${body.sonaraWorldStyleProduction}` : ''
    ].filter(Boolean).join('\n\n').slice(0, 12000);

    const next = {
      ...body,
      durationSec: blueprint.durationSec,
      duration: blueprint.durationSec,
      bpm: blueprint.bpm,
      requestedBpm: blueprint.bpm,
      targetBpm: blueprint.bpm,
      preferredBpm: blueprint.bpm,
      key: blueprint.key,
      sonaraStudioMax: true,
      sonaraStudioMaxVersion: SONARA_STUDIO_MAX_VERSION,
      sonaraStudioMaxSectionPlan: blueprint.sectionPlan,
      sonaraStudioMaxSectionMap: blueprint.sectionMap,
      sonaraStudioMaxHookContract: blueprint.hookContract,
      sonaraStudioMaxVocalContract: blueprint.vocalContract,
      sonaraStudioMaxContinuityContract: blueprint.continuityContract,
      sonaraStudioMaxArrangementContract: blueprint.arrangementContract,
      sonaraStudioMaxProductionContract: blueprint.productionContract,
      sonaraStudioMaxCandidateA: blueprint.candidateAContract,
      sonaraStudioMaxCandidateB: blueprint.candidateBContract,
      prompt
    };

    const headers = new Headers(request.headers);
    headers.delete('content-length');
    headers.set('content-type', 'application/json');
    headers.set('x-sonara-studio-max', SONARA_STUDIO_MAX_VERSION);
    return new Request(request.url, { method: request.method, headers, body: JSON.stringify(next), redirect: request.redirect });
  } catch {
    return request;
  }
}

function profileResponse(request) {
  const url = new URL(request.url);
  const blueprint = buildStudioMaxBlueprint({
    durationSec: Number(url.searchParams.get('duration') || 180),
    bpm: Number(url.searchParams.get('bpm') || 124),
    key: url.searchParams.get('key') || 'C Major',
    genre: url.searchParams.get('genre') || 'House',
    subgenre: url.searchParams.get('subgenre') || url.searchParams.get('genre') || 'House',
    mood: url.searchParams.get('mood') || 'Authentic',
    lyrics: url.searchParams.get('lyrics') || '',
    vocalLanguage: url.searchParams.get('vocalLanguage') || ''
  });
  return new Response(JSON.stringify(blueprint), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-sonara-studio-max': SONARA_STUDIO_MAX_VERSION
    }
  });
}

function decorate(response) {
  const headers = new Headers(response.headers);
  headers.set('x-sonara-studio-max', SONARA_STUDIO_MAX_VERSION);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === PROFILE_PATH) {
      return request.method === 'HEAD'
        ? new Response(null, { status: 200, headers: { 'x-sonara-studio-max': SONARA_STUDIO_MAX_VERSION } })
        : profileResponse(request);
    }
    const rewritten = await rewriteStudioMaxRequest(request);
    return decorate(await worldStyleRuntime.fetch(rewritten, env, ctx));
  }
};

export { rewriteStudioMaxRequest, SONARA_STUDIO_MAX_VERSION };
