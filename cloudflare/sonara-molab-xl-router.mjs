import siteRuntime from './sonara-instant-speed-router.mjs';
import { buildStudioPayload } from './sonara-engine-v16-studio-quality.mjs';
import { rewriteGenerationRequest } from './sonara-engine-v15-authoritative-prompt.mjs';
export { SonaraJobState } from './sonara-instant-speed-router.mjs';

const VERSION = 'sonara-molab-xl-only-v1';
const FIDELITY_PROFILE = 'sonara-fidelity-v2-lm4b';
const MODEL = 'acestep-v15-xl-turbo';
const LM_MODEL = 'acestep-5Hz-lm-4B';
const LM_BACKEND = 'vllm';
const PUBLIC_API_ORIGIN = 'https://api.sonaraenterprise.com';
const CACHE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/molab-xl-only-v1/';
const CACHE_TTL = 3 * 60 * 60;
const QUERY_TIMEOUT = 8_000;
const SUBMIT_TIMEOUT = 120_000;
const AUDIO_TIMEOUT = 120_000;
const INFERENCE_STEPS = 8;

const cleanUrl = value => String(value || '').trim().replace(/\/$/, '');
const molabUrl = env => cleanUrl(env.SONARA_MOLAB_XL_URL || env.MOLAB_ACESTEP_URL || '');

function cors(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = new Set(['https://sonaraenterprise.com', 'https://www.sonaraenterprise.com', PUBLIC_API_ORIGIN]);
  return {
    'Access-Control-Allow-Origin': allowed.has(origin) ? origin : 'https://sonaraenterprise.com',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,Range,Cache-Control,Pragma,X-Sonara-Internal-Secret,X-Sonara-Job-Bridge,X-Sonara-Real-Prompt,X-Sonara-Requested-Bpm',
    'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges,X-Sonara-MoLab-Profile,X-Sonara-Fidelity-Profile,X-Sonara-ACE-Worker',
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

function creatorIntent(body = {}) {
  return String(
    body?.rawPrompt ||
    body?.creatorPrompt ||
    body?.creator_prompt ||
    body?.musicPrompt ||
    ''
  ).trim();
}

function qualityControls(body = {}) {
  const weirdness = Math.round(clamp(body.weirdness, 50, 0, 100));
  const styleInfluence = Math.round(clamp(body.styleInfluence ?? body.style_influence, 50, 0, 100));
  return {
    weirdness,
    styleInfluence,
    lmTemperature: Number((0.60 + weirdness * 0.005).toFixed(2)),
    lmCfgScale: Number((1.90 + styleInfluence * 0.017).toFixed(2)),
    lmTopK: Math.round(40 + weirdness * 0.60),
    lmTopP: Number((0.84 + weirdness * 0.0012).toFixed(3))
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
    'For vocals, preserve supplied lyrics, requested language and singer intent. For instrumental requests, do not invent lead vocals.',
    'Create a memorable hook or motif, meaningful section development, professional transitions, a deliberate climax and a composed ending. Avoid copy-paste looping.',
    'Prioritize clean transients, controlled low end, intelligible mids, non-harsh highs, stereo depth, dynamics and a release-ready master.'
  ].filter(Boolean).join('\n');
}

export function buildMolabPayload(body, count) {
  const seed = Math.max(1, Number(body?.seed) > 0 ? Number(body.seed) : Math.floor(Date.now() % 2_000_000_000));
  const base = buildStudioPayload(body, 'structure', seed + 104729);
  const controls = qualityControls(body);
  const locks = [
    body.sonaraStudioMaxHookContract,
    body.sonaraStudioMaxVocalContract,
    body.sonaraStudioMaxContinuityContract,
    body.sonaraStudioMaxArrangementContract,
    body.sonaraStudioMaxProductionContract
  ].filter(Boolean).join(' ');

  // IMPORTANT: do not use base.prompt as the final prompt. buildStudioPayload can
  // re-assert UI taxonomy after the creator prompt. The rewritten authoritative
  // body.prompt is the source of truth; the final fidelity instruction is placed
  // after it so the creator request cannot be overwritten by stale UI defaults.
  const authoritativePrompt = String(body.prompt || '').trim().slice(0, 7200);
  const finalInstruction = fidelityInstruction(body, controls).slice(0, 4200);
  const candidateDirection = count === 2
    ? 'Generate two candidates with the SAME creator style/BPM/key/lyrics locks. Candidate A prioritizes hook and groove. Candidate B varies melody, voicing, transitions and timbral balance without changing genre identity.'
    : 'Generate one highly faithful professional master with strong hook, groove, coherent structure and production detail.';

  const prompt = [
    authoritativePrompt,
    'SONARA MOLAB RTX PRO 6000 — HIGH FIDELITY MODE.',
    finalInstruction,
    locks,
    `Weirdness=${controls.weirdness}/100 controls creativity INSIDE the requested style. Style Influence=${controls.styleInfluence}/100 controls adherence to the creator style.`,
    candidateDirection
  ].filter(Boolean).join('\n\n').slice(0, 12000);

  return {
    ...base,
    model: MODEL,
    prompt,
    inference_steps: INFERENCE_STEPS,
    guidance_scale: 7.0,
    batch_size: count,
    thinking: true,
    use_format: true,
    use_cot_caption: true,
    use_cot_language: false,
    constrained_decoding: true,
    constrained_decoding_debug: false,
    allow_lm_batch: true,
    lm_model_path: LM_MODEL,
    lm_backend: LM_BACKEND,
    lm_temperature: controls.lmTemperature,
    lm_cfg_scale: controls.lmCfgScale,
    lm_top_k: controls.lmTopK,
    lm_top_p: controls.lmTopP,
    lm_repetition_penalty: 1.03,
    lm_negative_prompt: 'genre drift, wrong genre, wrong tempo, wrong key, incoherent structure, bland default arrangement, muddy mix, clipping, malformed ending, unwanted vocals, wrong vocal language',
    instruction: finalInstruction,
    infer_method: 'ode',
    use_random_seed: true
  };
}

async function submit(baseUrl, env, payload) {
  const response = await fetch(`${baseUrl}/release_task`, {
    method: 'POST',
    headers: authHeaders(env, { 'content-type': 'application/json', Accept: 'application/json' }),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(SUBMIT_TIMEOUT)
  });
  const raw = await response.text();
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
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; }
  catch { throw new Error(`MoLab XL query: risposta non JSON (HTTP ${response.status}).`); }
  if (!response.ok || Number(data?.code || 200) >= 400) {
    throw new Error(String(data?.error?.message || data?.error || data?.message || `MoLab XL query HTTP ${response.status}`));
  }
  return data?.data?.[0] || null;
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

function candidatesFrom(refs) {
  return refs.map((path, index) => ({
    id: index === 0 ? 'A' : 'B',
    audioUrl: publicAudioUrl(path),
    audioFormat: 'wav',
    provider: 'molab',
    model: MODEL,
    inferenceSteps: INFERENCE_STEPS,
    fidelityProfile: FIDELITY_PROFILE,
    strategy: index === 0 ? 'molab-xl-fidelity-hook' : 'molab-xl-fidelity-variation'
  }));
}

function qualityMetadata(count) {
  return {
    engine: 'SONARA MoLab RTX PRO 6000 XL-Turbo + 4B Music Brain',
    provider: 'molab',
    model: MODEL,
    lmModel: LM_MODEL,
    lmBackend: LM_BACKEND,
    thinking: true,
    formatEnhancement: true,
    constrainedDecoding: true,
    fidelityProfile: FIDELITY_PROFILE,
    speedProfile: VERSION,
    inferenceSteps: INFERENCE_STEPS,
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
  const payload = buildMolabPayload(body, count);
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
      payload
    });
    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: 18,
      retryable: true,
      audioUrl: null,
      audioUrls: [],
      candidates: [],
      metadata: {
        ...qualityMetadata(count),
        currentStage: count === 2 ? 'MoLab Fidelity: 2 brani con Music Brain 4B avviati' : 'MoLab Fidelity: generazione con Music Brain 4B avviata'
      }
    }, 202);
  } catch (error) {
    return json(request, {
      jobId,
      status: 'FAILED',
      progress: 0,
      retryable: true,
      error: error instanceof Error ? error.message : String(error),
      metadata: { ...qualityMetadata(count), currentStage: 'Avvio MoLab Fidelity fallito' }
    }, 502);
  }
}

async function pollMolab(request, env, jobId) {
  const state = await loadState(env, jobId);
  if (!state?.taskId || !state?.baseUrl) {
    return json(request, { jobId, status: 'FAILED', progress: 0, retryable: false, error: 'Sessione MoLab SONARA non trovata.' }, 404);
  }

  try {
    const task = await query(state.baseUrl, env, state.taskId);
    const status = Number(task?.status ?? 0);
    const info = resultInfo(task);
    const expectedCount = Math.max(1, Math.min(2, Number(state.expectedCount || 2)));

    if (status === 1) {
      const refs = refsFrom(task, state.baseUrl).slice(0, expectedCount);
      if (refs.length < expectedCount) {
        return json(request, {
          jobId,
          status: 'FAILED',
          progress: 0,
          retryable: true,
          error: `MoLab XL-Turbo completato ma ha restituito ${refs.length}/${expectedCount} audio.`
        }, 502);
      }
      const candidates = candidatesFrom(refs);
      return json(request, {
        jobId,
        status: 'COMPLETED',
        progress: 100,
        audioUrl: candidates[0]?.audioUrl || null,
        audioUrls: candidates.map(candidate => candidate.audioUrl),
        candidates,
        metadata: {
          ...qualityMetadata(expectedCount),
          candidateCount: candidates.length,
          currentStage: candidates.length === 2 ? '2 master MoLab Fidelity pronti' : 'Master MoLab Fidelity pronto'
        }
      });
    }

    if (status !== 0) {
      return json(request, {
        jobId,
        status: 'FAILED',
        progress: 0,
        retryable: true,
        error: String(task?.error || task?.message || 'Generazione MoLab XL-Turbo fallita.'),
        metadata: { ...qualityMetadata(expectedCount), currentStage: 'Generazione MoLab Fidelity fallita' }
      }, 502);
    }

    state.updatedAt = Date.now();
    await saveState(env, jobId, state);
    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: Math.max(24, Math.min(94, Math.round(info.progress || 55))),
      retryable: true,
      audioUrl: null,
      audioUrls: [],
      candidates: [],
      metadata: {
        ...qualityMetadata(expectedCount),
        currentStage: info.stage || 'MoLab Fidelity + Music Brain 4B sta generando'
      }
    });
  } catch (error) {
    const expectedCount = Math.max(1, Math.min(2, Number(state.expectedCount || 2)));
    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: 55,
      retryable: true,
      error: error instanceof Error ? error.message : String(error),
      metadata: {
        ...qualityMetadata(expectedCount),
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
      engine: 'SONARA MoLab RTX PRO 6000 XL-Turbo + 4B Music Brain',
      provider: 'molab',
      model: MODEL,
      lmModel: LM_MODEL,
      kaggleEnabled: false,
      reason: 'SONARA_MOLAB_XL_URL non configurato.'
    }, 503);
  }

  try {
    const response = await fetch(`${baseUrl}/health`, {
      headers: authHeaders(env, { Accept: 'application/json', 'Cache-Control': 'no-cache' }),
      signal: AbortSignal.timeout(10_000)
    });
    const data = response.ok ? await response.json() : {};
    const health = data?.data || data;
    const loadedModel = String(health?.loaded_model || health?.model || '');
    const status = String(health?.status || '').toLowerCase();
    const availableLmModels = Array.isArray(health?.available_lm_models) ? health.available_lm_models : [];
    const ready = response.ok && health?.models_initialized === true && (!loadedModel || loadedModel.includes(MODEL)) && (Number(data?.code || 200) === 200 || ['ok', 'ready', 'healthy', 'online', 'success'].includes(status));
    return json(request, {
      ready,
      profile: VERSION,
      fidelityProfile: FIDELITY_PROFILE,
      engine: 'SONARA MoLab RTX PRO 6000 XL-Turbo + 4B Music Brain',
      provider: 'molab',
      model: MODEL,
      loadedModel,
      lmModel: LM_MODEL,
      availableLmModels,
      thinking: true,
      formatEnhancement: true,
      constrainedDecoding: true,
      inferenceSteps: INFERENCE_STEPS,
      maxBatchSize: 2,
      kaggleEnabled: false
    }, ready ? 200 : 503);
  } catch (error) {
    return json(request, {
      ready: false,
      profile: VERSION,
      fidelityProfile: FIDELITY_PROFILE,
      engine: 'SONARA MoLab RTX PRO 6000 XL-Turbo + 4B Music Brain',
      provider: 'molab',
      model: MODEL,
      lmModel: LM_MODEL,
      kaggleEnabled: false,
      error: error instanceof Error ? error.message : String(error)
    }, 503);
  }
}

function withHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('x-sonara-molab-profile', VERSION);
  headers.set('x-sonara-fidelity-profile', FIDELITY_PROFILE);
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
