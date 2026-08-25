import baseEngine from './sonara-engine-v6-final.mjs';

const PUBLIC_API_ORIGIN = 'https://api.sonaraenterprise.com';
const JOB_PATH = /^\/api\/music\/job\/(d9pair_[^/]+)$/;
const JOB_CACHE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/dual-fast-v9/';
const JOB_TTL_SECONDS = 3 * 60 * 60;
const FAST_MODEL = 'acestep-v15-xl-turbo';
const FAST_STEPS = 6;
const BATCH_SIZE = 2;
const SUBMIT_TIMEOUT_MS = 70_000;
const QUERY_TIMEOUT_MS = 12_000;

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = new Set([
    'https://sonaraenterprise.com',
    'https://www.sonaraenterprise.com',
    PUBLIC_API_ORIGIN
  ]);
  return {
    'Access-Control-Allow-Origin': allowed.has(origin) ? origin : 'https://sonaraenterprise.com',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,Range,X-Sonara-Internal-Secret,X-Sonara-Job-Bridge',
    'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges,X-Sonara-Performance-Profile',
    Vary: 'Origin'
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'private, no-store',
      'x-sonara-performance-profile': 'dual-ultra-fast-v9',
      ...corsHeaders(request)
    }
  });
}

function config(env) {
  return {
    baseUrl: String(env.ACESTEP_API_URL || 'https://alo986761986-gif--sonara-acestep-serve-acestep.modal.run').replace(/\/$/, ''),
    key: String(env.MODAL_PROXY_KEY || '').trim(),
    secret: String(env.MODAL_PROXY_SECRET || '').trim()
  };
}

function authHeaders(env, extra = {}) {
  const cfg = config(env);
  return { 'Modal-Key': cfg.key, 'Modal-Secret': cfg.secret, ...extra };
}

function internalGenerationAuthorized(request, env) {
  const required = String(env.SONARA_INTERNAL_PROXY_SECRET || '').trim();
  return !required || String(request.headers.get('X-Sonara-Internal-Secret') || '').trim() === required;
}

async function engineJson(env, path, init = {}, timeoutMs = QUERY_TIMEOUT_MS) {
  const cfg = config(env);
  if (!cfg.key || !cfg.secret) throw new Error('SONARA engine credentials are not configured.');
  const response = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: { ...authHeaders(env), ...(init.headers || {}) },
    signal: AbortSignal.timeout(timeoutMs)
  });
  const raw = await response.text();
  let payload = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { throw new Error(`SONARA engine returned invalid JSON (HTTP ${response.status}).`); }
  if (!response.ok) throw new Error(String(payload?.detail || payload?.error || payload?.message || `SONARA HTTP ${response.status}`));
  if (typeof payload?.code === 'number' && payload.code >= 400) throw new Error(String(payload?.error || payload?.message || 'SONARA engine request failed.'));
  return payload;
}

function cacheUrl(jobId) {
  return `${JOB_CACHE_PREFIX}${encodeURIComponent(jobId)}`;
}

async function storeJob(jobId, context) {
  if (typeof caches === 'undefined' || !caches.default) throw new Error('SONARA dual job storage is unavailable.');
  await caches.default.put(
    new Request(cacheUrl(jobId)),
    new Response(JSON.stringify(context), {
      headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': `public, max-age=${JOB_TTL_SECONDS}` }
    })
  );
}

async function readJob(jobId) {
  try {
    if (typeof caches === 'undefined' || !caches.default) return null;
    const response = await caches.default.match(new Request(cacheUrl(jobId)));
    return response ? await response.json() : null;
  } catch {
    return null;
  }
}

function clamp(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function inferTimeSignature(body) {
  const explicit = String(body.timeSignature || body.time_signature || '').trim();
  if (/^(2|3|4|6)(?:\/(?:4|8))?$/.test(explicit)) return explicit.split('/')[0];
  const style = `${body.genre || ''} ${body.subgenre || ''}`.toLowerCase();
  if (/\b(waltz|mazurka|vals|minuet)\b/.test(style)) return '3';
  if (/\b(jig|tarantella|6\/8)\b/.test(style)) return '6';
  if (/\b(polka|2\/4|two[- ]?step)\b/.test(style)) return '2';
  return '4';
}

function parseItems(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
    } catch { return []; }
  }
  return value && typeof value === 'object' ? [value] : [];
}

function audioPathFromItem(item, env) {
  if (!item || typeof item !== 'object') return '';
  for (const source of [item.url, item.file]) {
    if (typeof source !== 'string' || !source) continue;
    try {
      const parsed = new URL(source, config(env).baseUrl);
      const path = parsed.searchParams.get('path');
      if (path) return path;
    } catch {}
    if (!source.includes('?path=')) return source;
  }
  return '';
}

function buildPayload(body, env) {
  const durationSec = Math.round(clamp(body.durationSec ?? body.duration, 30, 30, 240));
  const bpm = Math.round(clamp(body.bpm, 124, 40, 220));
  const prompt = String(body.prompt || '').trim();
  if (!prompt) throw new Error('Prompt richiesto.');
  return {
    prompt,
    lyrics: String(body.lyrics || '').trim(),
    vocal_language: String(body.vocalLanguage || body.vocal_language || 'unknown'),
    bpm,
    key_scale: String(body.key || body.key_scale || 'C Major').trim(),
    time_signature: inferTimeSignature(body),
    audio_duration: durationSec,
    use_random_seed: true,
    seed: -1,
    task_type: 'text2music',
    model: String(env.SONARA_FAST_MODEL || FAST_MODEL).trim(),
    inference_steps: FAST_STEPS,
    thinking: false,
    use_format: false,
    use_cot_caption: false,
    use_cot_language: false,
    constrained_decoding: true,
    allow_lm_batch: true,
    lm_temperature: 0.82,
    lm_cfg_scale: 2.4,
    lm_top_p: 0.92,
    lm_repetition_penalty: 1.03,
    batch_size: BATCH_SIZE,
    infer_method: 'ode',
    audio_format: 'wav',
    mp3_bitrate: '320k',
    mp3_sample_rate: 48000
  };
}

async function submitTask(env, payload) {
  const data = await engineJson(env, '/release_task', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  }, SUBMIT_TIMEOUT_MS);
  const taskId = data?.data?.task_id;
  if (!taskId) throw new Error('SONARA did not return a dual generation task.');
  return String(taskId);
}

async function startDualGeneration(request, env, body) {
  let payload;
  try { payload = buildPayload(body, env); }
  catch (error) { return json(request, { error: error instanceof Error ? error.message : String(error) }, 400); }

  const jobId = `d9pair_${crypto.randomUUID()}`;
  const context = {
    phase: 'queued',
    payload,
    taskId: null,
    generationPairId: String(body.generationPairId || jobId),
    title: String(body.title || 'SONARA Track'),
    genre: String(body.genre || ''),
    subgenre: String(body.subgenre || ''),
    durationSec: Number(body.durationSec ?? body.duration ?? 30),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await storeJob(jobId, context);

  try {
    const taskId = await submitTask(env, payload);
    await storeJob(jobId, { ...context, phase: 'submitted', taskId, updatedAt: Date.now() });
    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: 30,
      metadata: {
        engine: 'SONARA',
        performanceProfile: 'dual-ultra-fast-v9',
        model: payload.model,
        candidateCount: BATCH_SIZE,
        inferenceSteps: FAST_STEPS,
        currentStage: 'SONARA: 2 brani in un solo batch GPU'
      }
    }, 202);
  } catch (error) {
    await storeJob(jobId, { ...context, phase: 'queued', lastSubmitError: error instanceof Error ? error.message : String(error), updatedAt: Date.now() });
    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: 10,
      metadata: { engine: 'SONARA', performanceProfile: 'dual-ultra-fast-v9', currentStage: 'SONARA: avvio immediato del batch doppio' }
    }, 202);
  }
}

async function pollDualJob(request, env, jobId) {
  let context = await readJob(jobId);
  if (!context) return json(request, { jobId, status: 'FAILED', progress: 0, error: 'SONARA dual generation session expired.' }, 410);

  if (context.phase === 'completed' && Array.isArray(context.audioUrls)) {
    return json(request, {
      jobId,
      status: 'COMPLETED',
      progress: 100,
      audioUrl: context.audioUrls[0] || null,
      audioUrls: context.audioUrls,
      candidates: context.audioUrls.map((audioUrl, index) => ({ id: index === 0 ? 'A' : 'B', audioUrl, audioFormat: 'wav' })),
      metadata: {
        engine: 'SONARA',
        performanceProfile: 'dual-ultra-fast-v9',
        model: context.payload?.model || FAST_MODEL,
        candidateCount: context.audioUrls.length,
        audioUrls: context.audioUrls,
        audioFormat: 'wav',
        currentStage: '2 brani pronti'
      }
    });
  }

  if (context.phase === 'failed') return json(request, { jobId, status: 'FAILED', progress: 0, error: context.error || 'SONARA dual generation failed.' });

  if (!context.taskId) {
    try {
      const taskId = await submitTask(env, context.payload);
      context = { ...context, phase: 'submitted', taskId, updatedAt: Date.now() };
      await storeJob(jobId, context);
    } catch (error) {
      return json(request, {
        jobId,
        status: 'PROCESSING',
        progress: 12,
        metadata: { engine: 'SONARA', performanceProfile: 'dual-ultra-fast-v9', currentStage: 'SONARA: motore in avvio, batch doppio in coda' }
      });
    }
  }

  try {
    const data = await engineJson(env, '/query_result', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task_id_list: [context.taskId] })
    }, QUERY_TIMEOUT_MS);
    const task = data?.data?.[0];
    if (!task || Number(task.status) === 0) {
      return json(request, {
        jobId,
        status: 'PROCESSING',
        progress: 78,
        metadata: { engine: 'SONARA', performanceProfile: 'dual-ultra-fast-v9', model: context.payload?.model || FAST_MODEL, candidateCount: 2, currentStage: 'SONARA: rendering A + B insieme' }
      });
    }
    if (Number(task.status) !== 1) {
      const failed = { ...context, phase: 'failed', error: 'SONARA dual batch did not complete successfully.', updatedAt: Date.now() };
      await storeJob(jobId, failed);
      return json(request, { jobId, status: 'FAILED', progress: 0, error: failed.error });
    }

    const items = parseItems(task.result);
    const paths = items.map(item => audioPathFromItem(item, env)).filter(Boolean).slice(0, 2);
    if (paths.length < 2) {
      const failed = { ...context, phase: 'failed', error: `SONARA dual batch returned ${paths.length} audio file(s) instead of 2.`, updatedAt: Date.now() };
      await storeJob(jobId, failed);
      return json(request, { jobId, status: 'FAILED', progress: 0, error: failed.error });
    }

    const audioUrls = paths.map(path => `${PUBLIC_API_ORIGIN}/api/modal/audio?path=${encodeURIComponent(path)}`);
    context = { ...context, phase: 'completed', audioPaths: paths, audioUrls, updatedAt: Date.now() };
    await storeJob(jobId, context);
    return json(request, {
      jobId,
      status: 'COMPLETED',
      progress: 100,
      audioUrl: audioUrls[0],
      audioUrls,
      candidates: audioUrls.map((audioUrl, index) => ({ id: index === 0 ? 'A' : 'B', audioUrl, audioFormat: 'wav' })),
      metadata: {
        engine: 'SONARA',
        performanceProfile: 'dual-ultra-fast-v9',
        model: context.payload?.model || FAST_MODEL,
        candidateCount: 2,
        audioUrls,
        audioFormat: 'wav',
        currentStage: '2 brani pronti'
      }
    });
  } catch (error) {
    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: 82,
      metadata: { engine: 'SONARA', performanceProfile: 'dual-ultra-fast-v9', currentStage: 'SONARA: finalizzazione rapidissima dei 2 brani' }
    });
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
    const url = new URL(request.url);
    const jobMatch = url.pathname.match(JOB_PATH);

    if (jobMatch && request.method === 'GET') {
      return pollDualJob(request, env, decodeURIComponent(jobMatch[1]));
    }

    if (url.pathname === '/api/engine/generate' && request.method === 'POST') {
      if (!internalGenerationAuthorized(request, env)) return json(request, { error: 'Unauthorized SONARA generation proxy.' }, 401);
      let body;
      try { body = await request.clone().json(); }
      catch { return json(request, { error: 'Invalid JSON request body.' }, 400); }
      if (body?.dualFast === true && Number(body?.candidateCount || 0) === 2) {
        return startDualGeneration(request, env, body);
      }
    }

    const response = await baseEngine.fetch(request, env, ctx);
    if ((url.pathname === '/' || url.pathname === '/api/health') && response.ok) {
      try {
        const data = await response.clone().json();
        return json(request, {
          ...data,
          dualFast: true,
          dualFastProfile: 'single-job-native-batch-v9',
          dualFastModel: FAST_MODEL,
          dualFastInferenceSteps: FAST_STEPS,
          dualFastCandidateCount: BATCH_SIZE,
          dualFastAutoRegeneration: false
        }, response.status);
      } catch {}
    }
    return response;
  }
};
