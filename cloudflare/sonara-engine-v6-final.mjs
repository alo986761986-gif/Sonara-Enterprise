import engineV6 from './sonara-engine-v6.mjs';

const VERCEL_JOB_BRIDGE_URL = 'https://sonara-enterprise.vercel.app/api/billing/job';
const JOB_PATH = /^\/api\/music\/job\/([^/]+)$/;
const JOB_CACHE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/direct-job-v6/';
const JOB_TTL_SECONDS = 3 * 60 * 60;
const FAST_MODEL_DEFAULT = 'acestep-v15-xl-turbo';
const QUALITY_MODEL_DEFAULT = 'acestep-v15-xl-sft';
const FAST_INFERENCE_STEPS = 8;
const DETAILED_PROMPT_INFERENCE_STEPS = 12;
const QUALITY_INFERENCE_STEPS = 28;
const MAX_ADAPTIVE_QUALITY_REGENERATIONS = 2;
const GENERATION_LOCK_MS = 120_000;
const RELEASE_TIMEOUT_MS = 90_000;
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526]);
const DETAILED_PROMPT_CUE = /\b(?:intro|verse|strofa|chorus|ritornello|drop|bridge|ponte|breakdown|solo|outro|finale|crescendo|climax|drums?|batteria|bass|basso|guitar|chitarra|piano|synth|archi|strings?|voice|voce|vocal|coro|choir|senza|avoid|without|non\s+usare|analog|acustic|acoustic|live|reale|real|human|umano|vintage|cinematic)\b/i;

class AdaptiveEngineError extends Error {
  constructor(message, status = 0, retryable = false) {
    super(message);
    this.name = 'AdaptiveEngineError';
    this.status = status;
    this.retryable = retryable;
  }
}

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = new Set([
    'https://sonaraenterprise.com',
    'https://www.sonaraenterprise.com',
    'https://api.sonaraenterprise.com'
  ]);
  return {
    'Access-Control-Allow-Origin': allowed.has(origin) ? origin : 'https://sonaraenterprise.com',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,Range,X-Sonara-Internal-Secret,X-Sonara-Job-Bridge',
    'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges,X-Sonara-Performance-Profile',
    Vary: 'Origin'
  };
}

function jsonResponse(request, data, status = 200, route = 'adaptive-fast') {
  const performanceProfile = String(data?.metadata?.performanceProfile || data?.performanceProfile || 'adaptive-fast-v1');
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'private, no-store',
      'x-sonara-job-route': route,
      'x-sonara-performance-profile': performanceProfile,
      ...corsHeaders(request)
    }
  });
}

function engineConfig(env) {
  return {
    baseUrl: String(env.ACESTEP_API_URL || 'https://alo986761986-gif--sonara-acestep-serve-acestep.modal.run').replace(/\/$/, ''),
    key: String(env.MODAL_PROXY_KEY || '').trim(),
    secret: String(env.MODAL_PROXY_SECRET || '').trim()
  };
}

function engineHeaders(env, extra = {}) {
  const cfg = engineConfig(env);
  return {
    'Modal-Key': cfg.key,
    'Modal-Secret': cfg.secret,
    ...extra
  };
}

async function engineJson(env, path, init = {}, timeoutMs = 15_000) {
  const cfg = engineConfig(env);
  if (!cfg.key || !cfg.secret) {
    throw new AdaptiveEngineError('SONARA engine credentials are not configured.', 503, false);
  }

  let response;
  try {
    response = await fetch(`${cfg.baseUrl}${path}`, {
      ...init,
      headers: {
        ...engineHeaders(env),
        ...(init.headers || {})
      },
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AdaptiveEngineError(`SONARA engine request failed: ${message}`, 0, true);
  }

  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new AdaptiveEngineError(`SONARA returned invalid JSON (HTTP ${response.status}).`, response.status, RETRYABLE_STATUSES.has(response.status));
    }
  }

  if (!response.ok) {
    const message = payload?.detail || payload?.error || payload?.message || `HTTP ${response.status}`;
    throw new AdaptiveEngineError(String(message), response.status, RETRYABLE_STATUSES.has(response.status));
  }
  if (typeof payload?.code === 'number' && payload.code >= 400) {
    throw new AdaptiveEngineError(String(payload?.error || payload?.message || 'SONARA request failed.'), payload.code, payload.code >= 500 || payload.code === 429);
  }
  return payload;
}

function jobCacheUrl(jobId) {
  return `${JOB_CACHE_PREFIX}${encodeURIComponent(jobId)}`;
}

async function readJob(jobId) {
  try {
    if (typeof caches === 'undefined' || !caches.default) return null;
    const response = await caches.default.match(new Request(jobCacheUrl(jobId)));
    return response ? await response.json() : null;
  } catch {
    return null;
  }
}

async function storeJob(jobId, context) {
  if (typeof caches === 'undefined' || !caches.default) {
    throw new AdaptiveEngineError('SONARA job storage is unavailable.', 503, true);
  }
  await caches.default.put(
    new Request(jobCacheUrl(jobId)),
    new Response(JSON.stringify(context), {
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        'cache-control': `public, max-age=${JOB_TTL_SECONDS}`
      }
    })
  );
}

function creatorBriefFromPrompt(prompt) {
  const value = String(prompt || '');
  const verbatim = value.match(/CREATOR BRIEF\s*[—-]\s*VERBATIM:\s*<<<\s*([\s\S]*?)\s*>>>/i)?.[1];
  if (verbatim) return verbatim.trim();
  const legacy = value.match(/USER INTENT:\s*([\s\S]*?)(?=\n\n[A-Z][A-Z\s,&—-]+:|$)/i)?.[1];
  return String(legacy || '').trim();
}

function creatorExclusionsFromPrompt(prompt) {
  const value = String(prompt || '');
  const section = value.match(/EXPLICIT CREATOR EXCLUSIONS:\s*([\s\S]*?)(?=\n\n[A-Z][A-Z\s,&—-]+:|$)/i)?.[1] || '';
  return section
    .split(/\n+/)
    .map(item => item.replace(/^[-*•\s]+/, '').trim())
    .filter(item => item && !/no additional exclusions/i.test(item))
    .slice(0, 8);
}

export function analyzePromptFidelity(payload) {
  const prompt = String(payload?.prompt || '');
  const creatorBrief = creatorBriefFromPrompt(prompt);
  const exclusions = creatorExclusionsFromPrompt(prompt);
  const lines = creatorBrief.split(/\n+/).filter(Boolean);
  const punctuationSignals = (creatorBrief.match(/[,;:]/g) || []).length;
  const cueSignals = (creatorBrief.match(new RegExp(DETAILED_PROMPT_CUE.source, 'gi')) || []).length;
  const detailed = creatorBrief.length >= 90 || lines.length >= 2 || punctuationSignals >= 3 || cueSignals >= 2 || exclusions.length > 0;
  return {
    creatorBrief,
    exclusions,
    detailed,
    inferenceSteps: detailed ? DETAILED_PROMPT_INFERENCE_STEPS : FAST_INFERENCE_STEPS,
    thinking: detailed
  };
}

export function chooseAdaptiveModel(models, defaultModel = '', qualityFallback = false) {
  const available = Array.isArray(models)
    ? models.map(value => String(value || '').trim()).filter(Boolean)
    : [];
  const priorities = qualityFallback
    ? [/acestep-v15-xl-sft$/i, /acestep-v15-sft$/i, /xl-sft/i, /sft/i, /xl-turbo/i, /turbo/i]
    : [/acestep-v15-xl-turbo$/i, /acestep-v15-turbo$/i, /xl-turbo/i, /turbo/i, /xl-sft/i, /sft/i];

  for (const pattern of priorities) {
    const selected = available.find(name => pattern.test(name));
    if (selected) return selected;
  }
  if (available.includes(defaultModel)) return defaultModel;
  return available[0] || (qualityFallback ? QUALITY_MODEL_DEFAULT : FAST_MODEL_DEFAULT);
}

export function buildAdaptivePayload(payload, model, qualityFallback = false, fidelity = analyzePromptFidelity(payload)) {
  const detailedIntent = !qualityFallback && Boolean(fidelity?.detailed);
  const inferenceSteps = qualityFallback
    ? QUALITY_INFERENCE_STEPS
    : (detailedIntent ? DETAILED_PROMPT_INFERENCE_STEPS : FAST_INFERENCE_STEPS);
  const thinking = qualityFallback || detailedIntent;
  const creatorNegative = Array.isArray(fidelity?.exclusions) && fidelity.exclusions.length
    ? `creator exclusions: ${fidelity.exclusions.join('; ')}`
    : '';
  const negativePrompt = [String(payload?.lm_negative_prompt || '').trim(), creatorNegative]
    .filter(Boolean)
    .join(', ')
    .slice(0, 1800);
  const requestedLmTemperature = Number(payload?.lm_temperature);
  const requestedLmCfgScale = Number(payload?.lm_cfg_scale);
  const requestedLmTopP = Number(payload?.lm_top_p);
  const requestedInferMethod = payload?.infer_method === 'sde' ? 'sde' : 'ode';

  const next = {
    ...payload,
    model,
    inference_steps: inferenceSteps,
    thinking,
    use_format: false,
    use_cot_caption: thinking,
    use_cot_language: thinking,
    constrained_decoding: true,
    allow_lm_batch: false,
    lm_temperature: Number.isFinite(requestedLmTemperature) ? requestedLmTemperature : (qualityFallback ? 0.68 : (detailedIntent ? 0.64 : 0.74)),
    lm_cfg_scale: Number.isFinite(requestedLmCfgScale) ? requestedLmCfgScale : (qualityFallback ? 3.0 : (detailedIntent ? 3.2 : 2.6)),
    lm_top_p: Number.isFinite(requestedLmTopP) ? requestedLmTopP : (detailedIntent ? 0.86 : 0.9),
    lm_repetition_penalty: 1.05,
    batch_size: 1,
    infer_method: requestedInferMethod,
    audio_format: 'wav',
    ...(negativePrompt ? { lm_negative_prompt: negativePrompt } : {})
  };

  if (qualityFallback) {
    next.guidance_scale = 6.5;
    next.shift = 1.0;
    next.use_adg = true;
  } else {
    delete next.guidance_scale;
    delete next.shift;
    delete next.use_adg;
  }
  return next;
}

export function shouldStopAdaptiveRetries(qualityRegenerations) {
  return Number(qualityRegenerations || 0) >= MAX_ADAPTIVE_QUALITY_REGENERATIONS;
}

async function releaseTask(env, payload) {
  const data = await engineJson(env, '/release_task', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  }, RELEASE_TIMEOUT_MS);
  const taskId = data?.data?.task_id;
  if (!taskId) throw new AdaptiveEngineError('SONARA did not return a generation task.', 502, false);
  return String(taskId);
}

function processingPayload(jobId, context, progress, currentStage) {
  return {
    jobId,
    status: 'PROCESSING',
    progress,
    metadata: {
      engine: 'SONARA',
      qualityGate: context?.qualityGate,
      generationSpec: context?.generationSpec,
      performanceProfile: context?.performanceProfile || 'adaptive-fast-v1',
      model: context?.selectedModel,
      currentStage
    }
  };
}

async function startAdaptiveGeneration(request, env, jobId, context) {
  const qualityRegenerations = Number(context.qualityRegenerations || 0);
  if (shouldStopAdaptiveRetries(qualityRegenerations)) {
    const error = 'SONARA stopped after the fast render and one professional fallback did not pass the real-audio quality gate.';
    await storeJob(jobId, { ...context, phase: 'failed', error, updatedAt: Date.now() });
    return jsonResponse(request, { jobId, status: 'FAILED', progress: 0, error }, 200, 'adaptive-limit');
  }

  const attempts = Number(context.generationAttempts || 0);
  if (attempts >= 4) {
    const error = 'SONARA could not start the generation engine after the automatic retries.';
    await storeJob(jobId, { ...context, phase: 'failed', error, updatedAt: Date.now() });
    return jsonResponse(request, { jobId, status: 'FAILED', progress: 0, error }, 200, 'adaptive-start-limit');
  }

  const qualityFallback = qualityRegenerations > 0;
  const fidelity = analyzePromptFidelity(context.payload || {});
  const selectedModel = String(
    qualityFallback
      ? (env.SONARA_QUALITY_MODEL || QUALITY_MODEL_DEFAULT)
      : (env.SONARA_FAST_MODEL || FAST_MODEL_DEFAULT)
  ).trim();
  const performanceProfile = qualityFallback
    ? 'adaptive-quality-fallback-v1'
    : (fidelity.detailed ? 'adaptive-prompt-fidelity-v1' : 'adaptive-fast-v1');
  const payload = buildAdaptivePayload(context.payload || {}, selectedModel, qualityFallback, fidelity);
  let nextContext = {
    ...context,
    phase: 'generating',
    payload,
    selectedModel,
    performanceProfile,
    generationAttempts: attempts + 1,
    generationStartedAt: Date.now(),
    generationSpec: {
      ...(context.generationSpec || {}),
      candidateCount: 1,
      performanceProfile,
      promptFidelityMode: fidelity.detailed ? 'detailed' : 'simple',
      creatorBriefCharacters: fidelity.creatorBrief.length,
      explicitCreatorExclusions: fidelity.exclusions.length,
      inferenceSteps: payload.inference_steps
    },
    updatedAt: Date.now()
  };
  await storeJob(jobId, nextContext);

  try {
    const taskId = await releaseTask(env, payload);
    nextContext = {
      ...nextContext,
      phase: 'submitted',
      taskId,
      updatedAt: Date.now()
    };
    await storeJob(jobId, nextContext);
    const stage = qualityFallback
      ? 'SONARA: professional fallback is rendering'
      : (fidelity.detailed
        ? 'SONARA: interpreting and rendering the detailed creator brief'
        : 'SONARA: fast professional render started');
    return jsonResponse(
      request,
      processingPayload(jobId, nextContext, 45, stage),
      200,
      performanceProfile
    );
  } catch (error) {
    const retryable = error instanceof AdaptiveEngineError && error.retryable;
    const message = error instanceof Error ? error.message : String(error);
    if (retryable && attempts + 1 < 4) {
      const retryContext = {
        ...nextContext,
        phase: 'queued',
        generationStartedAt: 0,
        lastSubmissionError: message,
        updatedAt: Date.now()
      };
      await storeJob(jobId, retryContext);
      return jsonResponse(
        request,
        processingPayload(jobId, retryContext, 20, 'SONARA: engine warming up; retrying automatically'),
        200,
        'adaptive-retry'
      );
    }

    await storeJob(jobId, { ...nextContext, phase: 'failed', error: message, updatedAt: Date.now() });
    return jsonResponse(request, { jobId, status: 'FAILED', progress: 0, error: message }, 200, 'adaptive-start-failed');
  }
}

async function maybeStartAdaptiveJob(request, env, jobId) {
  const context = await readJob(jobId);
  if (!context || context.taskId || context.phase === 'completed' || context.phase === 'failed') return null;

  const startedAt = Number(context.generationStartedAt || 0);
  if (context.phase === 'generating' && startedAt && Date.now() - startedAt < GENERATION_LOCK_MS) {
    return jsonResponse(
      request,
      processingPayload(jobId, context, 35, context.performanceProfile === 'adaptive-prompt-fidelity-v1'
        ? 'SONARA: detailed creator brief is being prepared'
        : 'SONARA: fast professional render is starting'),
      200,
      context.performanceProfile || 'adaptive-fast-lock'
    );
  }
  return startAdaptiveGeneration(request, env, jobId, context);
}

async function normalizeJobResponse(response, route) {
  const raw = await response.text();
  let body = raw;

  if (response.status >= 400) {
    let payload = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = {};
    }

    if (!payload.status) {
      const message = typeof payload.error === 'string'
        ? payload.error
        : (payload.error?.message || `SONARA job polling failed with HTTP ${response.status}.`);
      payload = {
        ...payload,
        status: 'FAILED',
        progress: 0,
        error: message
      };
    }
    body = JSON.stringify(payload);
  }

  const headers = new Headers(response.headers);
  headers.set('content-type', 'application/json; charset=UTF-8');
  headers.set('cache-control', 'private, no-store');
  headers.set('x-sonara-job-route', route);
  headers.set('x-sonara-performance-profile', 'adaptive-prompt-fidelity-v1');
  headers.delete('content-length');

  return new Response(body, {
    status: response.status >= 400 ? 200 : response.status,
    headers
  });
}

async function pollThroughVercel(request, env, jobId) {
  const bridgeUrl = new URL(VERCEL_JOB_BRIDGE_URL);
  bridgeUrl.searchParams.set('jobId', jobId);

  const headers = new Headers({ Accept: 'application/json' });
  const internalSecret = String(env.SONARA_INTERNAL_PROXY_SECRET || '').trim();
  if (internalSecret) headers.set('X-Sonara-Internal-Secret', internalSecret);

  try {
    const response = await fetch(bridgeUrl, {
      method: 'GET',
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(155_000)
    });
    return normalizeJobResponse(response, 'regional-vercel-bridge');
  } catch (error) {
    console.error('[SONARA JOB ROUTE]', error instanceof Error ? error.message : String(error));
    const fallback = await engineV6.fetch(request, env, {});
    return normalizeJobResponse(fallback, 'direct-worker-fallback');
  }
}

async function decorateHealthResponse(request, response) {
  const raw = await response.text();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { status: response.ok ? 'HEALTHY' : 'ERROR' };
  }
  payload.performanceProfile = 'adaptive-prompt-fidelity-v1';
  payload.fastModel = FAST_MODEL_DEFAULT;
  payload.simplePromptInferenceSteps = FAST_INFERENCE_STEPS;
  payload.detailedPromptInferenceSteps = DETAILED_PROMPT_INFERENCE_STEPS;
  payload.detailedPromptThinking = true;
  payload.fastCandidateCount = 1;
  payload.qualityFallbackModel = QUALITY_MODEL_DEFAULT;
  payload.qualityFallbackSteps = QUALITY_INFERENCE_STEPS;
  payload.maximumRenderAttempts = 2;
  payload.creatorBriefPriority = 'authoritative-artistic-source';
  return jsonResponse(request, payload, response.status, 'health');
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const jobMatch = path.match(JOB_PATH);
    const bridgeRequest = request.headers.get('X-Sonara-Job-Bridge') === 'vercel';

    if (jobMatch && request.method === 'GET' && !bridgeRequest) {
      return pollThroughVercel(request, env, decodeURIComponent(jobMatch[1]));
    }

    if (jobMatch && request.method === 'GET' && bridgeRequest) {
      const adaptiveResponse = await maybeStartAdaptiveJob(request, env, decodeURIComponent(jobMatch[1]));
      if (adaptiveResponse) return adaptiveResponse;
    }

    const response = await engineV6.fetch(request, env, ctx);

    if (path === '/' || path === '/api/health') {
      return decorateHealthResponse(request, response);
    }

    if (jobMatch) {
      return normalizeJobResponse(response, bridgeRequest ? 'regional-worker-cache' : 'direct-worker');
    }

    return response;
  }
};
