const MODAL_DEFAULT_URL = 'https://alo986761986-gif--sonara-acestep-serve-acestep.modal.run';

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'no-store',
      ...extraHeaders
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
  const cfg = modalConfig(env);
  return {
    'Modal-Key': cfg.key,
    'Modal-Secret': cfg.secret,
    ...extra
  };
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Modal returned non-JSON HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
}

async function modalJsonFetch(env, path, init = {}) {
  const cfg = modalConfig(env);
  if (!cfg.key || !cfg.secret) {
    throw new Error('Modal proxy credentials are not configured in Cloudflare Pages.');
  }

  const response = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      ...modalHeaders(env),
      ...(init.headers || {})
    }
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    const detail = data?.detail || data?.error || data?.message || `HTTP ${response.status}`;
    throw new Error(`Modal ${response.status}: ${detail}`);
  }
  return data;
}

function parseModalOutputs(value) {
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

async function handleGenerate(context) {
  if (context.request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const requiredSecret = String(context.env.SONARA_INTERNAL_PROXY_SECRET || '').trim();
  const suppliedSecret = String(context.request.headers.get('X-Sonara-Internal-Secret') || '').trim();
  if (requiredSecret && suppliedSecret !== requiredSecret) {
    return json({ error: 'SONARA generation requires an authorized billing proxy.' }, 401);
  }

  let body = {};
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'Invalid JSON request body.' }, 400);
  }

  const duration = clampNumber(body.durationSec ?? body.duration, 30, 5, 480);
  const bpm = clampNumber(body.bpm, 124, 40, 240);
  const prompt = [body.genre, body.mood, body.key, body.prompt]
    .filter(Boolean)
    .map(v => String(v).trim())
    .filter(Boolean)
    .join(', ');

  try {
    const data = await modalJsonFetch(context.env, '/release_task', {
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
    if (!taskId) {
      return json({ error: 'Modal did not return a task_id.', modal: data }, 502);
    }

    return json({
      jobId: taskId,
      status: 'PROCESSING',
      progress: 10,
      metadata: {
        engine: 'ACE-Step 1.5 / Modal L4',
        currentStage: 'ACE-Step Modal L4: generation started'
      }
    }, 202);
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : String(error),
      message: 'Sonara could not start the Modal ACE-Step generation.'
    }, 502);
  }
}

async function handleJob(context, jobId) {
  if (context.request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const data = await modalJsonFetch(context.env, '/query_result', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task_id_list: [jobId] })
    });

    const item = data?.data?.[0];
    if (!item) {
      return json({
        jobId,
        status: 'PROCESSING',
        progress: 35,
        metadata: {
          engine: 'ACE-Step 1.5 / Modal L4',
          currentStage: 'ACE-Step Modal L4: waiting for GPU result'
        }
      });
    }

    if (Number(item.status) === 2) {
      return json({
        jobId,
        status: 'FAILED',
        progress: 0,
        error: item.error || 'ACE-Step generation failed.',
        metadata: {
          engine: 'ACE-Step 1.5 / Modal L4',
          error: item.error || 'ACE-Step generation failed.'
        }
      });
    }

    if (Number(item.status) !== 1) {
      return json({
        jobId,
        status: 'PROCESSING',
        progress: 65,
        metadata: {
          engine: 'ACE-Step 1.5 / Modal L4',
          currentStage: 'ACE-Step Modal L4: generating audio'
        }
      });
    }

    const outputs = parseModalOutputs(item.result);
    const first = outputs[0] || {};
    const cfg = modalConfig(context.env);
    const sourceUrl = first.url || first.file || '';

    if (!sourceUrl) {
      return json({
        jobId,
        status: 'FAILED',
        error: 'ACE-Step completed without an audio URL.'
      }, 502);
    }

    const parsed = new URL(sourceUrl, cfg.baseUrl);
    const audioPath = parsed.searchParams.get('path');
    if (!audioPath) {
      return json({
        jobId,
        status: 'FAILED',
        error: 'ACE-Step returned an audio URL without a path parameter.'
      }, 502);
    }

    const publicAudioUrl = `/api/modal/audio?path=${encodeURIComponent(audioPath)}`;

    return json({
      jobId,
      status: 'COMPLETED',
      progress: 100,
      audioUrl: publicAudioUrl,
      metadata: {
        engine: 'ACE-Step 1.5 / Modal L4',
        provider: 'Modal',
        model: 'acestep-v15-turbo',
        currentStage: 'Audio ready',
        audioUrl: publicAudioUrl
      }
    });
  } catch (error) {
    return json({
      jobId,
      status: 'FAILED',
      progress: 0,
      error: error instanceof Error ? error.message : String(error),
      metadata: {
        engine: 'ACE-Step 1.5 / Modal L4',
        error: error instanceof Error ? error.message : String(error)
      }
    }, 502);
  }
}

async function handleAudio(context) {
  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const requestUrl = new URL(context.request.url);
  const audioPath = requestUrl.searchParams.get('path');
  if (!audioPath) return json({ error: 'Missing audio path.' }, 400);

  const cfg = modalConfig(context.env);
  if (!cfg.key || !cfg.secret) {
    return json({ error: 'Modal proxy credentials are not configured in Cloudflare Pages.' }, 503);
  }

  const headers = modalHeaders(context.env);
  const range = context.request.headers.get('range');
  if (range) headers.Range = range;

  const modalResponse = await fetch(
    `${cfg.baseUrl}/v1/audio?path=${encodeURIComponent(audioPath)}`,
    { method: context.request.method, headers }
  );

  if (!modalResponse.ok && modalResponse.status !== 206) {
    const text = await modalResponse.text();
    return json({
      error: `Modal audio download failed HTTP ${modalResponse.status}.`,
      message: text.slice(0, 200)
    }, modalResponse.status || 502);
  }

  const outHeaders = new Headers();
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
    const value = modalResponse.headers.get(name);
    if (value) outHeaders.set(name, value);
  }
  outHeaders.set('cache-control', 'private, no-store');

  return new Response(context.request.method === 'HEAD' ? null : modalResponse.body, {
    status: modalResponse.status,
    headers: outHeaders
  });
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname;

  if (path === '/api/health') {
    const cfg = modalConfig(context.env);
    return json({
      status: 'HEALTHY',
      service: 'sonara-production-modal-proxy',
      modalConfigured: Boolean(cfg.key && cfg.secret),
      engine: 'ACE-Step 1.5 / Modal L4'
    });
  }

  if (path === '/api/engine/generate') {
    return handleGenerate(context);
  }

  const jobMatch = path.match(/^\/api\/music\/job\/([^/]+)$/);
  if (jobMatch) {
    return handleJob(context, decodeURIComponent(jobMatch[1]));
  }

  if (path === '/api/modal/audio') {
    return handleAudio(context);
  }

  return json({
    error: 'API route not implemented on production.',
    path
  }, 404);
}
