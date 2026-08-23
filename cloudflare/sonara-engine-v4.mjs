const ENGINE_DEFAULT_URL = 'https://alo986761986-gif--sonara-acestep-serve-acestep.modal.run';
const PUBLIC_API_ORIGIN = 'https://api.sonaraenterprise.com';
const ALLOWED_ORIGINS = new Set([
  'https://sonaraenterprise.com',
  'https://www.sonaraenterprise.com',
  PUBLIC_API_ORIGIN
]);
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526]);
const SPEC_CACHE_URL = 'https://sonaraenterprise.com/__sonara_internal/generation-spec-v5';
const JOB_CACHE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/job-v5/';
const SPEC_TTL_MS = 30 * 60 * 1000;
const JOB_TTL_SECONDS = 2 * 60 * 60;
const MAX_CAPTION_CHARS = 500;
const MAX_LYRICS_CHARS = 4000;
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
    baseUrl: String(env.ACESTEP_API_URL || ENGINE_DEFAULT_URL).replace(/\/$/, ''),
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
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
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
      throw new SonaraEngineError(
        `SONARA returned an invalid response (HTTP ${response.status}).`,
        response.status,
        RETRYABLE_STATUSES.has(response.status)
      );
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

function normalizeLabel(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function setValue(parameters, data, labels, value) {
  const aliases = (Array.isArray(labels) ? labels : [labels]).map(normalizeLabel).filter(Boolean);
  let index = parameters.findIndex(parameter => aliases.includes(normalizeLabel(parameter?.label)));
  if (index < 0) {
    index = parameters.findIndex(parameter => {
      const current = normalizeLabel(parameter?.label);
      return aliases.some(alias => current === alias || current.includes(alias));
    });
  }
  if (index >= 0) data[index] = value;
}

function buildCaption(body) {
  const caption = [body.genre, body.mood, body.key, body.prompt]
    .filter(Boolean)
    .map(value => String(value).trim())
    .filter(Boolean)
    .join(', ') || 'Professional electronic music production';
  return caption.slice(0, MAX_CAPTION_CHARS);
}

function buildGenerationData(spec, body) {
  const parameters = spec.parameters || [];
  const data = parameters.map(parameter => parameter?.parameter_has_default ? parameter.parameter_default : null);
  const duration = clamp(body.durationSec ?? body.duration, 30, 30, 240);
  const bpm = clamp(body.bpm, 124, 30, 300);
  const lyrics = String(body.lyrics || '').slice(0, MAX_LYRICS_CHARS);

  setValue(parameters, data, ['Music Caption', 'Caption'], buildCaption(body));
  setValue(parameters, data, 'Lyrics', lyrics);
  setValue(parameters, data, ['Instrumental'], !lyrics.trim());
  setValue(parameters, data, ['BPM (Beats Per Minute)', 'BPM'], bpm);
  setValue(parameters, data, ['Key', 'Key Scale'], body.key || '');
  setValue(parameters, data, ['Time Signature'], body.timeSignature || '');
  setValue(parameters, data, ['Vocal Language'], body.vocalLanguage || 'unknown');

  // Official Turbo profile: 8 steps, shift 3.0, ODE, Think enabled.
  setValue(parameters, data, ['DiT Inference Steps', 'Inference Steps'], 8);
  setValue(parameters, data, ['Shift', 'Timestep Shift'], 3.0);
  setValue(parameters, data, ['Inference Method', 'Infer Method'], 'ode');
  setValue(parameters, data, ['Sampler Mode'], 'euler');
  setValue(parameters, data, ['Random Seed'], true);
  setValue(parameters, data, ['Seed'], '-1');
  setValue(parameters, data, ['Audio Duration (seconds)', 'Audio Duration'], duration);
  setValue(parameters, data, ['Batch Size'], 1);
  setValue(parameters, data, ['Audio Format'], 'mp3');
  setValue(parameters, data, ['MP3 Bitrate'], '192k');
  setValue(parameters, data, ['MP3 Sample Rate'], 48000);
  setValue(parameters, data, ['Think'], true);
  setValue(parameters, data, ['ParallelThinking', 'Parallel Thinking'], false);
  setValue(parameters, data, ['Auto Score'], false);
  setValue(parameters, data, ['Auto LRC'], false);
  setValue(parameters, data, ['AutoGen', 'Auto Gen'], false);

  return { data, duration };
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
          'cache-control': `public, max-age=${JOB_TTL_SECONDS}`
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
    const built = buildGenerationData(spec, body);
    const eventId = await submitGeneration(env, built.data);
    const jobId = `v4_${crypto.randomUUID()}`;

    await storeJobContext(jobId, {
      eventId,
      data: built.data,
      duration: built.duration,
      retryCount: 0,
      createdAt: Date.now()
    });

    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: 10,
      metadata: {
        engine: 'SONARA',
        duration: built.duration,
        transport: 'continuous async stream',
        currentStage: 'SONARA: generation queued'
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

function parseCompleteData(raw) {
  try { return JSON.parse(raw || 'null'); }
  catch { throw new SonaraEngineError('SONARA completed with invalid output.', 502, false); }
}

async function waitForGeneration(env, eventId, pulse) {
  const cfg = config(env);
  const response = await fetch(`${cfg.baseUrl}/gradio_api/call/generation_wrapper/${encodeURIComponent(eventId)}`, {
    method: 'GET',
    headers: authHeaders(env)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new SonaraEngineError(
      `SONARA result HTTP ${response.status}: ${text.slice(0, 180)}`,
      response.status,
      RETRYABLE_STATUSES.has(response.status)
    );
  }
  if (!response.body) return { state: 'error', error: 'SONARA returned an empty result stream.' };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let pendingRead = reader.read();

  while (true) {
    const outcome = await Promise.race([
      pendingRead.then(value => ({ type: 'read', value })),
      sleep(8000).then(() => ({ type: 'pulse' }))
    ]);

    if (outcome.type === 'pulse') {
      pulse();
      continue;
    }

    const { value, done } = outcome.value;
    if (value) {
      buffer += decoder.decode(value, { stream: true });
      pulse();
    }

    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || '';
    for (const block of blocks) {
      const event = parseSseBlock(block);
      if (!event) continue;
      if (event.event === 'complete') {
        try { await reader.cancel(); } catch {}
        return { state: 'complete', data: parseCompleteData(event.data) };
      }
      if (event.event === 'error') {
        const error = normalizeSseError(event.data);
        try { await reader.cancel(); } catch {}
        return { state: 'error', error };
      }
    }

    if (done) {
      const tail = parseSseBlock(buffer);
      if (tail?.event === 'complete') return { state: 'complete', data: parseCompleteData(tail.data) };
      if (tail?.event === 'error') return { state: 'error', error: normalizeSseError(tail.data) };
      return { state: 'error', error: 'SONARA result stream closed before completion.' };
    }

    pendingRead = reader.read();
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

function descriptorToSource(env, descriptor) {
  const cfg = config(env);
  if (descriptor?.url) {
    try {
      const parsed = new URL(descriptor.url, cfg.baseUrl);
      return `${parsed.pathname}${parsed.search}`;
    } catch {}
  }
  if (descriptor?.path) return `/gradio_api/file=${encodeURIComponent(descriptor.path)}`;
  return '';
}

function publicAudioUrl(source) {
  return source ? `${PUBLIC_API_ORIGIN}/api/modal/audio?source=${encodeURIComponent(source)}` : '';
}

async function retryGeneration(env, jobId, context) {
  if (Number(context.retryCount || 0) >= 1 || !Array.isArray(context.data)) return null;
  const eventId = await submitGeneration(env, context.data);
  const next = {
    ...context,
    eventId,
    retryCount: Number(context.retryCount || 0) + 1,
    retriedAt: Date.now()
  };
  await storeJobContext(jobId, next);
  return next;
}

function streamingJsonHeaders(request) {
  return {
    'content-type': 'application/json; charset=UTF-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...corsHeaders(request)
  };
}

function streamJobResult(request, env, jobId, initialContext) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const write = text => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(text)); } catch { closed = true; }
      };
      const finish = payload => {
        if (closed) return;
        write(JSON.stringify(payload));
        try { controller.close(); } catch {}
        closed = true;
      };
      const pulse = () => write('\n');

      // Leading whitespace is valid JSON whitespace and keeps the client connection alive.
      pulse();

      let context = initialContext;
      try {
        for (let attempt = Number(context.retryCount || 0); attempt <= 1; attempt += 1) {
          const result = await waitForGeneration(env, String(context.eventId), pulse);
          if (result.state === 'complete') {
            const descriptor = findAudioDescriptor(result.data);
            const source = descriptorToSource(env, descriptor);
            const audioUrl = publicAudioUrl(source);
            if (audioUrl) {
              finish({
                jobId,
                status: 'COMPLETED',
                progress: 100,
                audioUrl,
                metadata: {
                  engine: 'SONARA',
                  duration: context.duration,
                  audioUrl,
                  currentStage: 'Audio ready'
                }
              });
              return;
            }
          }

          if (attempt < 1) {
            const retried = await retryGeneration(env, jobId, context);
            if (retried) {
              context = retried;
              pulse();
              continue;
            }
          }

          finish({
            jobId,
            status: 'FAILED',
            progress: 0,
            error: result.error || 'SONARA could not complete this generation. Please try again.'
          });
          return;
        }
      } catch (error) {
        if (error instanceof SonaraEngineError && error.retryable && Number(context.retryCount || 0) < 1) {
          try {
            const retried = await retryGeneration(env, jobId, context);
            if (retried) {
              const result = await waitForGeneration(env, String(retried.eventId), pulse);
              const descriptor = result.state === 'complete' ? findAudioDescriptor(result.data) : null;
              const source = descriptorToSource(env, descriptor);
              const audioUrl = publicAudioUrl(source);
              if (audioUrl) {
                finish({ jobId, status: 'COMPLETED', progress: 100, audioUrl, metadata: { engine: 'SONARA', duration: retried.duration, audioUrl, currentStage: 'Audio ready' } });
                return;
              }
            }
          } catch {}
        }

        finish({
          jobId,
          status: 'FAILED',
          progress: 0,
          error: error instanceof Error ? error.message : 'SONARA generation failed.'
        });
      }
    }
  });

  return new Response(stream, { status: 200, headers: streamingJsonHeaders(request) });
}

async function job(request, env, jobId) {
  if (request.method !== 'GET') return json(request, { error: 'Method not allowed' }, 405);

  if (!jobId.startsWith('v4_')) {
    return json(request, {
      jobId,
      status: 'FAILED',
      progress: 0,
      error: 'SONARA generation session belongs to an older engine version. Please generate the track again.'
    }, 410);
  }

  const context = await readJobContext(jobId);
  if (!context?.eventId) {
    return json(request, {
      jobId,
      status: 'FAILED',
      progress: 0,
      error: 'SONARA generation session expired. Please generate the track again.'
    }, 410);
  }

  return streamJobResult(request, env, jobId, context);
}

function validSource(source) {
  return /^\/gradio_api\/(?:file=|stream\/)/.test(source) || /^\/file=/.test(source) || /^\/v1\/audio\?/.test(source);
}

async function audio(request, env, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return json(request, { error: 'Method not allowed' }, 405);

  const cfg = config(env);
  if (!cfg.key || !cfg.secret) return json(request, { error: 'SONARA engine credentials are not configured.' }, 503);

  const source = url.searchParams.get('source');
  const legacyPath = url.searchParams.get('path');
  let target = '';

  if (source) {
    if (!validSource(source)) return json(request, { error: 'Invalid SONARA audio source.' }, 400);
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
        service: 'sonara-production-engine-v4',
        engineConfigured: Boolean(cfg.key && cfg.secret),
        engine: 'SONARA',
        transport: 'continuous async stream',
        resilience: 'official-turbo-continuous-sse-v5',
        maxDurationSeconds: 240,
        turboInferenceSteps: 8,
        turboShift: 3.0,
        captionLimit: MAX_CAPTION_CHARS
      });
    }

    if (path === '/api/engine/generate') return generate(request, env);

    const match = path.match(/^\/api\/music\/job\/([^/]+)$/);
    if (match) return job(request, env, decodeURIComponent(match[1]));

    if (path === '/api/modal/audio') return audio(request, env, url);

    return json(request, { error: 'Not found', path }, 404);
  }
};
