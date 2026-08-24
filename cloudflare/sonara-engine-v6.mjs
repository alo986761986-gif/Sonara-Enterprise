const ENGINE_DEFAULT_URL = 'https://alo986761986-gif--sonara-acestep-serve-acestep.modal.run';
const PUBLIC_API_ORIGIN = 'https://api.sonaraenterprise.com';
const ALLOWED_ORIGINS = new Set([
  'https://sonaraenterprise.com',
  'https://www.sonaraenterprise.com',
  PUBLIC_API_ORIGIN
]);
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526]);
const JOB_CACHE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/direct-job-v6/';
const JOB_TTL_SECONDS = 3 * 60 * 60;
const MAX_PROMPT_CHARS = 8000;
const MAX_LYRICS_CHARS = 4096;
const GENERATION_STALE_MS = 105000;

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

async function engineJson(env, path, init = {}, timeoutMs = 15000) {
  const cfg = config(env);
  if (!cfg.key || !cfg.secret) {
    throw new SonaraEngineError('SONARA engine credentials are not configured.', 503, false);
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
    throw new SonaraEngineError(
      timeoutLike(error) ? 'SONARA engine is warming up.' : 'SONARA engine network request failed.',
      0,
      true
    );
  }

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

  if (typeof data?.code === 'number' && data.code >= 400) {
    throw new SonaraEngineError(
      String(data?.error || data?.message || 'SONARA request failed.'),
      data.code,
      data.code >= 500 || data.code === 429
    );
  }

  return data;
}

async function modelReady(env) {
  try {
    const data = await engineJson(env, '/v1/models', { method: 'GET' }, 12000);
    const models = data?.data?.models;
    return Array.isArray(models) && models.some(model => Boolean(model?.name));
  } catch (error) {
    if (error instanceof SonaraEngineError && error.retryable) return false;
    return false;
  }
}

async function warmModel(env) {
  try { await modelReady(env); } catch {}
}

function jobCacheUrl(jobId) {
  return `${JOB_CACHE_PREFIX}${encodeURIComponent(jobId)}`;
}

async function storeJob(jobId, context) {
  if (typeof caches === 'undefined' || !caches.default) {
    throw new SonaraEngineError('SONARA job storage is unavailable.', 503, true);
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

async function readJob(jobId) {
  try {
    if (typeof caches === 'undefined' || !caches.default) return null;
    const response = await caches.default.match(new Request(jobCacheUrl(jobId)));
    return response ? await response.json() : null;
  } catch {
    return null;
  }
}

function cleanField(value, maxLength = 120) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function promptContains(prompt, value) {
  return prompt.toLocaleLowerCase('en-US').includes(value.toLocaleLowerCase('en-US'));
}

export function validateGenerationRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new SonaraEngineError('Generation request must be a JSON object.', 400, false);
  }

  const prompt = String(body.prompt ?? '').trim();
  const rawPrompt = cleanField(body.rawPrompt, 1000);
  const genreFamily = cleanField(body.genreFamily);
  const genre = cleanField(body.genre);
  const subgenre = cleanField(body.subgenre);
  const mood = cleanField(body.mood, 80);
  const key = cleanField(body.key || body.key_scale, 40);
  const title = cleanField(body.title, 160);
  const bpm = Math.round(clamp(body.bpm, 124, 40, 220));
  const durationSec = Math.round(clamp(body.durationSec ?? body.duration, 30, 30, 240));
  const lyrics = String(body.lyrics || '').trim().slice(0, MAX_LYRICS_CHARS);
  const errors = [];

  if (!rawPrompt) errors.push('rawPrompt is required');
  if (!genreFamily) errors.push('genreFamily is required');
  if (!genre) errors.push('genre is required');
  if (!subgenre) errors.push('subgenre is required');
  if (!mood) errors.push('mood is required');
  if (!key) errors.push('key is required');
  if (!prompt) errors.push('prompt is required');
  if (prompt.length > MAX_PROMPT_CHARS) errors.push(`prompt exceeds ${MAX_PROMPT_CHARS} characters`);

  for (const [label, value] of [['genreFamily', genreFamily], ['genre', genre], ['subgenre', subgenre], ['mood', mood], ['key', key]]) {
    if (value && prompt && !promptContains(prompt, value)) errors.push(`prompt does not contain selected ${label}: ${value}`);
  }
  if (prompt && !promptContains(prompt, `${bpm} BPM`)) errors.push(`prompt does not contain selected BPM: ${bpm}`);
  if (prompt && !promptContains(prompt, `${durationSec} seconds`)) errors.push(`prompt does not contain selected duration: ${durationSec} seconds`);
  if (!lyrics && prompt && !promptContains(prompt, 'Strictly instrumental')) errors.push('instrumental requests must explicitly forbid vocals');
  if (lyrics && prompt && !prompt.includes(lyrics)) errors.push('prompt does not preserve the supplied lyrics exactly');

  if (errors.length) {
    throw new SonaraEngineError(`Generation quality gate failed: ${errors.join('; ')}.`, 400, false);
  }

  return {
    prompt,
    rawPrompt,
    genreFamily,
    genre,
    subgenre,
    mood,
    key,
    title,
    bpm,
    durationSec,
    lyrics,
    qualityGate: {
      valid: true,
      status: 'PASSED',
      policy: 'deterministic-generation-v1',
      checkedFields: ['rawPrompt', 'genreFamily', 'genre', 'subgenre', 'mood', 'bpm', 'key', 'durationSec', 'lyrics']
    }
  };
}

export function normalizeRequest(body) {
  const spec = validateGenerationRequest(body);
  return {
    payload: {
      // The frontend prompt is authoritative. Do not prepend, concatenate or replace it.
      prompt: spec.prompt,
      lyrics: spec.lyrics,
      vocal_language: String(body.vocalLanguage || body.vocal_language || 'unknown'),
      bpm: spec.bpm,
      key_scale: spec.key,
      time_signature: String(body.timeSignature || body.time_signature || ''),
      audio_duration: spec.durationSec,
      inference_steps: 8,
      thinking: false,
      batch_size: 1,
      use_random_seed: true,
      seed: -1,
      task_type: 'text2music',
      audio_format: 'mp3',
      mp3_bitrate: '192k',
      mp3_sample_rate: 48000
    },
    qualityGate: spec.qualityGate,
    generationSpec: {
      rawPrompt: spec.rawPrompt,
      genreFamily: spec.genreFamily,
      genre: spec.genre,
      subgenre: spec.subgenre,
      mood: spec.mood,
      bpm: spec.bpm,
      key: spec.key,
      durationSec: spec.durationSec,
      hasLyrics: Boolean(spec.lyrics),
      title: spec.title
    }
  };
}

async function releaseTask(env, payload) {
  const data = await engineJson(env, '/release_task', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  }, 110000);

  const taskId = data?.data?.task_id;
  if (!taskId) {
    throw new SonaraEngineError('SONARA did not return a generation task.', 502, false);
  }
  return String(taskId);
}

function parseResultItems(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
    } catch {
      return [];
    }
  }
  return value && typeof value === 'object' ? [value] : [];
}

function audioPathFromItem(item, env) {
  if (!item || typeof item !== 'object') return '';
  const directFile = typeof item.file === 'string' ? item.file : '';
  const sourceUrl = typeof item.url === 'string' ? item.url : '';

  if (sourceUrl) {
    try {
      const parsed = new URL(sourceUrl, config(env).baseUrl);
      const path = parsed.searchParams.get('path');
      if (path) return path;
    } catch {}
  }
  return directFile;
}

async function queryTask(env, taskId) {
  const data = await engineJson(env, '/query_result', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ task_id_list: [taskId] })
  }, 15000);

  const item = data?.data?.[0];
  if (!item || Number(item.status) === 0) return { state: 'processing' };

  if (Number(item.status) !== 1) {
    return { state: 'failed', error: 'SONARA generation did not complete successfully.' };
  }

  const outputs = parseResultItems(item.result);
  const audioPath = audioPathFromItem(outputs[0], env);
  if (!audioPath) {
    return { state: 'failed', error: 'SONARA completed without a valid audio file.' };
  }

  return {
    state: 'completed',
    audioPath,
    audioUrl: `${PUBLIC_API_ORIGIN}/api/modal/audio?path=${encodeURIComponent(audioPath)}`
  };
}

async function generate(request, env, ctx) {
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405);

  let body;
  try { body = await request.json(); }
  catch { return json(request, { error: 'Invalid JSON request body.' }, 400); }

  let normalized;
  try {
    normalized = normalizeRequest(body);
  } catch (error) {
    const status = error instanceof SonaraEngineError && error.status ? error.status : 400;
    return json(request, {
      error: error instanceof Error ? error.message : 'Generation quality gate failed.',
      qualityGate: { valid: false, status: 'REJECTED' }
    }, status);
  }

  const { payload, qualityGate, generationSpec } = normalized;
  const jobId = `d6_${crypto.randomUUID()}`;

  try {
    await storeJob(jobId, {
      phase: 'queued',
      payload,
      qualityGate,
      generationSpec,
      requestedDuration: payload.audio_duration,
      taskId: null,
      generationAttempts: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  } catch (error) {
    return json(request, {
      error: error instanceof Error ? error.message : 'SONARA could not create the generation job.',
      retryable: true
    }, 503);
  }

  if (ctx?.waitUntil) ctx.waitUntil(warmModel(env));

  return json(request, {
    jobId,
    status: 'PROCESSING',
    progress: 5,
    metadata: {
      engine: 'SONARA',
      duration: payload.audio_duration,
      qualityGate,
      generationSpec,
      transport: 'direct production API',
      currentStage: 'SONARA: preparing generation'
    }
  }, 202);
}

async function processJob(request, env, jobId, context) {
  if (context.phase === 'completed' && context.audioUrl) {
    return json(request, {
      jobId,
      status: 'COMPLETED',
      progress: 100,
      audioUrl: context.audioUrl,
      metadata: {
        engine: 'SONARA',
        duration: context.requestedDuration,
        audioUrl: context.audioUrl,
        qualityGate: context.qualityGate,
        generationSpec: context.generationSpec,
        currentStage: 'Audio ready'
      }
    });
  }

  if (context.phase === 'failed') {
    return json(request, {
      jobId,
      status: 'FAILED',
      progress: 0,
      error: context.error || 'SONARA generation failed.'
    });
  }

  if (!context.taskId) {
    const startedAt = Number(context.generationStartedAt || 0);
    if (context.phase === 'generating' && startedAt && Date.now() - startedAt < GENERATION_STALE_MS) {
      return json(request, {
        jobId,
        status: 'PROCESSING',
        progress: 30,
        metadata: { engine: 'SONARA', qualityGate: context.qualityGate, generationSpec: context.generationSpec, currentStage: 'SONARA: generating audio' }
      });
    }

    const ready = await modelReady(env);
    if (!ready) {
      return json(request, {
        jobId,
        status: 'PROCESSING',
        progress: 15,
        metadata: { engine: 'SONARA', qualityGate: context.qualityGate, generationSpec: context.generationSpec, currentStage: 'SONARA: engine warming up' }
      });
    }

    const attempts = Number(context.generationAttempts || 0);
    context = {
      ...context,
      phase: 'generating',
      generationAttempts: attempts + 1,
      generationStartedAt: Date.now(),
      updatedAt: Date.now()
    };
    await storeJob(jobId, context);

    try {
      const taskId = await releaseTask(env, context.payload);
      context = {
        ...context,
        phase: 'submitted',
        taskId,
        updatedAt: Date.now()
      };
      await storeJob(jobId, context);
    } catch (error) {
      const retryable = error instanceof SonaraEngineError && error.retryable;
      if (retryable && Number(context.generationAttempts || 0) < 5) {
        context = {
          ...context,
          phase: 'queued',
          generationStartedAt: 0,
          updatedAt: Date.now()
        };
        await storeJob(jobId, context);
        return json(request, {
          jobId,
          status: 'PROCESSING',
          progress: 20,
          metadata: { engine: 'SONARA', qualityGate: context.qualityGate, generationSpec: context.generationSpec, currentStage: 'SONARA: retrying generation automatically' }
        });
      }

      const message = error instanceof Error ? error.message : 'SONARA generation failed.';
      await storeJob(jobId, { ...context, phase: 'failed', error: message, updatedAt: Date.now() });
      return json(request, { jobId, status: 'FAILED', progress: 0, error: message }, 502);
    }
  }

  try {
    const result = await queryTask(env, String(context.taskId));
    if (result.state === 'processing') {
      return json(request, {
        jobId,
        status: 'PROCESSING',
        progress: 90,
        metadata: { engine: 'SONARA', qualityGate: context.qualityGate, generationSpec: context.generationSpec, currentStage: 'SONARA: finalizing audio' }
      });
    }

    if (result.state === 'failed') {
      await storeJob(jobId, { ...context, phase: 'failed', error: result.error, updatedAt: Date.now() });
      return json(request, { jobId, status: 'FAILED', progress: 0, error: result.error }, 502);
    }

    const completed = {
      ...context,
      phase: 'completed',
      audioPath: result.audioPath,
      audioUrl: result.audioUrl,
      updatedAt: Date.now()
    };
    await storeJob(jobId, completed);

    return json(request, {
      jobId,
      status: 'COMPLETED',
      progress: 100,
      audioUrl: result.audioUrl,
      metadata: {
        engine: 'SONARA',
        duration: context.requestedDuration,
        audioUrl: result.audioUrl,
        qualityGate: context.qualityGate,
        generationSpec: context.generationSpec,
        currentStage: 'Audio ready'
      }
    });
  } catch (error) {
    if (error instanceof SonaraEngineError && error.retryable) {
      return json(request, {
        jobId,
        status: 'PROCESSING',
        progress: 90,
        metadata: { engine: 'SONARA', qualityGate: context.qualityGate, generationSpec: context.generationSpec, currentStage: 'SONARA: finalizing audio' }
      });
    }
    const message = error instanceof Error ? error.message : 'SONARA generation failed.';
    return json(request, { jobId, status: 'FAILED', progress: 0, error: message }, 502);
  }
}

async function job(request, env, jobId) {
  if (request.method !== 'GET') return json(request, { error: 'Method not allowed' }, 405);
  if (!jobId.startsWith('d6_')) {
    return json(request, {
      jobId,
      status: 'FAILED',
      progress: 0,
      error: 'SONARA generation session belongs to an older engine version. Please generate the track again.'
    }, 410);
  }

  const context = await readJob(jobId);
  if (!context) {
    return json(request, {
      jobId,
      status: 'FAILED',
      progress: 0,
      error: 'SONARA generation session expired. Please generate the track again.'
    }, 410);
  }

  return processJob(request, env, jobId, context);
}

async function audio(request, env, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json(request, { error: 'Method not allowed' }, 405);
  }

  const audioPath = url.searchParams.get('path');
  if (!audioPath) return json(request, { error: 'Missing audio path.' }, 400);

  const cfg = config(env);
  if (!cfg.key || !cfg.secret) {
    return json(request, { error: 'SONARA engine credentials are not configured.' }, 503);
  }

  const headers = authHeaders(env);
  const range = request.headers.get('range');
  if (range) headers.Range = range;

  const response = await fetch(`${cfg.baseUrl}/v1/audio?path=${encodeURIComponent(audioPath)}`, {
    method: request.method,
    headers
  });

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

  return new Response(request.method === 'HEAD' ? null : response.body, {
    status: response.status,
    headers: out
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/' || path === '/api/health') {
      if (ctx?.waitUntil) ctx.waitUntil(warmModel(env));
      const cfg = config(env);
      return json(request, {
        status: 'HEALTHY',
        service: 'sonara-production-engine-v6',
        engineConfigured: Boolean(cfg.key && cfg.secret),
        engine: 'SONARA',
        transport: 'direct production API',
        resilience: 'direct-release-task-v7',
        minDurationSeconds: 30,
        maxDurationSeconds: 240,
        segmentation: false
      });
    }

    if (path === '/api/engine/generate') return generate(request, env, ctx);

    const match = path.match(/^\/api\/music\/job\/([^/]+)$/);
    if (match) return job(request, env, decodeURIComponent(match[1]));

    if (path === '/api/modal/audio') return audio(request, env, url);

    return json(request, { error: 'Not found', path }, 404);
  }
};
