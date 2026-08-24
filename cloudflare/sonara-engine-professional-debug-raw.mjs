import debugInitializer from './sonara-engine-professional-debug.mjs';

const ADMIN_PATH = '/api/admin/ace-step/init';
const ADMIN_TOKEN = '1a62decebd561a81b4a43f3d1de98fc7b83a9b5f54ebb0dba4908ba772670f8c';
const MODAL_DEFAULT_URL = 'https://alo986761986-gif--sonara-acestep-serve-acestep.modal.run';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

function rawData(stage) {
  if (stage === 'gradio-start-current-raw') {
    return [
      '/app/checkpoints',
      'acestep-v15-turbo',
      'cuda',
      true,
      'acestep-5Hz-lm-0.6B',
      'vllm',
      true,
      false,
      false,
      false,
      false,
      false,
      'Custom',
      1,
      'official'
    ];
  }
  if (stage === 'gradio-start-xl-raw') {
    return [
      '/app/checkpoints',
      'acestep-v15-xl-sft',
      'cuda',
      true,
      'acestep-5Hz-lm-4B',
      'pt',
      true,
      true,
      false,
      false,
      false,
      false,
      'Custom',
      2,
      'official'
    ];
  }
  if (stage === 'gradio-start-xl-17-raw') {
    return [
      '/app/checkpoints',
      'acestep-v15-xl-sft',
      'cuda',
      true,
      'acestep-5Hz-lm-1.7B',
      'pt',
      true,
      true,
      false,
      false,
      false,
      false,
      'Custom',
      2,
      'official'
    ];
  }
  return null;
}

async function startRaw(env, stage) {
  const data = rawData(stage);
  if (!data) throw new Error('Unknown raw probe stage.');

  const baseUrl = String(env.ACESTEP_API_URL || MODAL_DEFAULT_URL).replace(/\/$/, '');
  const key = String(env.MODAL_PROXY_KEY || '').trim();
  const secret = String(env.MODAL_PROXY_SECRET || '').trim();
  if (!key || !secret) throw new Error('Modal proxy credentials are not configured.');

  const response = await fetch(`${baseUrl}/gradio_api/call/lambda_6`, {
    method: 'POST',
    headers: {
      'Modal-Key': key,
      'Modal-Secret': secret,
      Accept: 'application/json',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ data }),
    signal: AbortSignal.timeout(120_000)
  });

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text.slice(0, 2000) };
  }
  if (!response.ok) throw new Error(payload?.error || payload?.detail || text || `HTTP ${response.status}`);
  return payload;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const stage = String(url.searchParams.get('stage') || '');
    if (url.pathname === ADMIN_PATH && rawData(stage)) {
      if (url.searchParams.get('token') !== ADMIN_TOKEN) {
        return json({ ok: false, error: 'FORBIDDEN' }, 403);
      }
      try {
        const result = await startRaw(env, stage);
        return json({
          ok: true,
          stage,
          eventId: result?.event_id || null,
          result
        });
      } catch (error) {
        return json({
          ok: false,
          stage,
          error: error instanceof Error ? error.message : String(error)
        }, 500);
      }
    }
    return debugInitializer.fetch(request, env, ctx);
  }
};
