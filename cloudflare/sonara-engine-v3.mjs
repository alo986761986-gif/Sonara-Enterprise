const ENGINE_DEFAULT_URL = 'https://alo986761986-gif--sonara-acestep-serve-acestep.modal.run';
const PUBLIC_API_ORIGIN = 'https://api.sonaraenterprise.com';
const ALLOWED_ORIGINS = new Set([
  'https://sonaraenterprise.com',
  'https://www.sonaraenterprise.com',
  PUBLIC_API_ORIGIN
]);
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526]);
const SPEC_CACHE_URL = 'https://sonaraenterprise.com/__sonara_internal/generation-spec-v4';
const JOB_CACHE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/job-v4/';
const SPEC_TTL_MS = 30 * 60 * 1000;
const JOB_TTL_SECONDS = 2 * 60 * 60;
const LONG_FORM_THRESHOLD = 180;
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

function setValue(parameters, data, label, value) {
  const index = parameters.findIndex(parameter => String(parameter?.label || '') === label);
  if (index >= 0) data[index] = value;
}

function splitLyrics(lyrics, partIndex, totalParts) {
  const text = String(lyrics || '').trim();
  if (!text || totalParts <= 1) return text;
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return partIndex === 0 ? text : '';
  const chunk = Math.ceil(lines.length / totalParts);
  return lines.slice(partIndex * chunk, (partIndex + 1) * chunk).join('\n');
}

function longFormDirection(partIndex, totalParts) {
  if (totalParts <= 1) return '';
  if (partIndex === 0) {
    return 'long-form opening section, establish the groove and musical identity, coherent intro and development, avoid an abrupt ending';
  }
  if (partIndex === totalParts - 1) {
    return 'long-form continuation section, preserve the same musical identity, groove, instrumentation and harmonic mood, develop toward a satisfying climax and outro';
  }
  return 'long-form continuation section, preserve the same musical identity, groove, instrumentation and harmonic mood';
}

function buildGenerationData(spec, body, duration, options = {}) {
  const parameters = spec.parameters || [];
  const data = parameters.map(parameter => parameter?.parameter_has_default ? parameter.parameter_default : null);
  const bpm = clamp(body.bpm, 124, 40, 240);
  const partIndex = Number(options.partIndex || 0);
  const totalParts = Number(options.totalParts || 1);
  const safeMode = Boolean(options.safeMode);
  const direction = longFormDirection(partIndex, totalParts);
  const caption = [body.genre, body.mood, body.key, body.prompt, direction]
    .filter(Boolean)
    .map(value => String(value).trim())
    .filter(Boolean)
    .join(', ') || 'Professional electronic music production';

  setValue(parameters, data, 'Music Caption', caption);
  setValue(parameters, data, 'Lyrics', splitLyrics(body.lyrics, partIndex, totalParts));
  setValue(parameters, data, 'BPM (Beats Per Minute)', bpm);
  setValue(parameters, data, 'Key', body.key || '');
  setValue(parameters, data, 'Time Signature', body.timeSignature || '');
  setValue(parameters, data, 'Vocal Language', body.vocalLanguage || 'unknown');
  setValue(parameters, data, 'DiT Inference Steps', safeMode ? 4 : 6);
  setValue(parameters, data, 'Random Seed', true);
  setValue(parameters, data, 'Seed', '-1');
  setValue(parameters, data, 'Audio Duration (seconds)', duration);
  setValue(parameters, data, 'Batch Size', 1);
  setValue(parameters, data, 'Audio Format', 'mp3');
  setValue(parameters, data, 'MP3 Bitrate', '192k');
  setValue(parameters, data, 'MP3 Sample Rate', 48000);
  setValue(parameters, data, 'Think', totalParts > 1 ? false : !safeMode);
  setValue(parameters, data, 'ParallelThinking', false);
  setValue(parameters, data, 'Auto Score', false);
  setValue(parameters, data, 'Auto LRC', false);
  setValue(parameters, data, 'AutoGen', false);

  return data;
}

function makePartDurations(duration) {
  if (duration < LONG_FORM_THRESHOLD) return [duration];
  const first = Math.floor(duration / 2);
  return [first, duration - first];
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

  const duration = clamp(body.durationSec ?? body.duration, 30, 30, 240);

  try {
    const spec = await loadGenerationSpec(env);
    const partDurations = makePartDurations(duration);
    const totalParts = partDurations.length;
    const partData = partDurations.map((partDuration, partIndex) => buildGenerationData(spec, body, partDuration, {
      partIndex,
      totalParts,
      safeMode: totalParts > 1
    }));
    const eventId = await submitGeneration(env, partData[0]);
    const jobId = `v3_${crypto.randomUUID()}`;

    await storeJobContext(jobId, {
      eventId,
      requestedDuration: duration,
      partDurations,
      partData,
      currentPart: 0,
      sources: [],
      retries: partDurations.map(() => 0),
      createdAt: Date.now()
    });

    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: 10,
      metadata: {
        engine: 'SONARA',
        longForm: totalParts > 1,
        totalParts,
        currentStage: totalParts > 1 ? 'SONARA: long-form generation queued' : 'SONARA: generation queued'
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
      throw new SonaraEngineError(
        `SONARA result HTTP ${response.status}: ${text.slice(0, 180)}`,
        response.status,
        RETRYABLE_STATUSES.has(response.status)
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

function publicSingleAudioUrl(source) {
  return source ? `${PUBLIC_API_ORIGIN}/api/modal/audio?source=${encodeURIComponent(source)}` : '';
}

function publicMergedAudioUrl(sources) {
  if (!Array.isArray(sources) || sources.length < 2) return publicSingleAudioUrl(sources?.[0] || '');
  const query = sources.map(source => `part=${encodeURIComponent(source)}`).join('&');
  return `${PUBLIC_API_ORIGIN}/api/modal/audio?${query}`;
}

async function retryCurrentPart(env, jobId, context) {
  const currentPart = Number(context.currentPart || 0);
  const retries = Array.isArray(context.retries) ? [...context.retries] : [];
  if (Number(retries[currentPart] || 0) >= 1) return false;

  const spec = await loadGenerationSpec(env);
  const parameters = spec.parameters || [];
  const data = Array.isArray(context.partData?.[currentPart]) ? [...context.partData[currentPart]] : null;
  if (!data) return false;

  setValue(parameters, data, 'DiT Inference Steps', 4);
  setValue(parameters, data, 'Think', false);
  setValue(parameters, data, 'ParallelThinking', false);
  setValue(parameters, data, 'Batch Size', 1);
  setValue(parameters, data, 'Auto Score', false);
  setValue(parameters, data, 'Auto LRC', false);
  setValue(parameters, data, 'AutoGen', false);

  const eventId = await submitGeneration(env, data);
  retries[currentPart] = Number(retries[currentPart] || 0) + 1;
  const partData = [...context.partData];
  partData[currentPart] = data;

  await storeJobContext(jobId, {
    ...context,
    eventId,
    retries,
    partData,
    retriedAt: Date.now()
  });
  return true;
}

async function advanceLongForm(env, request, jobId, context, source) {
  const currentPart = Number(context.currentPart || 0);
  const sources = [...(Array.isArray(context.sources) ? context.sources : []), source];
  const nextPart = currentPart + 1;
  const totalParts = Array.isArray(context.partDurations) ? context.partDurations.length : 1;

  if (nextPart >= totalParts) {
    const audioUrl = publicMergedAudioUrl(sources);
    return json(request, {
      jobId,
      status: 'COMPLETED',
      progress: 100,
      audioUrl,
      metadata: {
        engine: 'SONARA',
        longForm: totalParts > 1,
        totalParts,
        audioUrl,
        currentStage: 'Audio ready'
      }
    });
  }

  const nextData = context.partData?.[nextPart];
  if (!Array.isArray(nextData)) {
    return json(request, { jobId, status: 'FAILED', progress: 0, error: 'SONARA long-form continuation data is unavailable.' }, 502);
  }

  const eventId = await submitGeneration(env, nextData);
  await storeJobContext(jobId, {
    ...context,
    eventId,
    currentPart: nextPart,
    sources,
    partStartedAt: Date.now()
  });

  return json(request, {
    jobId,
    status: 'PROCESSING',
    progress: Math.round((nextPart / totalParts) * 80) + 10,
    metadata: {
      engine: 'SONARA',
      longForm: true,
      totalParts,
      currentPart: nextPart + 1,
      currentStage: `SONARA: generating section ${nextPart + 1} of ${totalParts}`
    }
  });
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
    const source = descriptorToSource(env, descriptor);
    const audioUrl = publicSingleAudioUrl(source);
    if (!audioUrl) return json(request, { jobId, status: 'FAILED', progress: 0, error: 'SONARA completed without an audio file.' }, 502);

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

  if (!jobId.startsWith('v3_')) {
    if (jobId.startsWith('g_')) {
      const result = await readGenerationEvent(env, jobId.slice(2));
      if (result.state === 'processing') return json(request, { jobId, status: 'PROCESSING', progress: 65, metadata: { engine: 'SONARA' } });
      if (result.state === 'error') return json(request, { jobId, status: 'FAILED', progress: 0, error: result.error || 'SONARA generation failed.' });
      const descriptor = findAudioDescriptor(result.data);
      const source = descriptorToSource(env, descriptor);
      const audioUrl = publicSingleAudioUrl(source);
      if (!audioUrl) return json(request, { jobId, status: 'FAILED', progress: 0, error: 'SONARA completed without an audio file.' }, 502);
      return json(request, { jobId, status: 'COMPLETED', progress: 100, audioUrl, metadata: { engine: 'SONARA', audioUrl } });
    }
    if (jobId.startsWith('s_')) {
      return json(request, { jobId, status: 'FAILED', progress: 0, error: 'SONARA generation session expired after an engine upgrade. Please generate again.' }, 410);
    }
    return legacyJob(request, env, jobId);
  }

  const context = await readJobContext(jobId);
  if (!context?.eventId) {
    return json(request, { jobId, status: 'FAILED', progress: 0, error: 'SONARA generation session expired. Please generate the track again.' }, 410);
  }

  try {
    const result = await readGenerationEvent(env, String(context.eventId));
    const currentPart = Number(context.currentPart || 0);
    const totalParts = Array.isArray(context.partDurations) ? context.partDurations.length : 1;

    if (result.state === 'processing') {
      const base = totalParts > 1 ? 10 + Math.round((currentPart / totalParts) * 80) : 65;
      return json(request, {
        jobId,
        status: 'PROCESSING',
        progress: Math.min(90, base),
        metadata: {
          engine: 'SONARA',
          longForm: totalParts > 1,
          totalParts,
          currentPart: currentPart + 1,
          currentStage: totalParts > 1 ? `SONARA: generating section ${currentPart + 1} of ${totalParts}` : 'SONARA: generating audio'
        }
      });
    }

    if (result.state === 'error') {
      if (await retryCurrentPart(env, jobId, context)) {
        return json(request, {
          jobId,
          status: 'PROCESSING',
          progress: 30,
          metadata: { engine: 'SONARA', currentStage: 'SONARA: automatic recovery in progress' }
        });
      }
      return json(request, {
        jobId,
        status: 'FAILED',
        progress: 0,
        error: result.error || 'SONARA could not complete this section. Please try again.'
      });
    }

    const descriptor = findAudioDescriptor(result.data);
    const source = descriptorToSource(env, descriptor);
    if (!source) {
      if (await retryCurrentPart(env, jobId, context)) {
        return json(request, {
          jobId,
          status: 'PROCESSING',
          progress: 30,
          metadata: { engine: 'SONARA', currentStage: 'SONARA: automatic recovery in progress' }
        });
      }
      return json(request, { jobId, status: 'FAILED', progress: 0, error: 'SONARA completed without a valid audio file.' }, 502);
    }

    if (totalParts > 1) return advanceLongForm(env, request, jobId, context, source);

    const audioUrl = publicSingleAudioUrl(source);
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

function validSource(source) {
  return /^\/gradio_api\/(?:file=|stream\/)/.test(source) || /^\/file=/.test(source) || /^\/v1\/audio\?/.test(source);
}

async function fetchAudioPart(env, source, method = 'GET') {
  if (!validSource(source)) throw new SonaraEngineError('Invalid SONARA audio source.', 400, false);
  const cfg = config(env);
  return fetch(`${cfg.baseUrl}${source}`, {
    method,
    headers: authHeaders(env)
  });
}

async function streamMergedAudio(request, env, parts) {
  if (request.method === 'HEAD') {
    return new Response(null, {
      status: 200,
      headers: {
        'content-type': 'audio/mpeg',
        'cache-control': 'private, no-store',
        ...corsHeaders(request)
      }
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for (const source of parts) {
          const response = await fetchAudioPart(env, source, 'GET');
          if (!response.ok || !response.body) throw new Error(`audio section HTTP ${response.status}`);
          const reader = response.body.getReader();
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) controller.enqueue(value);
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    }
  });

  const headers = new Headers({
    'content-type': 'audio/mpeg',
    'cache-control': 'private, no-store',
    'content-disposition': 'inline; filename="sonara-long-form.mp3"'
  });
  for (const [name, value] of Object.entries(corsHeaders(request))) headers.set(name, value);
  return new Response(stream, { status: 200, headers });
}

async function audio(request, env, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return json(request, { error: 'Method not allowed' }, 405);

  const cfg = config(env);
  if (!cfg.key || !cfg.secret) return json(request, { error: 'SONARA engine credentials are not configured.' }, 503);

  const parts = url.searchParams.getAll('part').filter(Boolean);
  if (parts.length > 1) return streamMergedAudio(request, env, parts);

  const source = parts[0] || url.searchParams.get('source');
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
        service: 'sonara-production-engine-v3',
        engineConfigured: Boolean(cfg.key && cfg.secret),
        engine: 'SONARA',
        transport: 'async queue',
        resilience: 'long-form-split-recovery-v4',
        maxDurationSeconds: 240,
        longFormThresholdSeconds: LONG_FORM_THRESHOLD
      });
    }

    if (path === '/api/engine/generate') return generate(request, env);

    const match = path.match(/^\/api\/music\/job\/([^/]+)$/);
    if (match) return job(request, env, decodeURIComponent(match[1]));

    if (path === '/api/modal/audio') return audio(request, env, url);

    return json(request, { error: 'Not found', path }, 404);
  }
};