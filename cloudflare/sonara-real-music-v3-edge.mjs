import runtime, { SonaraJobState, SonaraAuthStore } from './sonara-ultra-diversity-v1-edge.mjs';

export { SonaraJobState, SonaraAuthStore };

const VERSION = 'sonara-real-music-v3-auto-refine-2-quality-fast-batch';
const GENRE_FINGERPRINT_REVISION = 'electronic-v12-future-garage-canonical-1';
const GENERATE_PATHS = new Set(['/api/engine/generate', '/api/billing/generate']);
const HEALTH_PATHS = new Set(['/api/health', '/api/engine/ready', '/api/molab/ready', '/api/studio/capabilities']);

const clean = value => String(value ?? '').trim();
const numeric = value => Number.isFinite(Number(value)) ? Number(value) : null;
const clamp = (value, fallback, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

function profileOf(body = {}) {
  const raw = clean(body.generationProfileV3 || body.renderProfile || body.generationProfile || body.qualityProfile || 'quality').toLowerCase();
  if (['ultra', 'maximum', 'max', 'studio', 'master'].includes(raw)) return 'ultra';
  if (['fast', 'speed', 'preview'].includes(raw)) return 'fast';
  return 'quality';
}

function vocalModeOf(body = {}) {
  return clean(body.vocalMode || body.vocal_mode || (clean(body.lyrics) ? 'vocal' : 'instrumental')).toLowerCase();
}

function instrumentsOf(body = {}) {
  const value = body.selectedInstruments || body.instruments || [];
  if (Array.isArray(value)) return value.map(clean).filter(Boolean).slice(0, 16);
  return clean(value).split(',').map(clean).filter(Boolean).slice(0, 16);
}

function trackGenome(body = {}) {
  const bpm = numeric(body.sonaraExactRequestedBpm ?? body.requestedBpm ?? body.bpm);
  const key = clean(body.key || body.key_scale || body.keySignature);
  const durationSec = numeric(body.durationSec ?? body.duration ?? body.audio_duration);
  const family = clean(body.sonaraSelectedFamily || body.genreFamily || body.genre_family);
  const genre = clean(body.sonaraSelectedGenre || body.genre);
  const subgenre = clean(body.sonaraSelectedSubgenre || body.subgenre);
  const mood = clean(body.sonaraSelectedMood || body.mood || body.atmosphere);
  const vocalMode = vocalModeOf(body);
  const instruments = instrumentsOf(body);
  const styleInfluence = Math.round(clamp(body.styleInfluence ?? body.style_influence, 70, 0, 100));
  const weirdness = Math.round(clamp(body.weirdness, 40, 0, 100));
  return {
    version: VERSION,
    bpm: bpm ? Math.round(bpm) : null,
    key: key || null,
    durationSec: durationSec ? Math.round(durationSec) : null,
    meter: clean(body.timeSignature || body.time_signature || '4/4'),
    family: family || null,
    genre: genre || null,
    subgenre: subgenre || null,
    mood: mood || null,
    vocalMode,
    language: clean(body.vocalLanguage || body.vocal_language || body.language || 'auto'),
    instruments,
    styleInfluence,
    weirdness,
    structureIntent: durationSec && durationSec > 210 ? 'long-form-evolving' : durationSec && durationSec < 80 ? 'compact-complete' : 'full-song-arc',
    humanPerformance: true,
    stableSingerIdentity: !/instrumental|no vocals|senza voce/.test(vocalMode),
    qualityGateRequired: profileOf(body) === 'ultra'
  };
}

function humanizerContract(genome) {
  return [
    'SONARA HUMAN PERFORMANCE CONTRACT V3.',
    'Keep macro tempo exact while creating instrument-appropriate microtiming and micro-dynamics.',
    'Never repeat identical velocities, transient envelopes, fills, note lengths, automation moves or ambience tails across repeated bars.',
    'Use believable articulation per instrument: ghost notes, pickups, accents, breath gaps, finger/pick/strike variation, synth modulation and phrase-dependent note release.',
    'Repeated choruses/drops must preserve hook identity but sound re-performed, with controlled fill, voicing, texture and transition variation.',
    'Avoid robotic quantization, random sloppiness, plastic transients, static MIDI-like velocity and copy-paste section seams.',
    genome.genre ? `Humanization must remain authentic to ${genome.subgenre || genome.genre}.` : ''
  ].filter(Boolean).join(' ');
}

function vocalContract(genome, body) {
  if (/instrumental|no vocals|senza voce/.test(genome.vocalMode)) return 'SONARA VOCAL CONTRACT V3: instrumental only. Do not invent sung lead vocals.';
  return [
    'SONARA VOCAL REALISM CONTRACT V3.',
    'Maintain one stable singer identity through every section: same timbral core, register logic, accent and vocal age/character.',
    'Preserve supplied lyrics exactly unless the creator explicitly requests rewriting.',
    'Use intelligible consonants, natural vowel transitions, realistic breath placement, phrase-dependent vibrato and expressive pitch transitions.',
    'Avoid fixed vibrato, pitch staircase tuning, synthetic syllable smearing, doubled phonemes, missing words, breathless phrasing and identity drift.',
    clean(body.voiceIdentity || body.voice_identity) ? `Singer identity: ${clean(body.voiceIdentity || body.voice_identity).slice(0, 900)}` : '',
    genome.language ? `Vocal language lock: ${genome.language}.` : ''
  ].filter(Boolean).join(' ');
}

function arrangementContract(genome) {
  const duration = genome.durationSec || 180;
  const vocal = !/instrumental|no vocals|senza voce/.test(genome.vocalMode);
  const structure = duration <= 80
    ? (vocal ? 'intro, verse, pre-hook, chorus, contrast, final chorus, composed ending' : 'intro, groove statement, hook/drop, contrast, final hook, composed ending')
    : duration <= 220
      ? (vocal ? 'intro, verse 1, pre-chorus, chorus, verse 2 variation, chorus lift, bridge/breakdown, final chorus development, deliberate outro' : 'intro, groove A, motif statement, build, main hook/drop, contrast/breakdown, developed return, final peak, deliberate outro')
      : (vocal ? 'long-form evolving intro, two developed verses, recurring chorus identity, bridge/breakdown, late-song variation, final chorus climax, clean outro' : 'long-form evolving intro, motif development, multiple tension/release cycles, breakdown, developed final peak, composed outro');
  return `SONARA ARRANGEMENT CONTRACT V3: ${structure}. Every section must have a musical purpose. Avoid static looping, arbitrary section lengths and malformed endings.`;
}

function productionContract(genome) {
  return [
    'SONARA PRODUCTION CONTRACT V3.',
    'Release-ready balance with controlled sub/low end, punchy non-smeared transients, dimensional mids, detailed non-brittle highs and mono-compatible stereo depth.',
    'Preserve musical crest factor and natural dynamics; avoid hard clipping, DC offset, phasey widening, accidental silence, over-limiting and loudness pumping without intent.',
    genome.bpm ? `Exact BPM lock=${genome.bpm}.` : '',
    genome.key ? `Exact tonal center/key lock=${genome.key}.` : '',
    genome.durationSec ? `Target duration=${genome.durationSec}s with a real composed ending.` : '',
    genome.instruments.length ? `Instrument palette=${genome.instruments.join(', ')}.` : ''
  ].filter(Boolean).join(' ');
}

function hookContract(genome) {
  return [
    'SONARA HOOK CONTRACT V3.',
    'Create a memorable original motif/hook with intentional development, answer phrases and recurrence without cloning identical bars.',
    'Preserve the requested genre language and avoid drifting to generic EDM/pop/house.',
    genome.genre ? `Style=${[genome.family, genome.genre, genome.subgenre].filter(Boolean).join(' > ')}.` : '',
    genome.mood ? `Mood=${genome.mood}.` : ''
  ].filter(Boolean).join(' ');
}

function enrich(body = {}) {
  const profile = profileOf(body);
  if (profile === 'fast') return { ...body, sonaraRealMusicV3: false, sonaraRealMusicV3Version: VERSION };

  const genome = trackGenome(body);
  const qualityFastBatch = profile === 'quality';
  return {
    ...body,
    sonaraRealMusic: true,
    sonara_real_music: true,
    sonaraRealMusicV3: true,
    sonaraRealMusicV3Version: VERSION,
    sonaraTrackGenomeEnabled: true,
    sonaraTrackGenome: genome,
    sonaraHumanizerEnabled: true,
    sonaraVocalRefinementEnabled: true,
    sonaraStemPostProductionReady: true,
    sonaraAutoRepair: profile === 'ultra',
    sonaraAutomaticCandidateRanking: profile === 'ultra',
    sonaraDirectorBypass: qualityFastBatch,
    sonaraQualityFastBatchV8: qualityFastBatch,
    sonaraQualitySequentialSingleTakes: false,
    sonaraQualityBStrictPublishGate: false,
    sonaraQualityBAutoRetry: false,
    candidateCount: qualityFastBatch ? 2 : body.candidateCount,
    candidate_count: qualityFastBatch ? 2 : body.candidate_count,
    dualFast: qualityFastBatch ? true : body.dualFast,
    sonaraVisibleCandidateTarget: 2,
    sonaraInternalCandidateTarget: qualityFastBatch ? 2 : 4,
    verifyLyrics: !/instrumental|no vocals|senza voce/.test(genome.vocalMode),
    sonaraLyricsVerification: !/instrumental|no vocals|senza voce/.test(genome.vocalMode),
    sonaraStudioMaxHookContract: hookContract(genome),
    sonaraStudioMaxVocalContract: vocalContract(genome, body),
    sonaraStudioMaxContinuityContract: humanizerContract(genome),
    sonaraStudioMaxArrangementContract: arrangementContract(genome),
    sonaraStudioMaxProductionContract: productionContract(genome),
    sonaraRealMusicV3RepairPolicy: profile === 'ultra' ? 'professional-score-92-plus-auto-repair' : 'quality-fast-batch-no-blocking-repair'
  };
}

function withVersion(response) {
  const headers = new Headers(response.headers);
  headers.set('x-sonara-real-music-v3', VERSION);
  headers.set('x-sonara-genre-fingerprint-revision', GENRE_FINGERPRINT_REVISION);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function transformJson(response, transform) {
  const type = clean(response.headers.get('content-type')).toLowerCase();
  if (!type.includes('application/json')) return withVersion(response);
  try {
    const data = await response.clone().json();
    const next = await transform(data);
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.set('content-type', 'application/json; charset=UTF-8');
    headers.set('x-sonara-real-music-v3', VERSION);
    headers.set('x-sonara-genre-fingerprint-revision', GENRE_FINGERPRINT_REVISION);
    return new Response(JSON.stringify(next), { status: response.status, statusText: response.statusText, headers });
  } catch {
    return withVersion(response);
  }
}

function capabilities() {
  return {
    version: VERSION,
    genreFingerprintRevision: GENRE_FINGERPRINT_REVISION,
    enabledFor: ['quality', 'ultra'],
    fastModeUnchanged: true,
    qualityFastBatch: true,
    qualityCandidatesOneGpuBatch: 2,
    qualityBlockingRepair: false,
    qualitySequentialSingleTakes: false,
    trackGenome: true,
    exactBpmKeyDurationContracts: true,
    humanPerformanceContract: true,
    stableSingerIdentityContract: true,
    lyricVerificationRequestedForVocals: true,
    arrangementDirector: true,
    fourInternalCandidates: false,
    realWavRanking: false,
    automaticRepair: false,
    stemsPostProductionReady: true,
    turboModel: 'acestep-v15-xl-turbo',
    refinementModel: 'acestep-v15-xl-base',
    lmModel: 'acestep-5Hz-lm-4B',
    qualityTarget: 'real-music-fast-batch',
    ultraTargetScore: 92
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/api/real-music/v3/capabilities') {
      return new Response(JSON.stringify(capabilities()), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'private, no-store', 'x-sonara-real-music-v3': VERSION, 'x-sonara-genre-fingerprint-revision': GENRE_FINGERPRINT_REVISION }
      });
    }

    if (request.method === 'POST' && GENERATE_PATHS.has(url.pathname) && clean(request.headers.get('content-type')).toLowerCase().includes('application/json')) {
      try {
        const body = await request.clone().json();
        const next = enrich(body);
        const headers = new Headers(request.headers);
        headers.delete('content-length');
        headers.set('content-type', 'application/json');
        headers.set('x-sonara-real-music-v3', VERSION);
        headers.set('x-sonara-genre-fingerprint-revision', GENRE_FINGERPRINT_REVISION);
        const response = await runtime.fetch(new Request(request.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(next),
          cache: 'no-store'
        }), env, ctx);
        return transformJson(response, data => ({
          ...data,
          metadata: {
            ...(data?.metadata || {}),
            sonaraRealMusicV3: VERSION,
            genreFingerprintRevision: GENRE_FINGERPRINT_REVISION,
            realMusicV3Enabled: profileOf(body) !== 'fast',
            trackGenomeEnabled: profileOf(body) !== 'fast',
            humanizerEnabled: profileOf(body) !== 'fast',
            vocalRefinementEnabled: profileOf(body) !== 'fast',
            automaticQualityRepair: profileOf(body) === 'ultra',
            qualityFastBatch: profileOf(body) === 'quality',
            qualitySequentialSingleTakes: false,
            qualityBlockingWavAnalysis: false,
            candidateCount: profileOf(body) === 'quality' ? 2 : data?.metadata?.candidateCount
          }
        }));
      } catch {
        return withVersion(await runtime.fetch(request, env, ctx));
      }
    }

    let response = await runtime.fetch(request, env, ctx);
    if (response.ok && HEALTH_PATHS.has(url.pathname)) {
      response = await transformJson(response, data => ({ ...data, realMusicV3: capabilities() }));
    }
    return withVersion(response);
  }
};
