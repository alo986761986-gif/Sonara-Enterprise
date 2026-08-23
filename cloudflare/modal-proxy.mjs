const MODAL_DEFAULT_URL = 'https://alo986761986-gif--sonara-acestep-serve-acestep.modal.run';
const PUBLIC_API_ORIGIN = 'https://api.sonaraenterprise.com';
const ALLOWED_ORIGINS = new Set([
  'https://sonaraenterprise.com',
  'https://www.sonaraenterprise.com',
  PUBLIC_API_ORIGIN
]);

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://sonaraenterprise.com';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Range',
    'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges',
    'Vary': 'Origin'
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'no-store',
      ...corsHeaders(request)
    }
  });
}

function config(env) {
  return {
    baseUrl: String(env.ACESTEP_API_URL || MODAL_DEFAULT_URL).replace(/\/$/, ''),
    key: String(env.MODAL_PROXY_KEY || '').trim(),
    secret: String(env.MODAL_PROXY_SECRET || '').trim()
  };
}

function authHeaders(env, extra = {}) {
  const cfg = config(env);
  return {
    'Modal-Key': cfg.key,
    'Modal-Secret': cfg.secret,
    ...extra
  };
}

function clamp(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

async function modalJson(env, path, init = {}) {
  const cfg = config(env);
  if (!cfg.key || !cfg.secret) {
    throw new Error('Modal proxy credentials are not configured.');
  }

  const response = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      ...authHeaders(env),
      ...(init.headers || {})
    }
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Modal returned non-JSON HTTP ${response.status}: ${text.slice(0, 180)}`);
  }

  if (!response.ok) {
    throw new Error(`Modal HTTP ${response.status}: ${data?.detail || data?.error || data?.message || 'request failed'}`);
  }

  return data;
}

function parseOutputs(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  }
  return [value];
}

async function generate(request, env) {
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405);

  let body;
  try {
    body = await request.json();
  } catch {
    return json(request, { error: 'Invalid JSON request body.' }, 400);
  }

  const duration = clamp(body.durationSec ?? body.duration, 30, 5, 480);
  const bpm = clamp(body.bpm, 124, 40, 240);
  const prompt = [body.genre, body.mood, body.key, body.prompt]
    .filter(Boolean)
    .map(v => String(v).trim())
    .filter(Boolean)
    .join(', ');

  try {
    const data = await modalJson(env, '/release_task', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: prompt || 'Professional electronic music production',
        lyrics: body.lyrics || '',
        thinking: true,
        audio_duration: duration,
        bpm,
        inference_steps: 4,
        batch_size: 1,
        infer_method: 'ode',
        audio_format: 'mp3',
        model: 'acestep-v15-turbo'
      })
    });

    const taskId = data?.data?.task_id;
    if (!taskId) return json(request, { error: 'Modal did not return a task_id.' }, 502);

    return json(request, {
      jobId: taskId,
      status: 'PROCESSING',
      progress: 10,
      metadata: {
        engine: 'ACE-Step 1.5 / Modal L4',
        currentStage: 'ACE-Step Modal L4: generation started'
      }
    }, 202);
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : String(error) }, 502);
  }
}

async function job(request, env, jobId) {
  if (request.method !== 'GET') return json(request, { error: 'Method not allowed' }, 405);

  try {
    const data = await modalJson(env, '/query_result', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task_id_list: [jobId] })
    });

    const item = data?.data?.[0];
    if (!item || Number(item.status) === 0) {
      return json(request, {
        jobId,
        status: 'PROCESSING',
        progress: item ? 65 : 35,
        metadata: {
          engine: 'ACE-Step 1.5 / Modal L4',
          currentStage: 'ACE-Step Modal L4: generating audio'
        }
      });
    }

    if (Number(item.status) === 2) {
      return json(request, {
        jobId,
        status: 'FAILED',
        progress: 0,
        error: item.error || 'ACE-Step generation failed.'
      });
    }

    const first = parseOutputs(item.result)[0] || {};
    const sourceUrl = first.url || first.file;
    if (!sourceUrl) {
      return json(request, {
        jobId,
        status: 'FAILED',
        error: 'ACE-Step completed without an audio URL.'
      }, 502);
    }

    const cfg = config(env);
    const parsed = new URL(sourceUrl, cfg.baseUrl);
    const audioPath = parsed.searchParams.get('path');
    if (!audioPath) {
      return json(request, {
        jobId,
        status: 'FAILED',
        error: 'ACE-Step audio URL has no path parameter.'
      }, 502);
    }

    const audioUrl = `${PUBLIC_API_ORIGIN}/api/modal/audio?path=${encodeURIComponent(audioPath)}`;
    return json(request, {
      jobId,
      status: 'COMPLETED',
      progress: 100,
      audioUrl,
      metadata: {
        engine: 'ACE-Step 1.5 / Modal L4',
        provider: 'Modal',
        model: 'acestep-v15-turbo',
        audioUrl,
        currentStage: 'Audio ready'
      }
    });
  } catch (error) {
    return json(request, {
      jobId,
      status: 'FAILED',
      progress: 0,
      error: error instanceof Error ? error.message : String(error)
    }, 502);
  }
}

async function audio(request, env, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json(request, { error: 'Method not allowed' }, 405);
  }

  const audioPath = url.searchParams.get('path');
  if (!audioPath) return json(request, { error: 'Missing audio path.' }, 400);

  const cfg = config(env);
  if (!cfg.key || !cfg.secret) {
    return json(request, { error: 'Modal proxy credentials are not configured.' }, 503);
  }

  const headers = authHeaders(env);
  const range = request.headers.get('range');
  if (range) headers.Range = range;

  const response = await fetch(`${cfg.baseUrl}/v1/audio?path=${encodeURIComponent(audioPath)}`, {
    method: request.method,
    headers
  });

  if (!response.ok && response.status !== 206) {
    const text = await response.text();
    return json(request, {
      error: `Modal audio HTTP ${response.status}`,
      message: text.slice(0, 180)
    }, response.status || 502);
  }

  const out = new Headers();
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
    const value = response.headers.get(name);
    if (value) out.set(name, value);
  }
  out.set('cache-control', 'private, no-store');
  for (const [name, value] of Object.entries(corsHeaders(request))) out.set(name, value);

  return new Response(request.method === 'HEAD' ? null : response.body, {
    status: response.status,
    headers: out
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/' || path === '/api/health') {
      const cfg = config(env);
      const hasModalProxyKey = Boolean(cfg.key);
      const hasModalProxySecret = Boolean(cfg.secret);
      return json(request, {
        status: 'HEALTHY',
        service: 'sonara-production-modal-proxy',
        modalConfigured: hasModalProxyKey && hasModalProxySecret,
        hasModalProxyKey,
        hasModalProxySecret,
        keyFormatOk: hasModalProxyKey && cfg.key.startsWith('wk-'),
        secretFormatOk: hasModalProxySecret && cfg.secret.startsWith('ws-'),
        engine: 'ACE-Step 1.5 / Modal L4'
      });
    }

    if (path === '/api/engine/generate') return generate(request, env);

    const match = path.match(/^\/api\/music\/job\/([^/]+)$/);
    if (match) return job(request, env, decodeURIComponent(match[1]));

    if (path === '/api/modal/audio') return audio(request, env, url);

    return json(request, { error: 'Not found', path }, 404);
  }
};
