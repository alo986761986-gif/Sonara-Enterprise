const MODAL_DEFAULT_URL = 'https://alo986761986-gif--sonara-acestep-serve-acestep.modal.run';
const PUBLIC_API_ORIGIN = 'https://api.sonaraenterprise.com';
const ALLOWED_ORIGINS = new Set([
  'https://sonaraenterprise.com',
  'https://www.sonaraenterprise.com',
  PUBLIC_API_ORIGIN
]);
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526]);
const SPEC_CACHE_URL = 'https://sonaraenterprise.com/__sonara_internal/generation-spec-v3';
const SPEC_TTL_MS = 30 * 60 * 1000;
const JOB_CACHE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/job-v3/';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let generationSpecCache = null;
let generationSpecExpiresAt = 0;

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://sonaraenterprise.com',
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

function timeoutLike(error) {
  if (!(error instanceof Error)) return false;
  const name = String(error.name || '').toLowerCase();
  const message = String(error.message || '').toLowerCase();
  return name.includes('abort') || name.includes('timeout') || message.includes('timeout') || message.includes('aborted');
}

class SonaraEngineError extends Error {
  constructor(message, status = 0, retryable = false) {
    super(message);
    this.name = 'SonaraEngineError';
    this.status = status;
    this.retryable = retryable;
  }
}

async function fetchEngine(env, path, init = {}, timeoutMs = 30000) {
  const cfg = config(env);
  if (!cfg.key || !cfg.secret) {
    throw new SonaraEngineError('SONARA engine credentials are not configured.', 503, false);
  }

  try {
    return await fetch(`${cfg.baseUrl}${path}`, {
      ...init,
      headers: {
        ...authHeaders(env),
        ...(init.headers || {})
      },
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    if (timeoutLike(error)) throw new SonaraEngineError('SONARA engine is warming up.', 0, true);
    throw new SonaraEngineError(`SONARA network error: ${error instanceof Error ? error.message : String(error)}`, 0, true);
  }
}

async function engineJson(env, path, init = {}, timeoutMs = 30000) {
  const response = await fetchEngine(env, path, init, timeoutMs);
  const text = await response.text();
  let data = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new SonaraEngineError(`SONARA returned an invalid response (HTTP ${response.status}).`, response.status, RETRYABLE_STATUSES.has(response.status));
    }
  }

  if (!response.ok) {
    throw new SonaraEngineError(
      `SONARA HTTP ${response.status}: ${data?.detail || data?.error || data?.message || 'request failed'}`,
      response.status,
      RETRYABLE_STATUSES.has(response.status)
    );
  }
  return data;
}

async function readCachedSpec() {
  if (generationSpecCache && Date.now() < generationSpecExpiresAt) return generationSpecCache;
  try {
    if (typeof caches === 'undefined' || !caches.default) return null;
    const response = await caches.default.match(new Request(SPEC_CACHE_URL));
    if (!response) return null;
    const spec = await response.json();
    if (!spec || !Array.isArray(spec.parameters)) return null;
    generationSpecCache = spec;
    generationSpecExpiresAt = Date.now() + SPEC_TTL_MS;
    return spec;
  } catch {
    return null;
  }
}

async function storeSpec(spec) {
  generationSpecCache = spec;
  generationSpecExpiresAt = Date.now() + SPEC_TTL_MS;
  try {
    if (typeof caches === 'undefined' || !caches.default) return;
    await caches.default.put(
      new Request(SPEC_CACHE_URL),
      new Response(JSON.stringify(spec), {
        headers: {
          'content-type': 'application/json; charset=UTF-8',
          'cache-control': 'public, max-age=1800'
        }
      })
    );
  } catch {}
}

async function loadGenerationSpec(env) {
  const cached = await readCachedSpec();
  if (cached) return cached;

  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const info = await engineJson(env, '/gradio_api/info', { method: 'GET' }, 20000);
      const spec = info?.named_endpoints?.['/generation_wrapper'];
      if (!spec || !Array.isArray(spec.parameters)) {
        throw new SonaraEngineError('SONARA generation endpoint is unavailable.', 502, false);
      }
      await storeSpec(spec);
      return spec;
    } catch (error) {
      lastError = error;
      if (!(error instanceof SonaraEngineError) || !error.retryable || attempt === 7) break;
      await sleep(attempt < 2 ? 1500 : 3500);
    }
  }

  if (lastError instanceof SonaraEngineError && lastError.retryable) {
    throw new SonaraEngineError('SONARA engine is still warming up. Please wait a moment and try again.', 503, true);
  }
  throw lastError || new SonaraEngineError('SONARA engine did not wake up in time.', 503, true);
}

async function warmEngine(env) {
  try { await loadGenerationSpec(env); } catch {}
}

function setValue(parameters, data, label, value) {
  const index = parameters.findIndex(parameter => String(parameter?.label || '') === label);
  if (index >= 0) data[index] = value;
}

function buildGenerationData(spec, body, forceSafe = false) {
  const parameters = spec.parameters || [];
  const data = parameters.map(parameter => parameter?.parameter_has_default ? parameter.parameter_default : null);
  const duration = clamp(body.durationSec ?? body.duration, 30, 30, 240);
  const bpm = clamp(body.bpm, 124, 40, 240);
  const fourMinuteMode = duration >= 240;
  const safeMode = forceSafe || fourMinuteMode;
  const caption = [body.genre, body.mood, body.key, body.prompt]
    .filter(Boolean)
    .map(value => String(value).trim())
    .filter(Boolean)
    .join(', ') || 'Professional electronic music production';

  setValue(parameters, data, 'Music Caption', caption);
  setValue(parameters, data, 'Lyrics', body.lyrics || '');
  setValue(parameters, data, 'BPM (Beats Per Minute)', bpm);
  setValue(parameters, data, 'Key', body.key || '');
  setValue(parameters, data, 'Time Signature', body.timeSignature || '');
  setValue(parameters, data, 'Vocal Language', body.vocalLanguage || 'unknown');
  setValue(parameters, data, 'DiT Inference Steps', safeMode ? (forceSafe ? 4 : 6) : 8);
  setValue(parameters, data, 'Random Seed', true);
  setValue(parameters, data, 'Seed', '-1');
  setValue(parameters, data, 'Audio Duration (seconds)', duration);
  setValue(parameters, data, 'Batch Size', 1);
  setValue(parameters, data, 'Audio Format', 'mp3');
  setValue(parameters, data, 'MP3 Bitrate', '192k');
  setValue(parameters, data, 'MP3 Sample Rate', 48000);
  setValue(parameters, data, 'Think', !safeMode);
  setValue(parameters, data, 'ParallelThinking', false);
  setValue(parameters, data, 'Auto Score', false);
  setValue(parameters, data, 'Auto LRC', false);
  setValue(parameters, data, 'AutoGen', false);

  return { data, duration, safeMode };
}

async function submitGeneration(env, data) {
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const response = await engineJson(env, '/gradio_api/call/generation_wrapper', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data })
      }, 20000);
      const eventId = response?.event_id;
      if (!eventId) throw new SonaraEngineError('SONARA did not return an event ID.', 502, false);
      return String(eventId);
    } catch (error) {
      lastError = error;
      if (!(error instanceof SonaraEngineError) || !error.retryable || attempt === 7) break;
      await sleep(attempt < 2 ? 1500 : 3500);
    }
  }

  if (lastError instanceof SonaraEngineError && lastError.retryable) {
    throw new SonaraEngineError('SONARA engine is still warming up. Please wait a moment and try again.', 503, true);
  }
  throw lastError || new SonaraEngineError('Unable to submit SONARA generation.', 503, true);
}

function jobCacheUrl(jobId) {
  return `${JOB_CACHE_PREFIX}${encodeURIComponent(jobId)}`;
}

async function storeJobContext(jobId, context) {
  try {
    if (typeof caches === 'undefined' || !caches.default) return;
    await caches.default.put(
      new Request(jobCacheUrl(jobId)),
      new Response(JSON.stringify(context), {
        headers: {
          'content-type': 'application/json; charset=UTF-8',
          'cache-control': 'public, max-age=3600'
        }
      })
    );
  } catch {}
}

async function readJobContext(jobId) {
  try {
    if (typeof caches === 'undefined' || !caches.default) return null;
    const response = await caches.default.match(new Request(jobCacheUrl(jobId)));
    return response ? await response.json() : null;
  } catch {
    return null;
  }
}

async function generate(request, env) {
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405);

  let body;
  try { body = await request.json(); }
  catch { return json(request, { error: 'Invalid JSON request body.' }, 400); }

  try {
    const spec = await loadGenerationSpec(env);
    const built = buildGenerationData(spec, body, false);
    const eventId = await submitGeneration(env, built.data);
    const jobId = `s_${crypto.randomUUID()}`;
    await storeJobContext(jobId, {
      eventId,
      data: built.data,
      duration: built.duration,
      fallbackCount: 0,
      createdAt: Date.now()
    });

    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: 10,
      metadata: {
        engine: 'SONARA',
        currentStage: built.duration >= 240 ? 'SONARA: four-minute generation queued' : 'SONARA: generation queued'
      }
    }, 202);
  } catch (error) {
    const retryable = error instanceof SonaraEngineError && error.retryable;
    return json(request, {
      error: retryable ? 'SONARA engine is warming up. Please wait a moment and try again.' : (error instanceof Error ? error.message : String(error)),
      retryable,
      code: error instanceof SonaraEngineError ? error.status : 0
    }, retryable ? 503 : 502);
  }
}

function parseSseBlock(block) {
  const lines = block.split(/\r?\n/);
  const eventLine = lines.find(line => line.startsWith('event:'));
  if (!eventLine) return null;
  return {
    event: eventLine.slice(6).trim(),
    data: lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
  };
}

function normalizeSseError(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower === 'null' || lower === 'undefined' || lower === '{}' || lower === '[]' || lower === '""') return '';
  try {
    const parsed = JSON.parse(raw);
    if (parsed == null) return '';
    if (typeof parsed === 'string') return parsed.trim();
    if (typeof parsed?.message === 'string') return parsed.message.trim();
    if (typeof parsed?.error === 'string') return parsed.error.trim();
  } catch {}
  return raw;
}

async function readGenerationEvent(env, eventId) {
  const cfg = config(env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${cfg.baseUrl}/gradio_api/call/generation_wrapper/${encodeURIComponent(eventId)}`, {
      method: 'GET',
      headers: authHeaders(env),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text();
      throw new SonaraEngineError(`SONARA result HTTP ${response.status}: ${text.slice(0, 180)}`, response.status, RETRYABLE_STATUSES.has(response.status));
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
        let data = null;
        try { data = JSON.parse(complete.data || 'null'); }
        catch { throw new SonaraEngineError('SONARA completed with invalid output.', 502, false); }
        try { await reader.cancel(); } catch {}
        return { state: 'complete', data };
      }

      const failure = events.find(item => item.event === 'error');
      if (failure) {
        const error = normalizeSseError(failure.data);
        try { await reader.cancel(); } catch {}
        return { state: 'error', error, emptyError: !error };
      }

      if (done) {
        const tail = parseSseBlock(buffer);
        if (tail?.event === 'complete') {
          let data = null;
          try { data = JSON.parse(tail.data || 'null'); } catch {}
          return { state: 'complete', data };
        }
        if (tail?.event === 'error') {
          const error = normalizeSseError(tail.data);
          return { state: 'error', error, emptyError: !error };
        }
        return { state: 'processing' };
      }
    }
  } catch (error) {
    if (timeoutLike(error)) return { state: 'processing' };
    if (error instanceof SonaraEngineError && error.retryable) return { state: 'processing' };
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
  ) return { url, path };

  for (const nested of Object.values(value)) {
    const found = findAudioDescriptor(nested);
    if (found) return found;
  }
  return null;
}

function makePublicAudioUrl(env, descriptor) {
  const cfg = config(env);
  let source = '';

  if (descriptor?.url) {
    try {
      const parsed = new URL(descriptor.url, cfg.baseUrl);
      source = `${parsed.pathname}${parsed.search}`;
    } catch {}
  }
  if (!source && descriptor?.path) source = `/gradio_api/file=${encodeURIComponent(descriptor.path)}`;
  return source ? `${PUBLIC_API_ORIGIN}/api/modal/audio?source=${encodeURIComponent(source)}` : '';
}

async function retrySafely(env, jobId, context) {
  const spec = await loadGenerationSpec(env);
  const parameters = spec.parameters || [];
  const safeData = Array.isArray(context?.data) ? [...context.data] : null;
  if (!safeData) return false;

  setValue(parameters, safeData, 'DiT Inference Steps', 4);
  setValue(parameters, safeData, 'Think', false);
  setValue(parameters, safeData, 'ParallelThinking', false);
  setValue(parameters, safeData, 'Batch Size', 1);
  setValue(parameters, safeData, 'Auto Score', false);
  setValue(parameters, safeData, 'Auto LRC', false);
  setValue(parameters, safeData, 'AutoGen', false);

  const eventId = await submitGeneration(env, safeData);
  await storeJobContext(jobId, {
    ...context,
    eventId,
    data: safeData,
    fallbackCount: Number(context?.fallbackCount || 0) + 1,
    retriedAt: Date.now()
  });
  return true;
}

async function legacyJob(request, env, jobId) {
  try {
    const data = await engineJson(env, '/query_result', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task_id_list: [jobId] })
    }, 12000);
    const item = data?.data?.[0];

    if (!item || Number(item.status) === 0) {
      return json(request, { jobId, status: 'PROCESSING', progress: 60, metadata: { engine: 'SONARA' } });
    }
    if (Number(item.status) === 2) {
      return json(request, { jobId, status: 'FAILED', progress: 0, error: item.error || 'SONARA generation failed.' });
    }

    let outputs = item.result;
    if (typeof outputs === 'string') {
      try { outputs = JSON.parse(outputs); } catch { outputs = []; }
    }
    const descriptor = findAudioDescriptor(outputs);
    if (!descriptor) return json(request, { jobId, status: 'FAILED', progress: 0, error: 'SONARA completed without an audio file.' }, 502);

    let audioUrl = makePublicAudioUrl(env, descriptor);
    if (!audioUrl) {
      const first = Array.isArray(outputs) ? outputs[0] : outputs || {};
      const sourceUrl = first?.url || first?.file;
      if (sourceUrl) {
        const parsed = new URL(sourceUrl, config(env).baseUrl);
        const audioPath = parsed.searchParams.get('path');
        if (audioPath) audioUrl = `${PUBLIC_API_ORIGIN}/api/modal/audio?path=${encodeURIComponent(audioPath)}`;
      }
    }
    if (!audioUrl) return json(request, { jobId, status: 'FAILED', progress: 0, error: 'SONARA audio file could not be resolved.' }, 502);

    return json(request, { jobId, status: 'COMPLETED', progress: 100, audioUrl, metadata: { engine: 'SONARA', audioUrl } });
  } catch (error) {
    if (error instanceof SonaraEngineError && error.retryable) {
      return json(request, { jobId, status: 'PROCESSING', progress: 60, metadata: { engine: 'SONARA' } });
    }
    return json(request, { jobId, status: 'FAILED', progress: 0, error: error instanceof Error ? error.message : 'SONARA generation failed.' }, 502);
  }
}

async function job(request, env, jobId) {
  if (request.method !== 'GET') return json(request, { error: 'Method not allowed' }, 405);

  if (!jobId.startsWith('s_')) {
    if (jobId.startsWith('g_')) {
      const result = await readGenerationEvent(env, jobId.slice(2));
      if (result.state === 'processing') return json(request, { jobId, status: 'PROCESSING', progress: 65, metadata: { engine: 'SONARA' } });
      if (result.state === 'error') return json(request, { jobId, status: 'FAILED', progress: 0, error: result.error || 'SONARA generation failed.' });
      const descriptor = findAudioDescriptor(result.data);
      const audioUrl = makePublicAudioUrl(env, descriptor);
      if (!audioUrl) return json(request, { jobId, status: 'FAILED', progress: 0, error: 'SONARA completed without an audio file.' }, 502);
      return json(request, { jobId, status: 'COMPLETED', progress: 100, audioUrl, metadata: { engine: 'SONARA', audioUrl } });
    }
    return legacyJob(request, env, jobId);
  }

  const context = await readJobContext(jobId);
  if (!context?.eventId) {
    return json(request, { jobId, status: 'FAILED', progress: 0, error: 'SONARA generation session expired. Please generate the track again.' }, 410);
  }

  try {
    const result = await readGenerationEvent(env, String(context.eventId));
    if (result.state === 'processing') {
      return json(request, {
        jobId,
        status: 'PROCESSING',
        progress: context.fallbackCount ? 70 : 65,
        metadata: { engine: 'SONARA', currentStage: 'SONARA: generating audio' }
      });
    }

    if (result.state === 'error') {
      const shouldRetry = Number(context.fallbackCount || 0) < 1 && (Number(context.duration || 0) >= 180 || result.emptyError);
      if (shouldRetry && await retrySafely(env, jobId, context)) {
        return json(request, {
          jobId,
          status: 'PROCESSING',
          progress: 35,
          metadata: { engine: 'SONARA', currentStage: 'SONARA: automatic recovery in progress' }
        });
      }
      return json(request, { jobId, status: 'FAILED', progress: 0, error: result.error || 'SONARA could not complete this generation. Please try again.' });
    }

    const descriptor = findAudioDescriptor(result.data);
    const audioUrl = makePublicAudioUrl(env, descriptor);
    if (!audioUrl) {
      if (Number(context.fallbackCount || 0) < 1 && await retrySafely(env, jobId, context)) {
        return json(request, {
          jobId,
          status: 'PROCESSING',
          progress: 35,
          metadata: { engine: 'SONARA', currentStage: 'SONARA: automatic recovery in progress' }
        });
      }
      return json(request, { jobId, status: 'FAILED', progress: 0, error: 'SONARA completed without a valid audio file. Please try again.' }, 502);
    }

    return json(request, {
      jobId,
      status: 'COMPLETED',
      progress: 100,
      audioUrl,
      metadata: { engine: 'SONARA', audioUrl, currentStage: 'Audio ready' }
    });
  } catch (error) {
    if (error instanceof SonaraEngineError && error.retryable) {
      return json(request, { jobId, status: 'PROCESSING', progress: 65, metadata: { engine: 'SONARA' } });
    }
    return json(request, { jobId, status: 'FAILED', progress: 0, error: error instanceof Error ? error.message : 'SONARA generation failed.' }, 502);
  }
}

async function audio(request, env, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return json(request, { error: 'Method not allowed' }, 405);

  const cfg = config(env);
  if (!cfg.key || !cfg.secret) return json(request, { error: 'SONARA engine credentials are not configured.' }, 503);

  const source = url.searchParams.get('source');
  const legacyPath = url.searchParams.get('path');
  let target = '';

  if (source) {
    if (!/^\/gradio_api\/(?:file=|stream\/)/.test(source) && !/^\/file=/.test(source)) {
      return json(request, { error: 'Invalid SONARA audio source.' }, 400);
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
    return json(request, { error: `SONARA audio HTTP ${response.status}` }, response.status || 502);
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
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/' || path === '/api/health') {
      if (ctx?.waitUntil) ctx.waitUntil(warmEngine(env));
      const cfg = config(env);
      return json(request, {
        status: 'HEALTHY',
        service: 'sonara-production-engine-v2',
        engineConfigured: Boolean(cfg.key && cfg.secret),
        engine: 'SONARA',
        transport: 'async queue',
        resilience: 'four-minute-auto-recovery-v3',
        maxDurationSeconds: 240
      });
    }

    if (path === '/api/engine/generate') return generate(request, env);

    const match = path.match(/^\/api\/music\/job\/([^/]+)$/);
    if (match) return job(request, env, decodeURIComponent(match[1]));

    if (path === '/api/modal/audio') return audio(request, env, url);

    return json(request, { error: 'Not found', path }, 404);
  }
};
