import safeDiagnostic from './sonara-engine-v5-diagnostic-safe.mjs';

const ENGINE_DEFAULT_URL = 'https://alo986761986-gif--sonara-acestep-serve-acestep.modal.run';

function config(env) {
  return {
    baseUrl: String(env.ACESTEP_API_URL || ENGINE_DEFAULT_URL).replace(/\/$/, ''),
    key: String(env.MODAL_PROXY_KEY || '').trim(),
    secret: String(env.MODAL_PROXY_SECRET || '').trim()
  };
}

function headers(env, extra = {}) {
  const cfg = config(env);
  return { 'Modal-Key': cfg.key, 'Modal-Secret': cfg.secret, ...extra };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'no-store',
      'Access-Control-Allow-Origin': 'https://sonaraenterprise.com'
    }
  });
}

async function textFetch(env, path, init = {}, timeoutMs = 15000) {
  const cfg = config(env);
  try {
    const response = await fetch(`${cfg.baseUrl}${path}`, {
      ...init,
      headers: { ...headers(env), ...(init.headers || {}) },
      signal: AbortSignal.timeout(timeoutMs)
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get('content-type') || '',
      body: text.slice(0, 2000)
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    };
  }
}

async function rootCause(request, env) {
  const health = await textFetch(env, '/health', { method: 'GET' }, 15000);
  const models = await textFetch(env, '/v1/models', { method: 'GET' }, 15000);

  const release = await textFetch(env, '/release_task', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      prompt: 'deep house instrumental, warm bassline, punchy kick, atmospheric pads',
      lyrics: '',
      vocal_language: 'unknown',
      bpm: 124,
      key_scale: 'A minor',
      audio_duration: 10,
      inference_steps: 8,
      thinking: false,
      batch_size: 1,
      use_random_seed: true,
      audio_format: 'mp3',
      mp3_bitrate: '192k',
      mp3_sample_rate: 48000
    })
  }, 110000);

  return json({
    status: 'DIAGNOSTIC',
    health,
    models,
    release
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/diagnostic/rootcause' && request.method === 'GET') {
      return rootCause(request, env);
    }
    return safeDiagnostic.fetch(request, env, ctx);
  }
};
