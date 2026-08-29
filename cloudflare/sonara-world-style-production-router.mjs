import productionRuntime from './sonara-production-router.mjs';
import { getMusicStyleProfile, getMusicTaxonomyAudit } from '../src/musicStyleIntelligence.ts';
import { resolveProfessionalTempoProfile, describeTempoExecution } from '../src/musicTempoIntelligence.ts';

export { SonaraJobState } from './sonara-production-router.mjs';

const WORLD_STYLE_VERSION = 'sonara-world-style-v1';
const GENERATE_PATHS = new Set(['/api/billing/generate', '/api/engine/generate']);
const STYLE_PROFILE_PATH = '/api/style-profile';

function clean(value, fallback = '') {
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function contextFrom(body = {}) {
  const family = clean(body.sonaraSelectedFamily || body.genreFamily || body.family || body.musicFamily, 'Electronic / Dance');
  const genre = clean(body.sonaraSelectedGenre || body.genre || body.musicGenre, 'House');
  const subgenre = clean(body.sonaraSelectedSubgenre || body.subgenre || body.style || body.musicStyle, genre);
  const mood = clean(body.sonaraSelectedMood || body.mood || body.atmosphere, 'Authentic');
  const prompt = clean(body.rawPrompt || body.creatorPrompt || body.creator_prompt || body.musicPrompt || body.prompt, '');
  return { family, genre, subgenre, mood, prompt };
}

function styleLock(context, body = {}) {
  const profile = getMusicStyleProfile(context.family, context.genre, context.subgenre);
  const audit = getMusicTaxonomyAudit(context.family, context.genre, context.subgenre);
  const tempo = resolveProfessionalTempoProfile(context);
  const bpm = Number(body.requestedBpm ?? body.targetBpm ?? body.preferredBpm ?? body.bpm ?? tempo.idealBpm);
  return {
    profile,
    audit,
    tempo,
    text: [
      `SONARA PROFESSIONAL WORLD STYLE DNA ${WORLD_STYLE_VERSION}.`,
      `AUTHORITATIVE MUSICAL HIERARCHY: ${context.family} > ${context.genre} > ${context.subgenre}.`,
      `STYLE IDENTITY: ${profile.identity}`,
      `AUTHENTIC INSTRUMENTATION: ${profile.instrumentation}`,
      `RHYTHM AND GROOVE DNA: ${profile.rhythm}`,
      `HARMONY AND MUSICAL LANGUAGE: ${profile.harmony}`,
      `ARRANGEMENT AND FORM: ${profile.arrangement}`,
      `PRODUCTION AND SOUND DESIGN: ${profile.production}`,
      `ANTI-DRIFT RULES: ${profile.avoid}`,
      `ATMOSPHERE SIGNATURE: ${profile.moods.join(', ')}.`,
      `STYLE FINGERPRINT: ${audit.fingerprint}; specificity ${audit.specificityScore}/100; exactProfile=${audit.exactProfile}.`,
      `TEMPO EXECUTION: ${describeTempoExecution(tempo, Number.isFinite(bpm) ? bpm : tempo.idealBpm)}`,
      `MANDATORY RESULT: the first bars must already identify ${context.subgenre} through groove, instrumentation, phrasing and sound palette. Do not merely mention the style in metadata.`,
      `Never collapse ${context.subgenre} into generic ${context.genre}, generic ${context.family}, generic pop, generic EDM, cinematic underscore or a neighboring subgenre.`,
      `If creator instructions and style DNA coexist, preserve explicit creator instructions while filling unspecified musical details with authentic ${context.subgenre} grammar.`
    ].join('\n')
  };
}

async function rewriteStyleRequest(request) {
  const url = new URL(request.url);
  if (request.method !== 'POST' || !GENERATE_PATHS.has(url.pathname)) return request;
  const contentType = String(request.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) return request;

  try {
    const body = await request.clone().json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return request;
    const context = contextFrom(body);
    const lock = styleLock(context, body);
    const existing = clean(body.prompt, '');
    const next = {
      ...body,
      genreFamily: context.family,
      genre: context.genre,
      subgenre: context.subgenre,
      mood: context.mood,
      sonaraSelectedFamily: context.family,
      sonaraSelectedGenre: context.genre,
      sonaraSelectedSubgenre: context.subgenre,
      sonaraSelectedMood: context.mood,
      sonaraWorldStyleVersion: WORLD_STYLE_VERSION,
      sonaraWorldStyleFingerprint: lock.audit.fingerprint,
      sonaraWorldStyleSpecificity: lock.audit.specificityScore,
      sonaraWorldStyleExactProfile: lock.audit.exactProfile,
      sonaraWorldStyleMoods: lock.profile.moods,
      sonaraWorldStyleIdentity: lock.profile.identity,
      sonaraWorldStyleInstrumentation: lock.profile.instrumentation,
      sonaraWorldStyleRhythm: lock.profile.rhythm,
      sonaraWorldStyleHarmony: lock.profile.harmony,
      sonaraWorldStyleArrangement: lock.profile.arrangement,
      sonaraWorldStyleProduction: lock.profile.production,
      sonaraWorldStyleAvoid: lock.profile.avoid,
      prompt: `${lock.text}\n\nCREATOR PROMPT:\n${existing}`.slice(0, 12000)
    };

    const headers = new Headers(request.headers);
    headers.delete('content-length');
    headers.set('content-type', 'application/json');
    headers.set('x-sonara-world-style', WORLD_STYLE_VERSION);
    headers.set('x-sonara-style-fingerprint', lock.audit.fingerprint);
    return new Request(request.url, {
      method: request.method,
      headers,
      body: JSON.stringify(next),
      redirect: request.redirect
    });
  } catch {
    return request;
  }
}

function profileResponse(request) {
  const url = new URL(request.url);
  const context = {
    family: url.searchParams.get('family') || 'Electronic / Dance',
    genre: url.searchParams.get('genre') || 'House',
    subgenre: url.searchParams.get('subgenre') || url.searchParams.get('genre') || 'House',
    mood: url.searchParams.get('mood') || 'Authentic',
    prompt: url.searchParams.get('prompt') || ''
  };
  const profile = getMusicStyleProfile(context.family, context.genre, context.subgenre);
  const audit = getMusicTaxonomyAudit(context.family, context.genre, context.subgenre);
  const tempo = resolveProfessionalTempoProfile(context);
  return new Response(JSON.stringify({
    version: WORLD_STYLE_VERSION,
    taxonomyPath: audit.taxonomyPath,
    family: context.family,
    genre: context.genre,
    subgenre: context.subgenre,
    identity: profile.identity,
    instrumentation: profile.instrumentation,
    rhythm: profile.rhythm,
    harmony: profile.harmony,
    arrangement: profile.arrangement,
    production: profile.production,
    avoid: profile.avoid,
    moods: profile.moods,
    fingerprint: audit.fingerprint,
    specificityScore: audit.specificityScore,
    exactProfile: audit.exactProfile,
    matchedRules: audit.matchedRules,
    bpm: tempo.idealBpm,
    minBpm: tempo.minBpm,
    maxBpm: tempo.maxBpm,
    tempoFeel: tempo.feel,
    rhythmicDensity: tempo.rhythmicDensity
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-sonara-world-style': WORLD_STYLE_VERSION,
      'x-sonara-style-fingerprint': audit.fingerprint
    }
  });
}

function decorate(response) {
  const headers = new Headers(response.headers);
  headers.set('x-sonara-world-style', WORLD_STYLE_VERSION);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === STYLE_PROFILE_PATH) {
      return request.method === 'HEAD'
        ? new Response(null, { status: 200, headers: { 'x-sonara-world-style': WORLD_STYLE_VERSION } })
        : profileResponse(request);
    }
    const rewritten = await rewriteStyleRequest(request);
    return decorate(await productionRuntime.fetch(rewritten, env, ctx));
  }
};

export { WORLD_STYLE_VERSION, rewriteStyleRequest, styleLock };
