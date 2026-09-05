import siteRuntime from './sonara-instant-speed-router.mjs';
import { buildStudioPayload } from './sonara-engine-v16-studio-quality.mjs';
import { rewriteGenerationRequest } from './sonara-engine-v15-authoritative-prompt.mjs';
export { SonaraJobState } from './sonara-instant-speed-router.mjs';

// Keep this public contract stable: configure-molab-xl.yml verifies it.
const VERSION = 'sonara-molab-xl-only-v1';
const FIDELITY_PROFILE = 'sonara-fidelity-v15-ultra-speed-max-fast1-quality2-ultra2';
const REAL_MUSIC_PROFILE = 'sonara-real-music-v1';
const REALISM_API_MARKER = 'sonara-realism-api-v1';
const RICH_ARRANGEMENT_PROFILE = 'sonara-rich-arrangement-v13';
const NATURAL_TONE_PROFILE = 'sonara-natural-tone-v14';
const QUALITY_47_RESCUE_PROFILE = 'sonara-quality-47-rescue-v1';
const FAST_80_RESCUE_PROFILE = 'sonara-fast-80-rescue-v1';
const QUALITY_AB_DIVERSITY_PROFILE = 'sonara-quality-ab-diversity-v8';
const MODEL = 'acestep-v15-xl-turbo';
const PUBLIC_API_ORIGIN = 'https://api.sonaraenterprise.com';
const CACHE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/molab-xl-only-v1/';
const CACHE_TTL = 3 * 60 * 60;
const QUERY_TIMEOUT = 12_000;
const SUBMIT_TIMEOUT = 120_000;
const AUDIO_TIMEOUT = 120_000;
const HEALTH_TIMEOUT = 10_000;
const INFERENCE_STEPS = 1;
const STALL_TIMEOUT = 12 * 60 * 1000;
const HIGH_PROGRESS_RESCUE_THRESHOLD = 93;
const HIGH_PROGRESS_MAX_POLLS = 6;
const FAST_ARTIFACT_RESCUE_THRESHOLD = 70;
const FAST_STALL_THRESHOLD = 75;
const FAST_STALL_MAX_POLLS = 4;
const FAST_RECOVERY_MAX_ATTEMPTS = 1;

const cleanUrl = value => String(value || '').trim().replace(/\/$/, '');
const molabUrl = env => cleanUrl(env.SONARA_MOLAB_XL_URL || env.MOLAB_ACESTEP_URL || '');

function cors(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = new Set(['https://sonaraenterprise.com', 'https://www.sonaraenterprise.com', PUBLIC_API_ORIGIN]);
  return {
    'Access-Control-Allow-Origin': allowed.has(origin) ? origin : 'https://sonaraenterprise.com',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,Range,Cache-Control,Pragma,X-Sonara-Internal-Secret,X-Sonara-Job-Bridge,X-Sonara-Real-Prompt,X-Sonara-Requested-Bpm',
    'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges,X-Sonara-MoLab-Profile,X-Sonara-Fidelity-Profile,X-Sonara-Real-Music,X-Sonara-Rich-Arrangement,X-Sonara-Natural-Tone,X-Sonara-ACE-Worker',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'private, no-store',
      'x-sonara-molab-profile': VERSION,
      'x-sonara-fidelity-profile': FIDELITY_PROFILE,
      'x-sonara-real-music': REAL_MUSIC_PROFILE,
      'x-sonara-rich-arrangement': RICH_ARRANGEMENT_PROFILE,
      'x-sonara-natural-tone': NATURAL_TONE_PROFILE,
      ...cors(request)
    }
  });
}

function authHeaders(env, extra = {}) {
  const out = { ...extra };
  const key = String(env.ACE_STEP_API_KEY || env.ACESTEP_API_KEY || '').trim();
  if (key) {
    out.Authorization = `Bearer ${key}`;
    out['X-API-Key'] = key;
  }
  return out;
}

function authorized(request, env) {
  const required = String(env.SONARA_INTERNAL_PROXY_SECRET || '').trim();
  return !required || String(request.headers.get('X-Sonara-Internal-Secret') || '').trim() === required;
}

function clamp(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function candidateCount(body = {}) {
  if (body?.dualFast === true) return 2;
  return Math.round(clamp(body?.candidateCount, 2, 1, 2));
}

function profileOf(body = {}) {
  const raw = String(body.generationProfileV3 || body.renderProfile || body.generationProfile || body.qualityProfile || 'quality').trim().toLowerCase();
  if (['fast', 'speed', 'preview'].includes(raw)) return 'fast';
  if (['ultra', 'maximum', 'max'].includes(raw)) return 'ultra';
  return 'quality';
}

function inferenceStepsOf(_body = {}, profile = profileOf(_body)) {
  if (profile === 'ultra') return 2;
  if (profile === 'quality') return 2;
  return 1;
}

function samplerOf(body = {}, realMusic = false) {
  const requested = String(body?.sonaraSpeedSampler || body?.sampler_mode || '').trim().toLowerCase();
  if (profileOf(body) === 'ultra' && realMusic) return 'euler';
  if (profileOf(body) === 'quality') return 'euler';
  if (requested === 'euler' || requested === 'heun') return requested;
  return 'euler';
}

function creatorIntent(body = {}) {
  return String(body?.rawPrompt || body?.creatorPrompt || body?.creator_prompt || body?.musicPrompt || '').trim();
}

function qualityControls(body = {}) {
  return {
    weirdness: Math.round(clamp(body.weirdness, 50, 0, 100)),
    styleInfluence: Math.round(clamp(body.styleInfluence ?? body.style_influence, 50, 0, 100))
  };
}

function fidelityInstruction(body = {}, controls = qualityControls(body)) {
  const requested = creatorIntent(body);
  const taxonomy = [body.genreFamily || body.genre_family, body.genre, body.subgenre].filter(Boolean).join(' > ');
  const styleLock = controls.styleInfluence >= 80
    ? 'STRICT STYLE LOCK: reproduce the creator-requested genre language, groove, instrumentation, arrangement and production identity with very high fidelity.'
    : controls.styleInfluence >= 55
      ? 'STRONG STYLE LOCK: keep the creator-requested genre unmistakable while allowing only compatible musical variation.'
      : 'STYLE LOCK: keep the creator-requested genre clearly recognizable while allowing tasteful variation inside that genre.';
  const creativity = controls.weirdness >= 75
    ? 'Use bold creativity in melody, harmony, sound design and transitions, but NEVER cross the requested genre boundary or alter the requested BPM.'
    : controls.weirdness >= 45
      ? 'Use controlled originality and musical variation while preserving the requested style identity and song coherence.'
      : 'Favor conservative, highly coherent songwriting and genre-authentic choices over experimentation.';

  return [
    'SONARA FIDELITY ENGINE V2 — AUTHORITATIVE EXECUTION INSTRUCTION.',
    'Generate finished music audio immediately; do not answer with analysis or prose.',
    'The creator free-text prompt is the master musical specification. If it conflicts with UI genre defaults, THE CREATOR FREE-TEXT PROMPT ALWAYS WINS.',
    requested ? `AUTHORITATIVE CREATOR BRIEF: ${requested.slice(0, 3500)}` : '',
    taxonomy ? `UI taxonomy is fallback context only: ${taxonomy}. It may fill unspecified details but must never replace an explicitly requested style.` : '',
    `Exact BPM=${body.bpm ?? body.requestedBpm ?? 'as supplied'}, key=${body.key ?? body.key_scale ?? 'as supplied'}, duration=${body.durationSec ?? body.duration ?? 'as supplied'} seconds. Preserve these controls throughout the rendered song.`,
    styleLock,
    creativity,
    'Do not collapse the result into generic EDM, generic pop, generic house, or any neighboring genre unless the creator explicitly asked for it.',
    'Use genre-authentic drums, bass language, instrumentation, harmonic vocabulary, melodic phrasing, transitions, mix balance and mastering character.',
    'SONARA FULL INSTRUMENTATION V12: make the arrangement feel full, rich, layered and professionally produced rather than sparse or demo-like.',
    'When the requested genre supports it, build roughly 8-12 distinct complementary musical/production roles: primary drums, secondary percussion, bass, chord/harmonic instrument, supporting harmony layer, lead or hook instrument, counter-melody/response layer, atmosphere/texture, fills/ornaments, transitions and genre-authentic ear-candy.',
    'Add instruments ONLY when they naturally belong to the requested genre/subgenre, era and production language. Never inflate the arrangement with unrelated instruments.',
    'Distribute layers by register, frequency and musical function. Keep upper-mid and high-frequency roles deliberately sparse: usually one bright focal element plus natural hat/cymbal detail, never several sharp leads, noisy risers and bright percussion fighting at once. Use section-specific entrances/exits, call-and-response, evolving automation and contrast so the track feels rich without becoming harsh or overcrowded.',
    'Preserve creator-selected instruments as authoritative anchors; supporting instruments may expand the arrangement but must never remove, replace or contradict explicitly requested instruments.',
    'For vocals, preserve supplied lyrics, requested language and singer intent. For instrumental requests, do not invent lead vocals.',
    'Create a memorable hook or motif, meaningful section development, professional transitions, a deliberate climax and a composed ending. Avoid copy-paste looping.',
    'Prioritize rounded natural transients, controlled low end, full intelligible mids, smooth non-hyped highs, stereo depth, dynamics and a release-ready master. Reject piercing resonances, brittle hats/cymbals, shrill leads, fizzy treble, abrasive distortion and over-bright mastering.'
  ].filter(Boolean).join('\n');
}

function realMusicInstruction(body = {}) {
  const hasVocals = Boolean(String(body.lyrics || '').trim()) && String(body.vocalMode || '').toLowerCase() !== 'instrumental';
  return [
    'SONARA REAL MUSIC V1 — REALISM IS A HARD MUSICAL REQUIREMENT.',
    'Create the perceptual behavior of a finished human-produced record, not an AI demo.',
    'Preserve natural micro-dynamics and micro-timing: avoid machine-flat velocity, perfectly repeated transients, identical note envelopes and copy-paste phrasing.',
    'Keep macro tempo and downbeats solid, but allow genre-appropriate microtiming in hats, percussion, ghost notes, bass articulation, pickups and phrase entrances. Humanization must never sound sloppy or off-grid.',
    'Use instrument-specific articulation, attack, decay, sustain, release, believable register, breathing room and performance variation.',
    'Repeated sections must sound re-performed rather than cloned: vary fills, note lengths, accents, ornaments, automation, ambience and transition details while preserving the hook identity.',
    'Maintain continuous room, reverb and delay behavior across edits and transitions; avoid hard ambience resets, identical tails and artificial section seams.',
    'Electronic music must sound like deliberate hardware/software production: stable club timing with subtle groove, evolving synthesis, controlled modulation and non-static drum/bass articulation. Do not imitate acoustic instruments unless requested.',
    'Keep low frequencies physical and controlled, mids dimensional, highs detailed without brittle hash, and stereo width deep but mono-compatible.',
    'Avoid plastic timbre, smeared transients, phasey widening, metallic alias-like texture, over-limiting, pumping without musical intent, accidental silence and abrupt endings.',
    'Keep the exact requested BPM, key, meter, genre identity, lyrics and duration. Realism must never override creator controls.',
    hasVocals ? 'Voice target: stable singer identity with natural breath placement, intelligible consonants, small expressive pitch transitions, phrase-dependent vibrato, realistic note attacks/releases and subtle timing freedom. Avoid pitch-staircase tuning, fixed vibrato, identical phrase onsets, breathless delivery and synthetic syllable smearing.' : '',
    'Master target: release-ready but alive. Retain transient contrast and musical dynamics instead of maximizing loudness at all costs.'
  ].filter(Boolean).join('\n');
}

async function workerHealth(baseUrl, env) {
  try {
    const response = await fetch(`${baseUrl}/health`, {
      headers: authHeaders(env, { Accept: 'application/json', 'Cache-Control': 'no-cache', 'User-Agent': 'SONARA-MoLab-Edge/14.0' }),
      signal: AbortSignal.timeout(HEALTH_TIMEOUT)
    });
    const raw = response.ok ? await response.json() : {};
    const health = raw?.data || raw || {};
    return {
      responseOk: response.ok,
      code: Number(raw?.code || response.status || 0),
      status: String(health?.status || '').toLowerCase(),
      modelsInitialized: health?.models_initialized === true,
      llmInitialized: health?.llm_initialized === true,
      realismApiV1: health?.sonara_realism_api_v1 === true || String(health?.sonara_realism_api || '') === REALISM_API_MARKER,
      loadedModel: String(health?.loaded_model || health?.model || ''),
      raw: health
    };
  } catch (error) {
    return {
      responseOk: false,
      code: 0,
      status: '',
      modelsInitialized: false,
      llmInitialized: false,
      realismApiV1: false,
      loadedModel: '',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function realMusicEnabled(body = {}, capabilities = {}) {
  if (body?.sonaraRealMusic === false || body?.sonara_real_music === false) return false;
  return profileOf(body) !== 'fast' && capabilities?.llmInitialized === true && capabilities?.realismApiV1 === true;
}

export function buildMolabPayload(body, count, capabilities = {}) {
  const seed = Math.max(1, Number(body?.seed) > 0 ? Number(body.seed) : Math.floor(Date.now() % 2_000_000_000));
  const base = buildStudioPayload(body, 'structure', seed + 104729);
  const rawControls = qualityControls(body);
  const profile = profileOf(body);
  const qualityVariantB = profile === 'quality' && Number(body?.sonaraStabilityVariant) === 1;
  const controls = {
    weirdness: rawControls.weirdness,
    styleInfluence: rawControls.styleInfluence
  };
  const realMusic = realMusicEnabled(body, capabilities);
  const hasVocals = Boolean(String(body.lyrics || '').trim()) && String(body.vocalMode || body.vocal_mode || '').toLowerCase() !== 'instrumental';
  const humanLmTemperature = realMusic
    ? (profile === 'ultra'
      ? clamp(0.82 + controls.weirdness * 0.0006, 0.85, 0.82, 0.88)
      : clamp(0.74 + controls.weirdness * 0.0006, 0.77, 0.74, 0.80))
    : 0.85;
  const humanLmCfgScale = realMusic && profile === 'ultra' ? clamp(2.10 + controls.styleInfluence * 0.004, 2.30, 2.10, 2.50) : 1.0;
  const humanTopP = realMusic ? clamp(0.90 + controls.weirdness * 0.0006, 0.93, 0.90, 0.96) : 0.90;
  const inferenceSteps = inferenceStepsOf(body, profile);
  const samplerMode = samplerOf(body, realMusic);
  const locks = [
    body.sonaraStudioMaxHookContract,
    body.sonaraStudioMaxVocalContract,
    body.sonaraStudioMaxContinuityContract,
    body.sonaraStudioMaxArrangementContract,
    body.sonaraStudioMaxProductionContract
  ].filter(Boolean).join(' ');

  const authoritativePrompt = String(body.prompt || '').trim().slice(0, 7600);
  const finalInstruction = fidelityInstruction(body, controls).slice(0, 4000);
  const stabilityInstruction = String(body.sonaraStabilityInstruction || body.sonaraQualityTakeInstruction || '').trim().slice(0, 6000);
  const candidateDirection = qualityVariantB
    ? 'QUALITY B INDEPENDENT COMPOSITION V8: use the EXACT SAME creator brief but create a genuinely different song. Keep genre/subgenre, mood, era, groove identity, requested instruments, production language, singer identity, lyrics/language, BPM, key, duration and atmosphere locked. Use the independent seed supplied for B. Create a new melody and hook contour, different harmonic/voicing route, different bass phrasing, different drum/percussion phrasing, different section development, different transitions and a clearly distinct arrangement path. Never clone A, never reuse A as a conservative take, and never drift to a neighboring genre. SAME BRIEF; DIFFERENT SONG.'
    : (count === 2
      ? (profile === 'quality'
        ? 'QUALITY A/B DIVERSITY V8: render two genuinely different original compositions from the EXACT SAME creator brief. Preserve concept, genre/subgenre, mood, era, requested instrument palette, groove identity, production character, vocal intent, lyrics/language, BPM, key, duration and atmosphere, but force independent melody/hook, harmony or voicing route, bass phrasing, drum phrasing, section development and transitions.'
        : 'Render two candidates in one GPU batch. Both MUST preserve the same creator style, BPM, key, lyrics and vocal-language locks. Candidate A prioritizes hook and groove. Candidate B changes melody, voicing, transitions and timbral balance without changing genre identity.')
      : (profile === 'quality'
        ? 'QUALITY A SINGLE TAKE V6: render one highly faithful professional master that establishes the exact requested musical identity. Stay literal, coherent and genre-authentic.'
        : 'Render one highly faithful professional master with strong hook, groove, coherent structure and production detail.'));

  const prompt = [
    authoritativePrompt,
    realMusic ? 'SONARA MOLAB RTX PRO 6000 — REAL MUSIC MODE.' : 'SONARA MOLAB RTX PRO 6000 — STABLE HIGH-FIDELITY MODE.',
    finalInstruction,
    stabilityInstruction,
    realMusic ? realMusicInstruction(body) : '',
    locks,
    `Weirdness=${controls.weirdness}/100 controls creativity INSIDE the requested style. Style Influence=${controls.styleInfluence}/100 controls adherence to the creator style.`,
    candidateDirection
  ].filter(Boolean).join('\n\n').slice(0, 12000);

  const payload = {
    ...base,
    model: MODEL,
    prompt,
    inference_steps: inferenceSteps,
    guidance_scale: 1.0,
    batch_size: count,
    thinking: profile === 'ultra' && realMusic,
    lm_temperature: humanLmTemperature,
    lm_cfg_scale: humanLmCfgScale,
    lm_top_k: 0,
    lm_top_p: humanTopP,
    lm_repetition_penalty: realMusic ? (profile === 'ultra' ? 1.08 : 1.04) : 1.0,
    lm_negative_prompt: realMusic
      ? 'generic style drift, wrong BPM, wrong key, robotic quantization, static velocity, identical repeated bars, identical drum velocities, copy-paste phrasing, cloned chorus performance, fixed vibrato, pitch-staircase tuning, breathless synthetic vocal, plastic timbre, metallic artifacts, harsh clipping, piercing highs, brittle cymbals, shrill leads, whistling resonances, fizzy treble, abrasive upper mids, overly sharp transients, stacked bright risers, excessive noise FX, overcompression, phasey stereo, hard ambience resets, accidental silence, malformed ending, unwanted vocals'
      : 'NO USER INPUT',
    use_format: false,
    use_cot_metas: false,
    use_cot_caption: false,
    use_cot_language: false,
    use_constrained_decoding: false,
    constrained_decoding: false,
    constrained_decoding_debug: false,
    allow_lm_batch: profile === 'ultra' && realMusic && count > 1,
    lm_batch_chunk_size: profile === 'ultra' && realMusic && count > 1 ? 8 : 1,
    infer_method: 'ode',
    sampler_mode: samplerMode,
    shift: realMusic ? Number(base.shift || 1.0) : 1.0,
    dcw_enabled: true,
    dcw_mode: 'low',
    dcw_scaler: 0.02,
    dcw_high_scaler: 0.0,
    enable_normalization: true,
    normalization_db: -1.0,
    use_random_seed: profile !== 'quality',
    sonara_quality_safe_b_v6: false,
    sonara_quality_b_hard_lock_v7: false,
    sonara_quality_same_seed_base_v7: false,
    sonara_quality_seed_locked_v6: profile === 'quality',
    sonara_quality_ab_diversity_profile: profile === 'quality' ? QUALITY_AB_DIVERSITY_PROFILE : null,
    sonara_quality_independent_composition_v8: profile === 'quality',
    sonara_quality_independent_seed_v8: profile === 'quality',
    sonara_quality_variant_b_v8: qualityVariantB,
    sonara_real_music_v1: realMusic,
    sonara_generation_profile: 'auto',
    sonara_speed_inference_steps: inferenceSteps,
    sonara_speed_sampler: samplerMode
  };

  return payload;
}

async function submit(baseUrl, env, payload) {
  const response = await fetch(`${baseUrl}/release_task`, {
    method: 'POST',
    headers: authHeaders(env, { 'content-type': 'application/json', Accept: 'application/json' }),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(SUBMIT_TIMEOUT)
  });
  const raw = await response.text();
  if (response.status === 530) {
    throw new Error('MoLab XL tunnel offline (HTTP 530). Il Quick Tunnel Cloudflare non e piu raggiungibile: riavvia il supervisor MoLab e collega il nuovo SONARA_MOLAB_XL_URL.');
  }
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; }
  catch { throw new Error(`MoLab XL: risposta non JSON (HTTP ${response.status}).`); }
  if (!response.ok || Number(data?.code || 200) >= 400) {
    throw new Error(String(data?.error?.message || data?.error || data?.message || `MoLab XL HTTP ${response.status}`));
  }
  const taskId = data?.data?.task_id;
  if (!taskId) throw new Error('MoLab XL: task_id mancante.');
  return String(taskId);
}

async function query(baseUrl, env, taskId) {
  const response = await fetch(`${baseUrl}/query_result`, {
    method: 'POST',
    headers: authHeaders(env, { 'content-type': 'application/json', Accept: 'application/json' }),
    body: JSON.stringify({ task_id_list: [taskId] }),
    signal: AbortSignal.timeout(QUERY_TIMEOUT)
  });
  const raw = await response.text();
  if (response.status === 530) {
    throw new Error('MoLab XL tunnel offline durante query (HTTP 530). Il Quick Tunnel Cloudflare non e piu raggiungibile.');
  }
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; }
  catch { throw new Error(`MoLab XL query: risposta non JSON (HTTP ${response.status}).`); }
  if (!response.ok || Number(data?.code || 200) >= 400) {
    throw new Error(String(data?.error?.message || data?.error || data?.message || `MoLab XL query HTTP ${response.status}`));
  }
  return data?.data?.[0] || null;
}

function taskStatus(task) {
  const raw = task?.status;
  if (typeof raw === 'number') return raw;
  const text = String(raw ?? '').trim().toLowerCase();
  if (['1', 'success', 'succeeded', 'completed', 'complete', 'done', 'finished'].includes(text)) return 1;
  if (['0', 'pending', 'queued', 'running', 'processing', 'in_progress', 'in-progress'].includes(text) || !text) return 0;
  return -1;
}

function resultItems(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    } catch { return []; }
  }
  return value && typeof value === 'object' ? [value] : [];
}

function resultInfo(task) {
  const first = resultItems(task?.result)[0] || {};
  const raw = Number(first?.progress ?? task?.progress ?? 0);
  const progress = Number.isFinite(raw) ? (raw <= 1 ? raw * 100 : raw) : 0;
  return {
    progress: Math.max(0, Math.min(100, progress)),
    stage: String(first?.stage || task?.stage || task?.progress_text || '').trim()
  };
}

function refsFrom(task, baseUrl) {
  const refs = [];
  const seen = new Set();
  const visit = value => {
    if (!value) return;
    if (typeof value === 'string') {
      let path = '';
      try { path = new URL(value, `${baseUrl}/`).searchParams.get('path') || ''; } catch {}
      if (!path && value.startsWith('/') && !value.startsWith('/v1/audio')) path = value;
      if (path && !seen.has(path)) {
        seen.add(path);
        refs.push(path);
      }
      return;
    }
    if (Array.isArray(value)) return value.forEach(visit);
    if (typeof value === 'object') {
      for (const key of ['file', 'url', 'audio_path', 'audio_file', 'path', 'output', 'outputs', 'audio', 'audios', 'wave']) {
        if (key in value) visit(value[key]);
      }
    }
  };
  resultItems(task?.result).forEach(visit);
  return refs;
}

const cacheUrl = jobId => `${CACHE_PREFIX}${encodeURIComponent(jobId)}`;

function stateStub(env, jobId) {
  try { return env?.SONARA_JOB_STATE ? env.SONARA_JOB_STATE.get(env.SONARA_JOB_STATE.idFromName(jobId)) : null; }
  catch { return null; }
}

async function saveState(env, jobId, state) {
  const stub = stateStub(env, jobId);
  if (stub) {
    const response = await stub.fetch('https://sonara.internal/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(state)
    });
    if (!response.ok) throw new Error(`SONARA state HTTP ${response.status}`);
  }
  await caches.default.put(
    new Request(cacheUrl(jobId)),
    new Response(JSON.stringify(state), {
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL}` }
    })
  ).catch(() => undefined);
}

async function loadState(env, jobId) {
  const stub = stateStub(env, jobId);
  if (stub) {
    try {
      const response = await stub.fetch('https://sonara.internal/state');
      if (response.ok) return await response.json();
    } catch {}
  }
  try {
    const response = await caches.default.match(new Request(cacheUrl(jobId)));
    return response ? await response.json() : null;
  } catch { return null; }
}

function publicAudioUrl(path) {
  return `${PUBLIC_API_ORIGIN}/api/molab/audio?path=${encodeURIComponent(path)}`;
}

function candidatesFrom(refs, payload = {}) {
  const realMusic = payload?.sonara_real_music_v1 === true;
  const inferenceSteps = Number(payload?.inference_steps || INFERENCE_STEPS);
  const samplerMode = String(payload?.sampler_mode || (realMusic ? 'heun' : 'euler'));
  return refs.map((path, index) => ({
    id: index === 0 ? 'A' : 'B',
    audioUrl: publicAudioUrl(path),
    audioFormat: 'wav',
    provider: 'molab',
    model: MODEL,
    inferenceSteps,
    fidelityProfile: FIDELITY_PROFILE,
    realMusicProfile: realMusic ? REAL_MUSIC_PROFILE : null,
    thinking: realMusic,
    samplerMode,
    strategy: index === 0 ? 'molab-xl-fidelity-hook' : 'molab-xl-fidelity-variation'
  }));
}

function qualityMetadata(count, payload = {}) {
  const realMusic = payload?.sonara_real_music_v1 === true;
  const inferenceSteps = Number(payload?.inference_steps || INFERENCE_STEPS);
  const samplerMode = String(payload?.sampler_mode || (realMusic ? 'heun' : 'euler'));
  return {
    engine: realMusic ? 'SONARA MoLab RTX PRO 6000 XL-Turbo Real Music' : 'SONARA MoLab RTX PRO 6000 XL-Turbo Fidelity',
    provider: 'molab',
    model: MODEL,
    thinking: realMusic,
    formatEnhancement: false,
    constrainedDecoding: realMusic,
    fidelityProfile: FIDELITY_PROFILE,
    realMusicProfile: realMusic ? REAL_MUSIC_PROFILE : null,
    richArrangementProfile: RICH_ARRANGEMENT_PROFILE,
    naturalToneProfile: NATURAL_TONE_PROFILE,
    quality47RescueProfile: QUALITY_47_RESCUE_PROFILE,
    fast80RescueProfile: FAST_80_RESCUE_PROFILE,
    qualityABDiversificationProfile: payload?.sonara_quality_independent_composition_v8 === true ? QUALITY_AB_DIVERSITY_PROFILE : null,
    qualityABIndependentCompositionV8: payload?.sonara_quality_independent_composition_v8 === true,
    harshnessGuard: true,
    smoothTopEnd: true,
    fxRestraint: true,
    fullInstrumentation: true,
    sectionDensityIntelligence: true,
    soundEffectsIntelligence: true,
    humanPerformanceIntelligence: true,
    generationProfile: payload?.sonara_generation_profile || 'quality',
    speedProfile: VERSION,
    inferenceSteps,
    samplerMode,
    dcwEnabled: true,
    lmModel: realMusic ? 'acestep-5Hz-lm-4B' : null,
    batchSize: count,
    candidateCount: count,
    kaggleEnabled: false
  };
}

async function startMolab(request, env) {
  if (!authorized(request, env)) return json(request, { error: 'Unauthorized SONARA generation proxy.' }, 401);
  const baseUrl = molabUrl(env);
  if (!baseUrl) {
    return json(request, {
      status: 'FAILED',
      progress: 0,
      retryable: true,
      error: 'MoLab XL-Turbo non configurato. Kaggle è disabilitato per Music AI.'
    }, 503);
  }

  const authoritative = await rewriteGenerationRequest(request);
  let body;
  try { body = await authoritative.clone().json(); }
  catch { return json(request, { error: 'Invalid JSON request body.' }, 400); }

  const count = candidateCount(body);
  const capabilities = await workerHealth(baseUrl, env);
  const payload = buildMolabPayload(body, count, capabilities);
  const jobId = `mxl_${crypto.randomUUID()}`;
  try {
    const taskId = await submit(baseUrl, env, payload);
    const now = Date.now();
    await saveState(env, jobId, {
      createdAt: now,
      updatedAt: now,
      baseUrl,
      taskId,
      expectedCount: count,
      capabilities: {
        llmInitialized: capabilities.llmInitialized === true,
        realismApiV1: capabilities.realismApiV1 === true,
        loadedModel: capabilities.loadedModel || ''
      },
      payload,
      highProgressPolls: 0,
      lastObservedProgress: 0,
      fastStallPolls: 0,
      fastLastObservedProgress: 0,
      fastRecoveryAttempts: 0
    });
    const meta = qualityMetadata(count, payload);
    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: 22,
      retryable: true,
      audioUrl: null,
      audioUrls: [],
      candidates: [],
      metadata: {
        ...meta,
        currentStage: meta.thinking
          ? (count === 2 ? `Real Music: LM 4B + ${meta.samplerMode}, ${meta.inferenceSteps} step, batch RTX avviato` : `Real Music: LM 4B + ${meta.samplerMode}, ${meta.inferenceSteps} step, inferenza RTX avviata`)
          : (count === 2 ? `MoLab Fidelity: ${meta.inferenceSteps} step, batch RTX avviato` : `MoLab Fidelity: ${meta.inferenceSteps} step, inferenza RTX avviata`)
      }
    }, 202);
  } catch (error) {
    return json(request, {
      jobId,
      status: 'FAILED',
      progress: 0,
      retryable: true,
      error: error instanceof Error ? error.message : String(error),
      metadata: { ...qualityMetadata(count, payload), currentStage: 'Avvio MoLab fallito' }
    }, 502);
  }
}

async function pollMolab(request, env, jobId) {
  const state = await loadState(env, jobId);
  if (!state?.taskId || !state?.baseUrl) {
    return json(request, { jobId, status: 'FAILED', progress: 0, retryable: false, error: 'Sessione MoLab SONARA non trovata.' }, 404);
  }

  const payload = state.payload || {};
  try {
    const task = await query(state.baseUrl, env, state.taskId);
    const status = taskStatus(task);
    const info = resultInfo(task);
    const expectedCount = Math.max(1, Math.min(2, Number(state.expectedCount || 2)));
    const meta = qualityMetadata(expectedCount, payload);

    const refs = refsFrom(task, state.baseUrl).slice(0, expectedCount);
    const highProgress = info.progress >= HIGH_PROGRESS_RESCUE_THRESHOLD;
    if (highProgress) {
      const previous = Number(state.lastObservedProgress || 0);
      state.highProgressPolls = info.progress <= previous + 0.1
        ? Number(state.highProgressPolls || 0) + 1
        : 1;
      state.lastObservedProgress = info.progress;
    } else {
      state.highProgressPolls = 0;
      state.lastObservedProgress = info.progress;
    }

    const isFast = String(payload?.sonara_generation_profile || 'quality').trim().toLowerCase() === 'fast';
    const fastBand = isFast && status === 0 && info.progress >= FAST_STALL_THRESHOLD;
    if (fastBand) {
      const previousFast = Number(state.fastLastObservedProgress || 0);
      state.fastStallPolls = info.progress <= previousFast + 0.1
        ? Number(state.fastStallPolls || 0) + 1
        : 1;
      state.fastLastObservedProgress = info.progress;
    } else {
      state.fastStallPolls = 0;
      state.fastLastObservedProgress = info.progress;
    }

    const completedFastByArtifacts = isFast && status === 0 && info.progress >= FAST_ARTIFACT_RESCUE_THRESHOLD && refs.length >= expectedCount;
    const completedByArtifacts = (status === 0 && highProgress && refs.length >= expectedCount) || completedFastByArtifacts;
    if (status === 1 || completedByArtifacts) {
      if (refs.length < expectedCount) {
        return json(request, {
          jobId,
          status: 'FAILED',
          progress: 0,
          retryable: true,
          error: `MoLab XL-Turbo completato ma ha restituito ${refs.length}/${expectedCount} audio.`
        }, 502);
      }
      const candidates = candidatesFrom(refs, payload);
      return json(request, {
        jobId,
        status: 'COMPLETED',
        progress: 100,
        audioUrl: candidates[0]?.audioUrl || null,
        audioUrls: candidates.map(candidate => candidate.audioUrl),
        candidates,
        metadata: {
          ...meta,
          quality47RescueProfile: QUALITY_47_RESCUE_PROFILE,
          completionRescuedFromArtifacts: completedByArtifacts,
          candidateCount: candidates.length,
          currentStage: meta.thinking
            ? (candidates.length === 2 ? '2 master Real Music pronti' : 'Master Real Music pronto')
            : (candidates.length === 2 ? '2 master MoLab Fidelity pronti' : 'Master MoLab Fidelity pronto')
        }
      });
    }

    if (status < 0) {
      return json(request, {
        jobId,
        status: 'FAILED',
        progress: 0,
        retryable: true,
        error: String(task?.error || task?.message || `Generazione MoLab XL-Turbo fallita (status=${String(task?.status)}).`),
        metadata: { ...meta, currentStage: 'Generazione MoLab fallita' }
      }, 502);
    }

    if (fastBand && Number(state.fastStallPolls || 0) >= FAST_STALL_MAX_POLLS) {
      const recoveryAttempts = Number(state.fastRecoveryAttempts || 0);
      if (recoveryAttempts < FAST_RECOVERY_MAX_ATTEMPTS) {
        const retryTaskId = await submit(state.baseUrl, env, payload);
        state.taskId = retryTaskId;
        state.fastRecoveryAttempts = recoveryAttempts + 1;
        state.fastStallPolls = 0;
        state.fastLastObservedProgress = 0;
        state.updatedAt = Date.now();
        await saveState(env, jobId, state);
        return json(request, {
          jobId,
          status: 'PROCESSING',
          progress: 86,
          retryable: true,
          audioUrl: null,
          audioUrls: [],
          candidates: [],
          metadata: {
            ...meta,
            fast80RescueProfile: FAST_80_RESCUE_PROFILE,
            fastRecoveryAttempts: state.fastRecoveryAttempts,
            observedProgress: info.progress,
            currentStage: 'Fast anti-stallo: render riavviato automaticamente'
          }
        }, 202);
      }

      await saveState(env, jobId, state);
      return json(request, {
        jobId,
        status: 'FAILED',
        progress: 100,
        retryable: true,
        error: 'Fast e rimasto fermo nella fase finale anche dopo il recupero automatico. Il job e stato chiuso invece di restare bloccato all 80%.',
        metadata: {
          ...meta,
          fast80RescueProfile: FAST_80_RESCUE_PROFILE,
          fastStallPolls: state.fastStallPolls,
          fastRecoveryAttempts: state.fastRecoveryAttempts,
          observedProgress: info.progress,
          currentStage: 'Fast anti-stallo: retry esaurito'
        }
      }, 504);
    }

    if (status === 0 && highProgress && Number(state.highProgressPolls || 0) >= HIGH_PROGRESS_MAX_POLLS) {
      await saveState(env, jobId, state);
      return json(request, {
        jobId,
        status: 'FAILED',
        progress: 100,
        retryable: true,
        error: 'MoLab e rimasto fermo nella fase finale senza pubblicare i file audio. Il job e stato chiuso automaticamente invece di restare al 47.4%.',
        metadata: {
          ...meta,
          quality47RescueProfile: QUALITY_47_RESCUE_PROFILE,
          highProgressPolls: state.highProgressPolls,
          observedProgress: info.progress,
          currentStage: 'Anti-stallo finale Quality attivato'
        }
      }, 504);
    }

    if (Date.now() - Number(state.createdAt || Date.now()) > STALL_TIMEOUT && info.progress <= 0) {
      return json(request, {
        jobId,
        status: 'FAILED',
        progress: 0,
        retryable: true,
        error: 'MoLab non ha iniziato inferenza entro il tempo previsto. Riprova: il job bloccato è stato scartato.',
        metadata: { ...meta, currentStage: 'Job MoLab bloccato rilevato' }
      }, 504);
    }

    state.updatedAt = Date.now();
    await saveState(env, jobId, state);
    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: Math.max(24, Math.min(94, Math.round(info.progress || 32))),
      retryable: true,
      audioUrl: null,
      audioUrls: [],
      candidates: [],
      metadata: {
        ...meta,
        quality47RescueProfile: QUALITY_47_RESCUE_PROFILE,
        fast80RescueProfile: FAST_80_RESCUE_PROFILE,
        highProgressPolls: Number(state.highProgressPolls || 0),
        fastStallPolls: Number(state.fastStallPolls || 0),
        fastRecoveryAttempts: Number(state.fastRecoveryAttempts || 0),
        currentStage: info.stage || (meta.thinking ? `Real Music: LM 4B + ${meta.samplerMode}, ${meta.inferenceSteps} step sulla RTX PRO 6000` : `MoLab XL-Turbo ${meta.inferenceSteps} step sulla RTX PRO 6000`)
      }
    });
  } catch (error) {
    const expectedCount = Math.max(1, Math.min(2, Number(state.expectedCount || 2)));
    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: 30,
      retryable: true,
      error: error instanceof Error ? error.message : String(error),
      metadata: {
        ...qualityMetadata(expectedCount, payload),
        currentStage: 'Riconnessione a MoLab XL-Turbo'
      }
    });
  }
}

async function proxyAudio(request, env) {
  const baseUrl = molabUrl(env);
  if (!baseUrl) return json(request, { error: 'MoLab XL-Turbo non configurato.' }, 503);
  const url = new URL(request.url);
  const path = String(url.searchParams.get('path') || '').trim();
  if (!path) return json(request, { error: 'Audio path mancante.' }, 400);

  const target = new URL('/v1/audio', `${baseUrl}/`);
  target.searchParams.set('path', path);
  const headers = authHeaders(env);
  const range = request.headers.get('Range');
  if (range) headers.Range = range;

  let upstream;
  try {
    upstream = await fetch(target.toString(), {
      method: request.method === 'HEAD' ? 'HEAD' : 'GET',
      headers,
      signal: AbortSignal.timeout(AUDIO_TIMEOUT)
    });
  } catch {
    return json(request, { error: 'Audio MoLab non raggiungibile.', retryable: true }, 502);
  }

  const out = new Headers(upstream.headers);
  Object.entries(cors(request)).forEach(([key, value]) => out.set(key, value));
  out.set('cache-control', 'private, no-store');
  out.set('x-sonara-molab-profile', VERSION);
  out.set('x-sonara-fidelity-profile', FIDELITY_PROFILE);
  out.set('x-sonara-real-music', REAL_MUSIC_PROFILE);
  out.set('x-sonara-rich-arrangement', RICH_ARRANGEMENT_PROFILE);
  out.set('x-sonara-natural-tone', NATURAL_TONE_PROFILE);
  out.set('x-sonara-ace-worker', 'molab-xl');
  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out
  });
}

async function readiness(request, env) {
  const baseUrl = molabUrl(env);
  if (!baseUrl) {
    return json(request, {
      ready: false,
      profile: VERSION,
      fidelityProfile: FIDELITY_PROFILE,
      realMusicProfile: REAL_MUSIC_PROFILE,
      engine: 'SONARA MoLab RTX PRO 6000 XL-Turbo Fidelity',
      provider: 'molab',
      model: MODEL,
      kaggleEnabled: false,
      reason: 'SONARA_MOLAB_XL_URL non configurato.'
    }, 503);
  }

  const health = await workerHealth(baseUrl, env);
  const statusOk = ['ok', 'ready', 'healthy', 'online', 'success'].includes(health.status);
  const modelOk = !health.loadedModel || health.loadedModel.includes(MODEL);
  const ready = health.responseOk && health.modelsInitialized && modelOk && (health.code === 200 || statusOk);
  const realMusicReady = ready && health.llmInitialized && health.realismApiV1;

  return json(request, {
    ready,
    profile: VERSION,
    fidelityProfile: FIDELITY_PROFILE,
    realMusicProfile: REAL_MUSIC_PROFILE,
    richArrangementProfile: RICH_ARRANGEMENT_PROFILE,
    fast80RescueProfile: FAST_80_RESCUE_PROFILE,
    qualityABDiversificationProfile: QUALITY_AB_DIVERSITY_PROFILE,
    fullInstrumentation: true,
    sectionDensityIntelligence: true,
    soundEffectsIntelligence: true,
    humanPerformanceIntelligence: true,
    realMusicReady,
    realismApiMarker: health.realismApiV1 ? REALISM_API_MARKER : null,
    engine: realMusicReady ? 'SONARA MoLab RTX PRO 6000 XL-Turbo Real Music' : 'SONARA MoLab RTX PRO 6000 XL-Turbo Fidelity',
    provider: 'molab',
    model: MODEL,
    loadedModel: health.loadedModel,
    llmInitialized: health.llmInitialized,
    thinking: realMusicReady,
    formatEnhancement: false,
    constrainedDecoding: realMusicReady,
    inferenceSteps: INFERENCE_STEPS,
    fastInferenceSteps: 1,
    qualityInferenceSteps: 2,
    ultraInferenceSteps: 2,
    samplerMode: 'euler',
    dcwEnabled: true,
    dcwMode: 'low',
    dcwScaler: 0.02,
    dcwHighScaler: 0.0,
    maxBatchSize: 2,
    kaggleEnabled: false,
    ...(health.error ? { healthError: health.error } : {})
  }, ready ? 200 : 503);
}

function withHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('x-sonara-molab-profile', VERSION);
  headers.set('x-sonara-fidelity-profile', FIDELITY_PROFILE);
  headers.set('x-sonara-real-music', REAL_MUSIC_PROFILE);
  headers.set('x-sonara-rich-arrangement', RICH_ARRANGEMENT_PROFILE);
  headers.set('x-sonara-natural-tone', NATURAL_TONE_PROFILE);
  headers.set('x-sonara-fast-80-rescue', FAST_80_RESCUE_PROFILE);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });

    if ((url.pathname === '/api/molab/ready' || url.pathname === '/api/engine/ready') && request.method === 'GET') {
      return readiness(request, env);
    }

    if (url.pathname === '/api/molab/audio' && (request.method === 'GET' || request.method === 'HEAD')) {
      return proxyAudio(request, env);
    }

    const jobMatch = url.pathname.match(/^\/api\/music\/job\/(mxl_[^/]+)$/);
    if (request.method === 'GET' && jobMatch) {
      return pollMolab(request, env, decodeURIComponent(jobMatch[1]));
    }

    if (request.method === 'GET' && /^\/api\/music\/job\/(?:d16pair_|bw2_|mkpair_)/.test(url.pathname)) {
      return json(request, {
        status: 'FAILED',
        progress: 0,
        retryable: false,
        error: 'Job del vecchio motore disabilitato. Music AI ora usa esclusivamente MoLab XL-Turbo.'
      }, 410);
    }

    if (request.method === 'POST' && url.pathname === '/api/engine/generate') {
      return startMolab(request, env);
    }

    return withHeaders(await siteRuntime.fetch(request, env, ctx));
  }
};
