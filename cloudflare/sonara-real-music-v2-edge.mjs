import runtime, { SonaraJobState, SonaraAuthStore } from './sonara-studio-pitch-key-upload-bridge.mjs';

export { SonaraJobState, SonaraAuthStore };

const VERSION = 'sonara-real-music-v2-edge-1';
const REAL_MUSIC_PROFILE = 'sonara-real-music-v2';
const REALISM_API_MARKER = 'sonara-realism-api-v2';
const MODEL = 'acestep-v15-xl-turbo';
const HEALTH_TIMEOUT = 10_000;

const cleanUrl = value => String(value || '').trim().replace(/\/$/, '');
const molabUrl = env => cleanUrl(env.SONARA_MOLAB_XL_URL || env.MOLAB_ACESTEP_URL || '');

function authHeaders(env) {
  const out = {
    Accept: 'application/json',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache'
  };
  const key = String(env.ACE_STEP_API_KEY || env.ACESTEP_API_KEY || '').trim();
  if (key) {
    out.Authorization = `Bearer ${key}`;
    out['X-API-Key'] = key;
  }
  return out;
}

async function v2Health(env) {
  const baseUrl = molabUrl(env);
  if (!baseUrl) return { ready: false, baseUrl: '' };
  try {
    const response = await fetch(`${baseUrl}/health`, {
      headers: authHeaders(env),
      signal: AbortSignal.timeout(HEALTH_TIMEOUT)
    });
    if (!response.ok) return { ready: false, baseUrl, httpStatus: response.status };
    const raw = await response.json();
    const health = raw?.data || raw || {};
    const loadedModel = String(health?.loaded_model || health?.model || '');
    const ready = (
      health?.models_initialized === true &&
      health?.llm_initialized === true &&
      health?.sonara_realism_api_v2 === true &&
      String(health?.sonara_realism_optimizer || '') === REALISM_API_MARKER &&
      (!loadedModel || loadedModel.includes(MODEL))
    );
    return {
      ready,
      baseUrl,
      loadedModel,
      llmInitialized: health?.llm_initialized === true,
      lmBackend: String(health?.sonara_lm_backend || 'pt').toLowerCase(),
      torchCompile: health?.sonara_compile_model === true,
      raw: health
    };
  } catch (error) {
    return {
      ready: false,
      baseUrl,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function profileOf(metadata = {}) {
  const profile = String(metadata?.generationProfile || metadata?.generationProfileV3 || 'quality').trim().toLowerCase();
  if (['ultra', 'maximum', 'max', 'studio', 'master'].includes(profile)) return 'ultra';
  if (['fast', 'speed', 'preview'].includes(profile)) return 'fast';
  return 'quality';
}

function samplerFor(profile, thinking) {
  if (!thinking || profile === 'fast') return 'euler';
  return profile === 'ultra' ? 'heun' : 'euler';
}

function upgradeMetadata(metadata = {}, health = {}) {
  const thinking = metadata?.thinking === true;
  const profile = profileOf(metadata);
  if (!thinking || health?.ready !== true) return metadata;
  return {
    ...metadata,
    engine: 'SONARA MoLab RTX PRO 6000 XL-Turbo Real Music V2',
    realMusicProfile: REAL_MUSIC_PROFILE,
    realismApiMarker: REALISM_API_MARKER,
    optimizationProfile: 'sonara-xl-turbo-real-music-v2-speed-quality',
    samplerMode: samplerFor(profile, true),
    qualitySamplerMode: 'euler',
    ultraSamplerMode: 'heun',
    dcwEnabled: true,
    dcwMode: 'double',
    dcwLowScaler: 0.02,
    dcwHighScaler: 0.06,
    lmModel: 'acestep-5Hz-lm-4B',
    lmBackend: health.lmBackend || 'pt',
    lmBatchEnabled: Number(metadata?.candidateCount || metadata?.batchSize || 1) > 1,
    lmBatchChunkSize: 8,
    torchCompile: health.torchCompile === true,
    inferenceSteps: 8,
    cpuOffload: false,
    flashAttention: false
  };
}

function upgradeCandidate(candidate = {}, metadata = {}, health = {}) {
  if (!candidate || typeof candidate !== 'object') return candidate;
  const thinking = candidate?.thinking === true || metadata?.thinking === true;
  const profile = profileOf(metadata);
  if (!thinking || health?.ready !== true) return candidate;
  return {
    ...candidate,
    realMusicProfile: REAL_MUSIC_PROFILE,
    samplerMode: samplerFor(profile, true),
    realismApiMarker: REALISM_API_MARKER,
    lmBackend: health.lmBackend || 'pt',
    torchCompile: health.torchCompile === true
  };
}

function upgradeReadiness(payload = {}, health = {}) {
  if (!payload || typeof payload !== 'object') return payload;
  if (health?.ready !== true) {
    return {
      ...payload,
      realMusicV2Ready: false,
      realMusicV2Profile: REAL_MUSIC_PROFILE,
      realMusicV2Marker: REALISM_API_MARKER
    };
  }
  return {
    ...payload,
    ready: payload?.ready !== false,
    realMusicReady: true,
    realMusicV2Ready: true,
    realMusicProfile: REAL_MUSIC_PROFILE,
    realMusicV2Profile: REAL_MUSIC_PROFILE,
    realismApiMarker: REALISM_API_MARKER,
    realMusicV2Marker: REALISM_API_MARKER,
    engine: 'SONARA MoLab RTX PRO 6000 XL-Turbo Real Music V2',
    model: MODEL,
    loadedModel: health.loadedModel || payload?.loadedModel || MODEL,
    llmInitialized: true,
    lmModel: 'acestep-5Hz-lm-4B',
    lmBackend: health.lmBackend || 'pt',
    lmBatchEnabled: true,
    lmBatchChunkSize: 8,
    torchCompile: health.torchCompile === true,
    inferenceSteps: 8,
    samplerMode: 'profile-dependent',
    qualitySamplerMode: 'euler',
    ultraSamplerMode: 'heun',
    dcwEnabled: true,
    dcwMode: 'double',
    dcwLowScaler: 0.02,
    dcwHighScaler: 0.06,
    cpuOffload: false,
    flashAttention: false,
    optimizationProfile: 'sonara-xl-turbo-real-music-v2-speed-quality'
  };
}

function jsonHeaders(response, health = {}) {
  const headers = new Headers(response.headers);
  headers.set('x-sonara-real-music-edge', VERSION);
  if (health?.ready === true) {
    headers.set('x-sonara-real-music', REAL_MUSIC_PROFILE);
    headers.set('x-sonara-realism-api', REALISM_API_MARKER);
    headers.set('x-sonara-lm-backend', health.lmBackend || 'pt');
    headers.set('x-sonara-torch-compile', health.torchCompile === true ? 'on' : 'off');
  }
  return headers;
}

async function upgradeJsonResponse(request, response, health, kind) {
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('application/json')) {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: jsonHeaders(response, health)
    });
  }

  let payload;
  try { payload = await response.clone().json(); }
  catch {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: jsonHeaders(response, health)
    });
  }

  let next = payload;
  if (kind === 'readiness') {
    next = upgradeReadiness(payload, health);
  } else if (payload && typeof payload === 'object') {
    const metadata = upgradeMetadata(payload.metadata || {}, health);
    next = {
      ...payload,
      metadata,
      candidates: Array.isArray(payload.candidates)
        ? payload.candidates.map(candidate => upgradeCandidate(candidate, metadata, health))
        : payload.candidates
    };
  }

  const headers = jsonHeaders(response, health);
  headers.set('content-type', 'application/json; charset=UTF-8');
  headers.delete('content-length');
  return new Response(JSON.stringify(next), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const readiness = request.method === 'GET' && (url.pathname === '/api/molab/ready' || url.pathname === '/api/engine/ready');
    const generation = request.method === 'POST' && url.pathname === '/api/engine/generate';
    const job = request.method === 'GET' && /^\/api\/music\/job\//.test(url.pathname);

    if (!readiness && !generation && !job) {
      return runtime.fetch(request, env, ctx);
    }

    const [response, health] = await Promise.all([
      runtime.fetch(request, env, ctx),
      v2Health(env)
    ]);

    return upgradeJsonResponse(request, response, health, readiness ? 'readiness' : 'generation');
  }
};
