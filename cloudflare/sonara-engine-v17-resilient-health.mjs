import engineV17 from './sonara-engine-v17-lm-composer.mjs';

const MODEL = 'acestep-v15-turbo';
const LM_MODEL = 'acestep-5Hz-lm-0.6B';
const PROFILE = 'sonara-lm-composer-v17';
const QUALITY_LOCK = 'v17-5hz-thinking-cot-8step';
const QUICK_HEALTH_TIMEOUT_MS = 3500;

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

function configuredWorkers(env = {}) {
  return String(
    env.ACESTEP_WORKER_URLS ||
    env.ACE_STEP_API_URLS ||
    env.SONARA_ACE_STEP_WORKERS ||
    ''
  )
    .split(/[\s,;]+/)
    .map(normalizeBaseUrl)
    .filter(url => /^https?:\/\//i.test(url))
    .slice(0, 4)
    .map((baseUrl, index) => ({ id: `t4-${index}`, baseUrl, kind: 'kaggle' }));
}

function workerHeaders(env) {
  const headers = { Accept: 'application/json' };
  const apiKey = String(env.ACE_STEP_API_KEY || env.ACESTEP_API_KEY || '').trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
    headers['X-API-Key'] = apiKey;
  }
  return headers;
}

async function quickCheck(worker, env) {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${worker.baseUrl}/health`, {
      method: 'GET',
      headers: workerHeaders(env),
      signal: AbortSignal.timeout(QUICK_HEALTH_TIMEOUT_MS)
    });
    if (!response.ok) {
      return { ...worker, healthy: false, upstreamStatus: response.status, latencyMs: Date.now() - startedAt };
    }
    const payload = await response.json().catch(() => ({}));
    const data = payload?.data || payload;
    const state = String(data?.status || payload?.status || '').toLowerCase();
    const healthy = payload?.code === 200 || ['ok', 'ready', 'healthy', 'online', 'success'].includes(state);
    return { ...worker, healthy, upstreamStatus: response.status, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      ...worker,
      healthy: false,
      upstreamStatus: null,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.name : 'unreachable'
    };
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
    'Access-Control-Expose-Headers': 'X-Sonara-Music-Quality',
    Vary: 'Origin'
  };
}

async function fastHealth(request, env) {
  const configured = configuredWorkers(env);
  const checked = await Promise.all(configured.map(worker => quickCheck(worker, env)));
  const healthy = checked.filter(worker => worker.healthy);
  const body = {
    status: healthy.length ? 'ok' : 'degraded',
    sonaraMusicV17: true,
    lmComposer: true,
    engine: 'SONARA ACE-Step 1.5 + 5Hz LM',
    model: MODEL,
    lmModel: LM_MODEL,
    studioQuality: true,
    studioQualityProfile: PROFILE,
    qualityLock: QUALITY_LOCK,
    thinking: true,
    cotCaption: true,
    cotLanguage: true,
    constrainedDecoding: true,
    inferenceSteps: 8,
    healthMode: 'fast-non-blocking',
    healthTimeoutMs: QUICK_HEALTH_TIMEOUT_MS,
    aceStepWorkerCount: healthy.length,
    aceStepWorkers: healthy.map(({ id, kind, latencyMs }) => ({ id, kind, latencyMs })),
    configuredAceStepWorkerCount: configured.length,
    workerDiagnostics: checked.map(({ id, kind, healthy: ok, upstreamStatus, latencyMs, error }) => ({
      id,
      kind,
      healthy: ok,
      upstreamStatus,
      latencyMs,
      error: error || null
    })),
    paidFallbackUsed: false
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'private, no-store',
      'x-sonara-music-quality': PROFILE,
      ...corsHeaders(request)
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    if (request.method === 'GET' && url.pathname === '/api/health') {
      return fastHealth(request, env);
    }
    return engineV17.fetch(request, env, ctx);
  }
};
