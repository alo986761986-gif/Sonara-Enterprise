import productionV5 from './sonara-engine-v5.mjs';

const ENGINE_DEFAULT_URL = 'https://alo986761986-gif--sonara-acestep-serve-acestep.modal.run';
const ALLOWED_ORIGINS = new Set([
  'https://sonaraenterprise.com',
  'https://www.sonaraenterprise.com',
  'https://api.sonaraenterprise.com'
]);

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://sonaraenterprise.com',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Range',
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
  return { 'Modal-Key': cfg.key, 'Modal-Secret': cfg.secret, ...extra };
}

async function upstreamJson(env, path, init = {}) {
  const cfg = config(env);
  const response = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: { ...authHeaders(env), ...(init.headers || {}) },
    signal: AbortSignal.timeout(20000)
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; }
  catch { return { ok: false, status: response.status, error: `non-json: ${text.slice(0, 240)}` }; }
  if (!response.ok) return { ok: false, status: response.status, error: data?.detail || data?.error || data?.message || 'upstream request failed' };
  return { ok: true, status: response.status, data };
}

function setExact(parameters, data, label, value) {
  const index = parameters.findIndex(parameter => String(parameter?.label || '') === label);
  if (index >= 0) data[index] = value;
}

async function startSmoke(request, env) {
  const infoResult = await upstreamJson(env, '/gradio_api/info', { method: 'GET' });
  if (!infoResult.ok) return json(request, { status: 'FAILED', stage: 'info', ...infoResult }, 502);
  const spec = infoResult.data?.named_endpoints?.['/generation_wrapper'];
  if (!spec || !Array.isArray(spec.parameters)) return json(request, { status: 'FAILED', stage: 'spec', error: 'generation_wrapper unavailable' }, 502);

  const parameters = spec.parameters;
  const data = parameters.map(parameter => parameter?.parameter_has_default ? parameter.parameter_default : null);

  // Exact known-good profile from the Sonara build that already generated music successfully.
  setExact(parameters, data, 'Music Caption', 'House, Deep, A minor, deep dark hypnotic house, warm rolling bassline, punchy kick, atmospheric pads, underground club mood');
  setExact(parameters, data, 'Lyrics', '');
  setExact(parameters, data, 'BPM (Beats Per Minute)', 124);
  setExact(parameters, data, 'Key', 'A minor');
  setExact(parameters, data, 'Time Signature', '');
  setExact(parameters, data, 'Vocal Language', 'unknown');
  setExact(parameters, data, 'DiT Inference Steps', 8);
  setExact(parameters, data, 'Random Seed', true);
  setExact(parameters, data, 'Seed', '-1');
  setExact(parameters, data, 'Audio Duration (seconds)', 30);
  setExact(parameters, data, 'Batch Size', 1);
  setExact(parameters, data, 'Audio Format', 'mp3');
  setExact(parameters, data, 'MP3 Bitrate', '192k');
  setExact(parameters, data, 'MP3 Sample Rate', 48000);
  setExact(parameters, data, 'Think', true);
  setExact(parameters, data, 'Auto Score', false);
  setExact(parameters, data, 'Auto LRC', false);
  setExact(parameters, data, 'AutoGen', false);

  const submit = await upstreamJson(env, '/gradio_api/call/generation_wrapper', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data })
  });
  if (!submit.ok) return json(request, { status: 'FAILED', stage: 'submit', ...submit }, 502);
  const eventId = submit.data?.event_id;
  if (!eventId) return json(request, { status: 'FAILED', stage: 'submit', error: 'No event_id' }, 502);
  return json(request, { status: 'PROCESSING', eventId: String(eventId), profile: 'known-good-30s' });
}

function parseBlock(block) {
  const lines = block.split(/\r?\n/);
  const eventLine = lines.find(line => line.startsWith('event:'));
  if (!eventLine) return null;
  return {
    event: eventLine.slice(6).trim(),
    data: lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
  };
}

function findAudio(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) { const found = findAudio(item); if (found) return found; }
    return null;
  }
  if (typeof value !== 'object') return null;
  const url = typeof value.url === 'string' ? value.url : '';
  const path = typeof value.path === 'string' ? value.path : '';
  const mime = String(value.mime_type || value.mimeType || '');
  const name = String(value.orig_name || value.name || '');
  if (mime.startsWith('audio/') || /\.(mp3|wav|flac|ogg|opus|aac)(?:$|\?)/i.test(url) || /\.(mp3|wav|flac|ogg|opus|aac)$/i.test(path) || /\.(mp3|wav|flac|ogg|opus|aac)$/i.test(name)) return { url, path };
  for (const nested of Object.values(value)) { const found = findAudio(nested); if (found) return found; }
  return null;
}

async function smokeResult(request, env, url) {
  const eventId = String(url.searchParams.get('event') || '').trim();
  if (!eventId) return json(request, { status: 'FAILED', error: 'Missing event' }, 400);
  const cfg = config(env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${cfg.baseUrl}/gradio_api/call/generation_wrapper/${encodeURIComponent(eventId)}`, {
      method: 'GET',
      headers: authHeaders(env),
      signal: controller.signal
    });
    if (!response.ok) return json(request, { status: 'FAILED', stage: 'result-http', http: response.status, body: (await response.text()).slice(0, 240) }, 502);
    if (!response.body) return json(request, { status: 'PROCESSING', detail: 'no body yet' });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || '';
      for (const block of blocks) {
        const event = parseBlock(block);
        if (!event) continue;
        if (event.event === 'complete') {
          let parsed = null;
          try { parsed = JSON.parse(event.data || 'null'); } catch {}
          const audio = findAudio(parsed);
          try { await reader.cancel(); } catch {}
          return json(request, { status: audio ? 'COMPLETED' : 'FAILED', event: 'complete', hasAudio: Boolean(audio), audio });
        }
        if (event.event === 'error') {
          try { await reader.cancel(); } catch {}
          return json(request, { status: 'FAILED', event: 'error', rawError: event.data || '' });
        }
        if (event.event === 'generating' || event.event === 'heartbeat') {
          try { await reader.cancel(); } catch {}
          return json(request, { status: 'PROCESSING', event: event.event });
        }
      }
      if (done) return json(request, { status: 'PROCESSING', event: 'stream-closed' });
    }
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || /timeout|aborted/i.test(error.message))) return json(request, { status: 'PROCESSING', event: 'timeout-poll' });
    return json(request, { status: 'FAILED', event: 'exception', error: error instanceof Error ? error.message : String(error) }, 502);
  } finally {
    clearTimeout(timer);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/diagnostic/smoke/start' && request.method === 'GET') return startSmoke(request, env);
    if (url.pathname === '/api/diagnostic/smoke/result' && request.method === 'GET') return smokeResult(request, env, url);
    return productionV5.fetch(request, env, ctx);
  }
};
