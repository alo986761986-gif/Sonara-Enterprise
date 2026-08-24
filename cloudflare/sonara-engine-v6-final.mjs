import engineV6 from './sonara-engine-v6.mjs';

const VERCEL_JOB_BRIDGE_URL = 'https://sonara-enterprise.vercel.app/api/billing/job';
const JOB_PATH = /^\/api\/music\/job\/([^/]+)$/;
const JOB_CACHE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/direct-job-v6/';
const JOB_TTL_SECONDS = 3 * 60 * 60;
const GENERATION_LOCK_MS = 180_000;
const RELEASE_TIMEOUT_MS = 120_000;
const MAX_START_ATTEMPTS = 5;
const MAX_QUALITY_REGENERATIONS = 2;
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526]);

export const PROFESSIONAL_MODEL = 'acestep-v15-xl-sft';
export const PROFESSIONAL_MODEL_REPOSITORY = 'ACE-Step/acestep-v15-xl-sft';
export const PROFESSIONAL_LM_RECOMMENDATION = 'acestep-5Hz-lm-4B';
export const PROFESSIONAL_INFERENCE_STEPS = 50;
export const PROFESSIONAL_CANDIDATE_COUNT = 2;
export const PROFESSIONAL_GUIDANCE_SCALE = 7.0;
export const PROFESSIONAL_PROFILE = 'ace-step-v15-xl-sft-50step-professional-v1';

class ProfessionalEngineError extends Error {
  constructor(message, status = 0, retryable = false) {
    super(message);
    this.name = 'ProfessionalEngineError';
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
    'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges,X-Sonara-Performance-Profile,X-Sonara-Model',
    Vary: 'Origin'
  };
}

function jsonResponse(request, data, status = 200, route = 'professional-direct') {
  const performanceProfile = String(
    data?.metadata?.performanceProfile || data?.performanceProfile || PROFESSIONAL_PROFILE
  );
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'private, no-store',
      'x-sonara-job-route': route,
      'x-sonara-performance-profile': performanceProfile,
      'x-sonara-model': PROFESSIONAL_MODEL,
      ...corsHeaders(request)
    }
  });
}

function engineConfig(env) {
  return {
    baseUrl: String(
      env.ACESTEP_API_URL ||
      'https://alo986761986-gif--sonara-acestep-serve-acestep.modal.run'
    ).replace(/\/$/, ''),
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
    throw new ProfessionalEngineError('SONARA engine credentials are not configured.', 503, false);
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
    throw new ProfessionalEngineError(`ACE-Step Modal request failed: ${message}`, 0, true);
  }

  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ProfessionalEngineError(
        `ACE-Step Modal returned invalid JSON (HTTP ${response.status}).`,
        response.status,
        RETRYABLE_STATUSES.has(response.status)
      );
    }
  }

  if (!response.ok) {
    const message = payload?.detail || payload?.error || payload?.message || `HTTP ${response.status}`;
    throw new ProfessionalEngineError(
      String(message),
      response.status,
      RETRYABLE_STATUSES.has(response.status)
    );
  }

  if (typeof payload?.code === 'number' && payload.code >= 400) {
    throw new ProfessionalEngineError(
      String(payload?.error || payload?.message || 'ACE-Step Modal request failed.'),
      payload.code,
      payload.code >= 500 || payload.code === 429
    );
  }

  return payload;
}

function modelName(value) {
  return String(value?.name || value?.id || value || '').trim();
}

export function selectRequiredProfessionalModel(models) {
  const available = Array.isArray(models)
    ? models.map(modelName).filter(Boolean)
    : [];
  const selected = available.find(value => value.toLowerCase() === PROFESSIONAL_MODEL.toLowerCase());
  if (!selected) {
    throw new ProfessionalEngineError(
      `The required professional Modal model ${PROFESSIONAL_MODEL} is not available. ` +
      'SONARA will not silently fall back to a Turbo or smaller ACE-Step model.',
      503,
      false
    );
  }
  return selected;
}

async function inspectModelCatalog(env, timeoutMs = 15_000) {
  const payload = await engineJson(env, '/v1/models', { method: 'GET' }, timeoutMs);
  const rawModels = Array.isArray(payload?.data?.models)
    ? payload.data.models
    : Array.isArray(payload?.models)
      ? payload.models
      : [];
  const models = rawModels.map(modelName).filter(Boolean);
  return {
    checked: true,
    models,
    defaultModel: modelName(payload?.data?.default_model || payload?.default_model)
  };
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
    throw new ProfessionalEngineError('SONARA job storage is unavailable.', 503, true);
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

function creatorExclusionsFromPrompt(prompt) {
  const value = String(prompt || '');
  const section = value.match(
    /EXPLICIT CREATOR EXCLUSIONS:\s*([\s\S]*?)(?=\n\n[A-Z][A-Z\s,&—-]+:|$)/i
  )?.[1] || '';
  return section
    .split(/\n+/)
    .map(item => item.replace(/^[-*•\s]+/, '').trim())
    .filter(item => item && !/no additional exclusions/i.test(item))
    .slice(0, 8);
}

export function buildDirectProfessionalPayload(payload) {
  const exclusions = creatorExclusionsFromPrompt(payload?.prompt);
  const negativePrompt = [
    String(payload?.lm_negative_prompt || '').trim(),
    exclusions.length ? `creator exclusions: ${exclusions.join('; ')}` : '',
    'genre drift, neighboring subgenre substitution, wrong instruments, incorrect tempo, incorrect key, malformed structure, clipping, silence, unfinished ending, static loop repetition'
  ]
    .filter(Boolean)
    .join(', ')
    .slice(0, 2000);

  return {
    ...payload,
    model: PROFESSIONAL_MODEL,
    inference_steps: PROFESSIONAL_INFERENCE_STEPS,
    thinking: true,
    use_format: false,
    use_cot_caption: true,
    use_cot_language: true,
    constrained_decoding: true,
    allow_lm_batch: true,
    lm_temperature: 0.68,
    lm_cfg_scale: 2.5,
    lm_top_p: 0.9,
    lm_repetition_penalty: 1.05,
    lm_negative_prompt: negativePrompt,
    batch_size: PROFESSIONAL_CANDIDATE_COUNT,
    infer_method: 'ode',
    audio_format: 'wav',
    guidance_scale: PROFESSIONAL_GUIDANCE_SCALE,
    shift: 1.0,
    use_adg: true
  };
}

async function releaseTask(env, payload) {
  const data = await engineJson(env, '/release_task', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  }, RELEASE_TIMEOUT_MS);
  const taskId = data?.data?.task_id;
  if (!taskId) {
    throw new ProfessionalEngineError('ACE-Step Modal did not return a generation task.', 502, false);
  }
  return String(taskId);
}

function processingPayload(jobId, context, progress, currentStage) {
  return {
    jobId,
    status: 'PROCESSING',
    progress,
    metadata: {
      engine: 'SONARA',
      provider: 'Modal',
      model: PROFESSIONAL_MODEL,
      modelRepository: PROFESSIONAL_MODEL_REPOSITORY,
      inferenceSteps: PROFESSIONAL_INFERENCE_STEPS,
      candidateCount: PROFESSIONAL_CANDIDATE_COUNT,
      performanceProfile: PROFESSIONAL_PROFILE,
      directModalConnection: true,
      qualityGate: context?.qualityGate,
      generationSpec: context?.generationSpec,
      currentStage
    }
  };
}

async function startProfessionalGeneration(request, env, jobId, context) {
  const attempts = Number(context.generationAttempts || 0);
  const qualityRegenerations = Number(context.qualityRegenerations || 0);

  if (attempts >= MAX_START_ATTEMPTS) {
    const error = 'SONARA could not start ACE-Step XL-SFT after the automatic retries.';
    await storeJob(jobId, { ...context, phase: 'failed', error, updatedAt: Date.now() });
    return jsonResponse(request, { jobId, status: 'FAILED', progress: 0, error }, 200, 'professional-start-limit');
  }

  if (qualityRegenerations > MAX_QUALITY_REGENERATIONS) {
    const error = 'SONARA reached the maximum number of professional XL-SFT quality renders.';
    await storeJob(jobId, { ...context, phase: 'failed', error, updatedAt: Date.now() });
    return jsonResponse(request, { jobId, status: 'FAILED', progress: 0, error }, 200, 'professional-quality-limit');
  }

  let nextContext = {
    ...context,
    phase: 'generating',
    selectedModel: PROFESSIONAL_MODEL,
    performanceProfile: PROFESSIONAL_PROFILE,
    generationAttempts: attempts + 1,
    generationStartedAt: Date.now(),
    generationSpec: {
      ...(context.generationSpec || {}),
      model: PROFESSIONAL_MODEL,
      modelRepository: PROFESSIONAL_MODEL_REPOSITORY,
      candidateCount: PROFESSIONAL_CANDIDATE_COUNT,
      inferenceSteps: PROFESSIONAL_INFERENCE_STEPS,
      guidanceScale: PROFESSIONAL_GUIDANCE_SCALE,
      thinking: true,
      adaptiveDualGuidance: true,
      outputFormat: 'wav',
      performanceProfile: PROFESSIONAL_PROFILE,
      directModalConnection: true
    },
    updatedAt: Date.now()
  };
  await storeJob(jobId, nextContext);

  try {
    const catalog = await inspectModelCatalog(env, 20_000);
    const selectedModel = selectRequiredProfessionalModel(catalog.models);
    const payload = buildDirectProfessionalPayload(context.payload || {});

    nextContext = {
      ...nextContext,
      payload,
      selectedModel,
      modalModelCatalog: catalog.models,
      updatedAt: Date.now()
    };
    await storeJob(jobId, nextContext);

    const taskId = await releaseTask(env, payload);
    nextContext = {
      ...nextContext,
      phase: 'submitted',
      taskId,
      updatedAt: Date.now()
    };
    await storeJob(jobId, nextContext);

    return jsonResponse(
      request,
      processingPayload(
        jobId,
        nextContext,
        45,
        qualityRegenerations > 0
          ? 'SONARA: ACE-Step XL-SFT is regenerating a professional candidate after quality control'
          : 'SONARA: ACE-Step XL-SFT 50-step professional render started on Modal'
      ),
      200,
      PROFESSIONAL_PROFILE
    );
  } catch (error) {
    const retryable = error instanceof ProfessionalEngineError && error.retryable;
    const message = error instanceof Error ? error.message : String(error);

    if (retryable && attempts + 1 < MAX_START_ATTEMPTS) {
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
        processingPayload(jobId, retryContext, 20, 'SONARA: professional ACE-Step model is warming on Modal; retrying automatically'),
        200,
        'professional-retry'
      );
    }

    await storeJob(jobId, { ...nextContext, phase: 'failed', error: message, updatedAt: Date.now() });
    return jsonResponse(
      request,
      { jobId, status: 'FAILED', progress: 0, error: message },
      200,
      'professional-start-failed'
    );
  }
}

async function maybeStartProfessionalJob(request, env, jobId) {
  const context = await readJob(jobId);
  if (!context || context.taskId || context.phase === 'completed' || context.phase === 'failed') return null;

  const startedAt = Number(context.generationStartedAt || 0);
  if (context.phase === 'generating' && startedAt && Date.now() - startedAt < GENERATION_LOCK_MS) {
    return jsonResponse(
      request,
      processingPayload(jobId, context, 35, 'SONARA: preparing the ACE-Step XL-SFT professional render'),
      200,
      PROFESSIONAL_PROFILE
    );
  }

  return startProfessionalGeneration(request, env, jobId, context);
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
  headers.set('x-sonara-performance-profile', PROFESSIONAL_PROFILE);
  headers.set('x-sonara-model', PROFESSIONAL_MODEL);
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
    console.error('[SONARA PROFESSIONAL JOB ROUTE]', error instanceof Error ? error.message : String(error));

    const localContext = await readJob(jobId);
    if (localContext) {
      if (!localContext.taskId && localContext.phase !== 'completed' && localContext.phase !== 'failed') {
        const startResponse = await maybeStartProfessionalJob(request, env, jobId);
        if (startResponse) return startResponse;
      }
      const fallback = await engineV6.fetch(request, env, {});
      return normalizeJobResponse(fallback, 'direct-worker-professional-fallback');
    }

    return jsonResponse(
      request,
      {
        jobId,
        status: 'PROCESSING',
        progress: 15,
        retryable: true,
        metadata: {
          engine: 'SONARA',
          provider: 'Modal',
          model: PROFESSIONAL_MODEL,
          performanceProfile: PROFESSIONAL_PROFILE,
          currentStage: 'SONARA: reconnecting to the professional generation session'
        }
      },
      200,
      'regional-bridge-reconnect'
    );
  }
}

async function decorateHealthResponse(request, response, env) {
  const raw = await response.text();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { status: response.ok ? 'HEALTHY' : 'ERROR' };
  }

  let catalog = { checked: false, models: [], defaultModel: '', error: '' };
  try {
    catalog = await inspectModelCatalog(env, 20_000);
  } catch (error) {
    catalog = {
      checked: false,
      models: [],
      defaultModel: '',
      error: error instanceof Error ? error.message : String(error)
    };
  }

  const professionalModelReady = catalog.models.some(
    value => value.toLowerCase() === PROFESSIONAL_MODEL.toLowerCase()
  );

  for (const key of [
    'fastModel',
    'simplePromptInferenceSteps',
    'detailedPromptInferenceSteps',
    'detailedPromptThinking',
    'fastCandidateCount',
    'qualityFallbackModel',
    'qualityFallbackSteps',
    'maximumRenderAttempts'
  ]) delete payload[key];

  payload.performanceProfile = PROFESSIONAL_PROFILE;
  payload.engine = 'ACE-Step 1.5';
  payload.provider = 'Modal';
  payload.connection = 'direct Cloudflare Worker to Modal endpoint';
  payload.inferenceProfile = 'ACE-Step 1.5 XL-SFT 4B DiT with CFG professional rendering';
  payload.model = PROFESSIONAL_MODEL;
  payload.modelRepository = PROFESSIONAL_MODEL_REPOSITORY;
  payload.professionalModelReady = professionalModelReady;
  payload.professionalModelStatus = professionalModelReady
    ? 'READY'
    : (catalog.checked ? 'MISSING' : 'WARMING_OR_UNVERIFIED');
  payload.availableModalModels = catalog.models;
  payload.modalDefaultModel = catalog.defaultModel || null;
  payload.modelCatalogError = catalog.error || null;
  payload.inferenceSteps = PROFESSIONAL_INFERENCE_STEPS;
  payload.guidanceScale = PROFESSIONAL_GUIDANCE_SCALE;
  payload.adaptiveDualGuidance = true;
  payload.thinking = true;
  payload.candidateCount = PROFESSIONAL_CANDIDATE_COUNT;
  payload.outputFormat = 'wav';
  payload.turboEnabled = false;
  payload.silentModelFallback = false;
  payload.creatorBriefPriority = 'authoritative-artistic-source';
  payload.recommendedLmModel = PROFESSIONAL_LM_RECOMMENDATION;
  payload.lmModelVerification = 'The current Modal REST model catalog does not expose the loaded 5Hz LM size.';

  if (catalog.checked && !professionalModelReady) payload.status = 'DEGRADED';
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
      const professionalResponse = await maybeStartProfessionalJob(
        request,
        env,
        decodeURIComponent(jobMatch[1])
      );
      if (professionalResponse) return professionalResponse;
    }

    const response = await engineV6.fetch(request, env, ctx);

    if (path === '/' || path === '/api/health') {
      return decorateHealthResponse(request, response, env);
    }

    if (jobMatch) {
      return normalizeJobResponse(
        response,
        bridgeRequest ? 'regional-worker-professional-cache' : 'direct-worker-professional'
      );
    }

    return response;
  }
};
