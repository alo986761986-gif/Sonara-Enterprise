const MODAL_DEFAULT_URL = 'https://alo986761986-gif--sonara-acestep-serve-acestep.modal.run';
const PUBLIC_API_ORIGIN = 'https://api.sonaraenterprise.com';
const ALLOWED_ORIGINS = new Set([
  'https://sonaraenterprise.com',
  'https://www.sonaraenterprise.com',
  PUBLIC_API_ORIGIN
]);
const RETRYABLE_MODAL_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let generationSpecCache = null;
let generationSpecExpiresAt = 0;

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://sonaraenterprise.com';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Range',
    'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges',
    Vary: 'Origin'
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

class ModalRequestError extends Error {
  constructor(message, status = 0, retryable = false) {
    super(message);
    this.name = 'ModalRequestError';
    this.status = status;
    this.retryable = retryable;
  }
}

async function fetchModal(env, path, init = {}, timeoutMs = 12000) {
  const cfg = config(env);
  if (!cfg.key || !cfg.secret) {
    throw new ModalRequestError('Modal proxy credentials are not configured.', 503, false);
  }

  let response;
  try {
    response = await fetch(`${cfg.baseUrl}${path}`, {
      ...init,
      headers: {
        ...authHeaders(env),
        ...(init.headers || {})
      },
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    throw new ModalRequestError(
      `Modal network error: ${error instanceof Error ? error.message : String(error)}`,
      0,
      true
    );
  }

  return response;
}

async function modalJson(env, path, init = {}, timeoutMs = 12000) {
  const response = await fetchModal(env, path, init, timeoutMs);
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new ModalRequestError(
        `Modal returned non-JSON HTTP ${response.status}: ${text.slice(0, 180)}`,
        response.status,
        RETRYABLE_MODAL_STATUSES.has(response.status)
      );
    }
  }

  if (!response.ok) {
    throw new ModalRequestError(
      `Modal HTTP ${response.status}: ${data?.detail || data?.error || data?.message || 'request failed'}`,
      response.status,
      RETRYABLE_MODAL_STATUSES.has(response.status)
    );
  }

  return data;
}

async function loadGenerationSpec(env) {
  if (generationSpecCache && Date.now() < generationSpecExpiresAt) return generationSpecCache;

  let lastError;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const info = await modalJson(env, '/gradio_api/info', { method: 'GET' }, 9000);
      const spec = info?.named_endpoints?.['/generation_wrapper'];
      if (!spec || !Array.isArray(spec.parameters)) {
        throw new ModalRequestError('ACE-Step Gradio generation endpoint is unavailable.', 502, false);
      }
      generationSpecCache = spec;
      generationSpecExpiresAt = Date.now() + 10 * 60 * 1000;
      return spec;
    } catch (error) {
      lastError = error;
      const retryable = error instanceof ModalRequestError && error.retryable;
      if (!retryable || attempt === 5) break;
      await sleep(1500);
    }
  }

  throw lastError || new ModalRequestError('ACE-Step Gradio API did not wake up in time.', 503, true);
}

function setGradioValue(parameters, data, label, value) {
  const index = parameters.findIndex(parameter => String(parameter?.label || '') === label);
  if (index >= 0) data[index] = value;
}

function buildGenerationData(spec, body) {
  const parameters = spec.parameters || [];
  const data = parameters.map(parameter => (
    parameter?.parameter_has_default ? parameter.parameter_default : null
  ));

  const duration = clamp(body.durationSec ?? body.duration, 30, 30, 240);
  const bpm = clamp(body.bpm, 124, 40, 240);
  const caption = [body.genre, body.mood, body.key, body.prompt]
    .filter(Boolean)
    .map(value => String(value).trim())
    .filter(Boolean)
    .join(', ') || 'Professional electronic music production';

  setGradioValue(parameters, data, 'Music Caption', caption);
  setGradioValue(parameters, data, 'Lyrics', body.lyrics || '');
  setGradioValue(parameters, data, 'BPM (Beats Per Minute)', bpm);
  setGradioValue(parameters, data, 'Key', body.key || '');
  setGradioValue(parameters, data, 'Time Signature', body.timeSignature || '');
  setGradioValue(parameters, data, 'Vocal Language', body.vocalLanguage || 'unknown');
  setGradioValue(parameters, data, 'DiT Inference Steps', 8);
  setGradioValue(parameters, data, 'Random Seed', true);
  setGradioValue(parameters, data, 'Seed', '-1');
  setGradioValue(parameters, data, 'Audio Duration (seconds)', duration);
  setGradioValue(parameters, data, 'Batch Size', 1);
  setGradioValue(parameters, data, 'Audio Format', 'mp3');
  setGradioValue(parameters, data, 'MP3 Bitrate', '192k');
  setGradioValue(parameters, data, 'MP3 Sample Rate', 48000);
  setGradioValue(parameters, data, 'Think', true);
  setGradioValue(parameters, data, 'Auto Score', false);
  setGradioValue(parameters, data, 'Auto LRC', false);
  setGradioValue(parameters, data, 'AutoGen', false);

  return data;
}

async function submitGradioGeneration(env, data) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await modalJson(env, '/gradio_api/call/generation_wrapper', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data })
      }, 10000);

      const eventId = response?.event_id;
      if (!eventId) throw new ModalRequestError('Gradio did not return an event_id.', 502, false);
      return String(eventId);
    } catch (error) {
      lastError = error;
      const retryable = error instanceof ModalRequestError && error.retryable;
      if (!retryable || attempt === 2) break;
      await sleep(1500);
    }
  }

  throw lastError || new ModalRequestError('Unable to submit ACE-Step generation.', 503, true);
}

async function generate(request, env) {
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405);

  let body;
  try {
    body = await request.json();
  } catch {
    return json(request, { error: 'Invalid JSON request body.' }, 400);
  }

  try {
    const spec = await loadGenerationSpec(env);
    const data = buildGenerationData(spec, body);
    const eventId = await submitGradioGeneration(env, data);
    const jobId = `g_${eventId}`;

    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: 10,
      metadata: {
        engine: 'ACE-Step 1.5 / Modal L4',
        transport: 'Gradio async queue',
        currentStage: 'ACE-Step Modal L4: generation queued'
      }
    }, 202);
  } catch (error) {
    const retryable = error instanceof ModalRequestError && error.retryable;
    return json(request, {
      error: error instanceof Error ? error.message : String(error),
      retryable,
      code: error instanceof ModalRequestError ? error.status : 0,
      stage: retryable ? 'ACE-Step Modal L4: waking GPU, retry generation shortly' : 'ACE-Step request failed'
    }, retryable ? 503 : 502);
  }
}

function parseSseBlock(block) {
  const lines = block.split(/\r?\n/);
  const eventLine = lines.find(line => line.startsWith('event:'));
  const dataLines = lines.filter(line => line.startsWith('data:'));
  if (!eventLine) return null;
  return {
    event: eventLine.slice(6).trim(),
    data: dataLines.map(line => line.slice(5).trimStart()).join('\n')
  };
}

async function readGradioEvent(env, eventId) {
  const cfg = config(env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  let response;

  try {
    response = await fetch(`${cfg.baseUrl}/gradio_api/call/generation_wrapper/${encodeURIComponent(eventId)}`, {
      method: 'GET',
      headers: authHeaders(env),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ModalRequestError(
        `Gradio result HTTP ${response.status}: ${text.slice(0, 180)}`,
        response.status,
        RETRYABLE_MODAL_STATUSES.has(response.status)
      );
    }

    if (!response.body) return { state: 'processing' };

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() || '';
      const events = parts.map(parseSseBlock).filter(Boolean);

      const complete = events.find(item => item.event === 'complete');
      if (complete) {
        let data;
        try {
          data = JSON.parse(complete.data || 'null');
        } catch {
          throw new ModalRequestError('Gradio completed with invalid JSON output.', 502, false);
        }
        try { await reader.cancel(); } catch {}
        return { state: 'complete', data };
      }

      const failure = events.find(item => item.event === 'error');
      if (failure) {
        try { await reader.cancel(); } catch {}
        return { state: 'error', error: failure.data || 'ACE-Step Gradio generation failed.' };
      }

      if (events.some(item => item.event === 'generating' || item.event === 'heartbeat')) {
        try { await reader.cancel(); } catch {}
        return { state: 'processing' };
      }

      if (done) return { state: 'processing' };
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return { state: 'processing' };
    if (error instanceof ModalRequestError && error.retryable) return { state: 'processing' };
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function findAudioDescriptor(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findAudioDescriptor(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object') return null;

  const url = typeof value.url === 'string' ? value.url : '';
  const path = typeof value.path === 'string' ? value.path : '';
  const mime = String(value.mime_type || value.mimeType || '');
  const name = String(value.orig_name || value.name || '');
  if (
    mime.startsWith('audio/') ||
    /\.(mp3|wav|flac|ogg|opus|aac)(?:$|\?)/i.test(url) ||
    /\.(mp3|wav|flac|ogg|opus|aac)$/i.test(path) ||
    /\.(mp3|wav|flac|ogg|opus|aac)$/i.test(name)
  ) {
    return { url, path };
  }

  for (const nested of Object.values(value)) {
    const found = findAudioDescriptor(nested);
    if (found) return found;
  }
  return null;
}

function publicAudioUrl(env, descriptor) {
  const cfg = config(env);
  let source = '';

  if (descriptor?.url) {
    try {
      const parsed = new URL(descriptor.url, cfg.baseUrl);
      source = `${parsed.pathname}${parsed.search}`;
    } catch {}
  }

  if (!source && descriptor?.path) {
    source = `/gradio_api/file=${encodeURIComponent(descriptor.path)}`;
  }

  if (!source) return '';
  return `${PUBLIC_API_ORIGIN}/api/modal/audio?source=${encodeURIComponent(source)}`;
}

async function legacyJob(request, env, jobId) {
  try {
    const data = await modalJson(env, '/query_result', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task_id_list: [jobId] })
    }, 9000);

    const item = data?.data?.[0];
    if (!item || Number(item.status) === 0) {
      return json(request, {
        jobId,
        status: 'PROCESSING',
        progress: item ? 65 : 35,
        metadata: { engine: 'ACE-Step 1.5 / Modal L4', currentStage: 'ACE-Step Modal L4: generating audio' }
      });
    }

    if (Number(item.status) === 2) {
      return json(request, { jobId, status: 'FAILED', progress: 0, error: item.error || 'ACE-Step generation failed.' });
    }

    let outputs = item.result;
    if (typeof outputs === 'string') {
      try { outputs = JSON.parse(outputs); } catch { outputs = []; }
    }
    const first = Array.isArray(outputs) ? outputs[0] : outputs || {};
    const sourceUrl = first?.url || first?.file;
    if (!sourceUrl) return json(request, { jobId, status: 'FAILED', error: 'ACE-Step completed without an audio URL.' }, 502);

    const cfg = config(env);
    const parsed = new URL(sourceUrl, cfg.baseUrl);
    const audioPath = parsed.searchParams.get('path');
    if (!audioPath) return json(request, { jobId, status: 'FAILED', error: 'ACE-Step audio URL has no path parameter.' }, 502);

    const audioUrl = `${PUBLIC_API_ORIGIN}/api/modal/audio?path=${encodeURIComponent(audioPath)}`;
    return json(request, {
      jobId,
      status: 'COMPLETED',
      progress: 100,
      audioUrl,
      metadata: { engine: 'ACE-Step 1.5 / Modal L4', provider: 'Modal', model: 'acestep-v15-turbo', audioUrl, currentStage: 'Audio ready' }
    });
  } catch (error) {
    const retryable = error instanceof ModalRequestError && error.retryable;
    if (retryable) {
      return json(request, {
        jobId,
        status: 'PROCESSING',
        progress: 65,
        transientError: true,
        metadata: { engine: 'ACE-Step 1.5 / Modal L4', currentStage: 'ACE-Step Modal L4: GPU busy, retrying automatically' }
      });
    }
    return json(request, { jobId, status: 'FAILED', progress: 0, error: error instanceof Error ? error.message : String(error) }, 502);
  }
}

async function job(request, env, jobId) {
  if (request.method !== 'GET') return json(request, { error: 'Method not allowed' }, 405);
  if (!jobId.startsWith('g_')) return legacyJob(request, env, jobId);

  try {
    const result = await readGradioEvent(env, jobId.slice(2));
    if (result.state === 'processing') {
      return json(request, {
        jobId,
        status: 'PROCESSING',
        progress: 65,
        metadata: {
          engine: 'ACE-Step 1.5 / Modal L4',
          transport: 'Gradio async queue',
          currentStage: 'ACE-Step Modal L4: generating audio'
        }
      });
    }

    if (result.state === 'error') {
      return json(request, { jobId, status: 'FAILED', progress: 0, error: result.error || 'ACE-Step generation failed.' });
    }

    const descriptor = findAudioDescriptor(result.data);
    const audioUrl = publicAudioUrl(env, descriptor);
    if (!audioUrl) {
      return json(request, {
        jobId,
        status: 'FAILED',
        progress: 0,
        error: 'ACE-Step completed but no generated audio file was found.'
      }, 502);
    }

    return json(request, {
      jobId,
      status: 'COMPLETED',
      progress: 100,
      audioUrl,
      metadata: {
        engine: 'ACE-Step 1.5 / Modal L4',
        provider: 'Modal',
        model: 'acestep-v15-turbo',
        transport: 'Gradio async queue',
        audioUrl,
        currentStage: 'Audio ready'
      }
    });
  } catch (error) {
    const retryable = error instanceof ModalRequestError && error.retryable;
    if (retryable) {
      return json(request, {
        jobId,
        status: 'PROCESSING',
        progress: 65,
        transientError: true,
        metadata: { engine: 'ACE-Step 1.5 / Modal L4', currentStage: 'ACE-Step Modal L4: waiting for result' }
      });
    }
    return json(request, { jobId, status: 'FAILED', progress: 0, error: error instanceof Error ? error.message : String(error) }, 502);
  }
}

async function audio(request, env, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return json(request, { error: 'Method not allowed' }, 405);

  const cfg = config(env);
  if (!cfg.key || !cfg.secret) return json(request, { error: 'Modal proxy credentials are not configured.' }, 503);

  const source = url.searchParams.get('source');
  const legacyPath = url.searchParams.get('path');
  let target = '';

  if (source) {
    if (!/^\/gradio_api\/(?:file=|stream\/)/.test(source) && !/^\/file=/.test(source)) {
      return json(request, { error: 'Invalid Gradio audio source.' }, 400);
    }
    target = `${cfg.baseUrl}${source}`;
  } else if (legacyPath) {
    target = `${cfg.baseUrl}/v1/audio?path=${encodeURIComponent(legacyPath)}`;
  } else {
    return json(request, { error: 'Missing audio source.' }, 400);
  }

  const headers = authHeaders(env);
  const range = request.headers.get('range');
  if (range) headers.Range = range;

  const response = await fetch(target, { method: request.method, headers });
  if (!response.ok && response.status !== 206) {
    const text = await response.text();
    return json(request, { error: `Modal audio HTTP ${response.status}`, message: text.slice(0, 180) }, response.status || 502);
  }

  const out = new Headers();
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
    const value = response.headers.get(name);
    if (value) out.set(name, value);
  }
  out.set('cache-control', 'private, no-store');
  for (const [name, value] of Object.entries(corsHeaders(request))) out.set(name, value);

  return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers: out });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });

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
        engine: 'ACE-Step 1.5 / Modal L4',
        transport: 'Gradio async queue',
        resilience: 'async-gradio-v1'
      });
    }

    if (path === '/api/engine/generate') return generate(request, env);

    const match = path.match(/^\/api\/music\/job\/([^/]+)$/);
    if (match) return job(request, env, decodeURIComponent(match[1]));

    if (path === '/api/modal/audio') return audio(request, env, url);

    return json(request, { error: 'Not found', path }, 404);
  }
};
