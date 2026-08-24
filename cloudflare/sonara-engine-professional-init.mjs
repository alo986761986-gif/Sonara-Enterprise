import sonaraEngine, {
  PROFESSIONAL_LM_RECOMMENDATION,
  PROFESSIONAL_MODEL,
  PROFESSIONAL_MODEL_REPOSITORY,
  PROFESSIONAL_PROFILE
} from './sonara-engine-v6-final.mjs';

const ADMIN_PATH = '/api/admin/ace-step/init';
const ADMIN_TOKEN = '1a62decebd561a81b4a43f3d1de98fc7b83a9b5f54ebb0dba4908ba772670f8c';
const MODAL_DEFAULT_URL = 'https://alo986761986-gif--sonara-acestep-serve-acestep.modal.run';
const INIT_TIMEOUT_MS = 25 * 60 * 1000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'x-sonara-model': PROFESSIONAL_MODEL,
      'x-sonara-performance-profile': PROFESSIONAL_PROFILE
    }
  });
}

function modalConfig(env) {
  return {
    baseUrl: String(env.ACESTEP_API_URL || MODAL_DEFAULT_URL).replace(/\/$/, ''),
    key: String(env.MODAL_PROXY_KEY || '').trim(),
    secret: String(env.MODAL_PROXY_SECRET || '').trim()
  };
}

async function modalRequest(env, path, init = {}, timeoutMs = INIT_TIMEOUT_MS) {
  const config = modalConfig(env);
  if (!config.key || !config.secret) {
    throw new Error('Modal proxy credentials are not configured in the SONARA Worker.');
  }

  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    redirect: 'follow',
    headers: {
      'Modal-Key': config.key,
      'Modal-Secret': config.secret,
      Accept: 'application/json',
      ...(init.headers || {})
    },
    signal: AbortSignal.timeout(timeoutMs)
  });

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text.slice(0, 2000) };
  }

  if (!response.ok || (typeof payload?.code === 'number' && payload.code >= 400)) {
    const message = payload?.error || payload?.detail || payload?.message || `HTTP ${response.status}`;
    throw new Error(String(message));
  }

  return payload;
}

function initializationRequest(stage) {
  if (stage === 'dit') {
    return {
      model: PROFESSIONAL_MODEL,
      slot: 1,
      init_llm: false
    };
  }

  if (stage === 'lm' || stage === 'full') {
    return {
      model: PROFESSIONAL_MODEL,
      slot: 1,
      init_llm: true,
      lm_model_path: PROFESSIONAL_LM_RECOMMENDATION
    };
  }

  throw new Error('Invalid stage. Use catalog, dit, lm or full.');
}

async function handleAdmin(request, env) {
  const url = new URL(request.url);
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
  }

  if (url.searchParams.get('token') !== ADMIN_TOKEN) {
    return json({ ok: false, error: 'FORBIDDEN' }, 403);
  }

  const stage = String(url.searchParams.get('stage') || 'catalog').toLowerCase();

  try {
    if (stage === 'catalog') {
      const catalog = await modalRequest(env, '/v1/models', { method: 'GET' }, 120_000);
      const health = await modalRequest(env, '/health', { method: 'GET' }, 120_000).catch(error => ({
        error: error instanceof Error ? error.message : String(error)
      }));
      return json({
        ok: true,
        stage,
        required: {
          ditModel: PROFESSIONAL_MODEL,
          ditRepository: PROFESSIONAL_MODEL_REPOSITORY,
          lmModel: PROFESSIONAL_LM_RECOMMENDATION,
          performanceProfile: PROFESSIONAL_PROFILE
        },
        catalog,
        health
      });
    }

    const startedAt = Date.now();
    const requestBody = initializationRequest(stage);
    const result = await modalRequest(env, '/v1/init', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    const catalog = await modalRequest(env, '/v1/models', { method: 'GET' }, 120_000);

    return json({
      ok: true,
      stage,
      elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
      requested: requestBody,
      result,
      catalog
    });
  } catch (error) {
    return json({
      ok: false,
      stage,
      requiredModel: PROFESSIONAL_MODEL,
      requiredLmModel: PROFESSIONAL_LM_RECOMMENDATION,
      error: error instanceof Error ? error.message : String(error)
    }, 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === ADMIN_PATH) return handleAdmin(request, env);
    return sonaraEngine.fetch(request, env, ctx);
  }
};
