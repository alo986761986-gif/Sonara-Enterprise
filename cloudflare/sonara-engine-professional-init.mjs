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

function modalHeaders(env, extra = {}) {
  const config = modalConfig(env);
  return {
    'Modal-Key': config.key,
    'Modal-Secret': config.secret,
    Accept: 'application/json',
    ...extra
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
      ...modalHeaders(env),
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

async function modalTextRequest(env, path, init = {}, timeoutMs = 120_000) {
  const config = modalConfig(env);
  if (!config.key || !config.secret) {
    throw new Error('Modal proxy credentials are not configured in the SONARA Worker.');
  }
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    redirect: 'follow',
    headers: {
      ...modalHeaders(env, { Accept: 'text/event-stream, application/json' }),
      ...(init.headers || {})
    },
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text.slice(0, 2000) || `HTTP ${response.status}`);
  return text;
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

  throw new Error('Invalid stage.');
}

function professionalGradioData(initLm = true) {
  return [
    '/app/checkpoints',
    PROFESSIONAL_MODEL,
    'cuda',
    initLm,
    PROFESSIONAL_LM_RECOMMENDATION,
    'pt',
    true,
    true,
    false,
    false,
    false,
    false,
    'Custom',
    2,
    'official'
  ];
}

function relevantText(value) {
  return /checkpoint|config.?path|initialize|init.?llm|lm.?model|backend|flash.?attention|offload|compile|quantization|mlx.?dit|vae/i.test(String(value || ''));
}

function summarizeEndpoint(name, endpoint) {
  const parameters = Array.isArray(endpoint?.parameters)
    ? endpoint.parameters.map(parameter => ({
        label: parameter?.label || null,
        parameterName: parameter?.parameter_name || null,
        type: parameter?.type || parameter?.python_type || null,
        default: parameter?.parameter_default ?? null
      }))
    : [];
  const returns = Array.isArray(endpoint?.returns)
    ? endpoint.returns.map(item => ({
        label: item?.label || null,
        type: item?.type || item?.python_type || null
      }))
    : [];
  return { name, parameters, returns };
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
    if (stage === 'openapi') {
      const specification = await modalRequest(env, '/openapi.json', { method: 'GET' }, 120_000);
      const paths = Object.entries(specification?.paths || {}).map(([path, methods]) => ({
        path,
        methods: Object.keys(methods || {}).filter(method => method !== 'parameters')
      }));
      return json({
        ok: true,
        stage,
        title: specification?.info?.title || null,
        version: specification?.info?.version || null,
        paths
      });
    }

    if (stage === 'gradio') {
      const [information, configuration] = await Promise.all([
        modalRequest(env, '/gradio_api/info', { method: 'GET' }, 120_000),
        modalRequest(env, '/config', { method: 'GET' }, 120_000)
      ]);

      const endpointSummaries = [
        ...Object.entries(information?.named_endpoints || {}).map(([name, endpoint]) => summarizeEndpoint(name, endpoint)),
        ...Object.entries(information?.unnamed_endpoints || {}).map(([name, endpoint]) => summarizeEndpoint(name, endpoint))
      ];
      const relevantEndpoints = endpointSummaries.filter(endpoint =>
        endpoint.parameters.length >= 12 ||
        relevantText(endpoint.name) ||
        endpoint.parameters.some(parameter => relevantText(`${parameter.label} ${parameter.parameterName}`))
      );

      const components = new Map(
        (Array.isArray(configuration?.components) ? configuration.components : []).map(component => [
          Number(component?.id),
          {
            id: Number(component?.id),
            type: component?.type || null,
            label: component?.props?.label || null,
            value: component?.props?.value ?? null,
            choices: component?.props?.choices || null
          }
        ])
      );

      const dependencies = Array.isArray(configuration?.dependencies)
        ? configuration.dependencies.map((dependency, index) => {
            const inputComponents = (dependency?.inputs || []).map(id => components.get(Number(id)) || { id: Number(id) });
            const outputComponents = (dependency?.outputs || []).map(id => components.get(Number(id)) || { id: Number(id) });
            return {
              index,
              apiName: dependency?.api_name ?? null,
              backendFn: dependency?.backend_fn || false,
              inputs: inputComponents,
              outputs: outputComponents,
              triggerMode: dependency?.trigger_mode || null,
              queue: dependency?.queue ?? null,
              types: dependency?.types || null
            };
          })
        : [];
      const relevantDependencies = dependencies.filter(item =>
        item.inputs.length >= 12 ||
        relevantText(item.apiName) ||
        item.inputs.some(component => relevantText(component?.label))
      );

      return json({
        ok: true,
        stage,
        relevantEndpoints,
        relevantDependencies,
        totalEndpoints: endpointSummaries.length,
        totalDependencies: dependencies.length
      });
    }

    if (stage === 'gradio-start' || stage === 'gradio-start-dit') {
      const initLm = stage === 'gradio-start';
      const data = professionalGradioData(initLm);
      const sessionHash = `sonara-professional-${Date.now()}`;
      const result = await modalRequest(env, '/gradio_api/call/lambda_6', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          data,
          fn_index: 9,
          session_hash: sessionHash,
          trigger_id: 11
        })
      }, 120_000);
      return json({
        ok: true,
        stage,
        sessionHash,
        eventId: result?.event_id || result?.eventId || null,
        requested: {
          ditModel: PROFESSIONAL_MODEL,
          lmModel: initLm ? PROFESSIONAL_LM_RECOMMENDATION : null,
          lmBackend: initLm ? 'pt' : null,
          offloadToCpu: true,
          flashAttention: true,
          quantization: false,
          compileModel: false,
          batchSize: 2
        },
        result
      });
    }

    if (stage === 'gradio-result') {
      const eventId = String(url.searchParams.get('event') || '').trim();
      if (!/^[A-Za-z0-9_-]{8,}$/.test(eventId)) throw new Error('A valid Gradio event ID is required.');
      const stream = await modalTextRequest(
        env,
        `/gradio_api/call/lambda_6/${encodeURIComponent(eventId)}`,
        { method: 'GET' },
        180_000
      );
      return json({ ok: true, stage, eventId, stream: stream.slice(-20_000) });
    }

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
