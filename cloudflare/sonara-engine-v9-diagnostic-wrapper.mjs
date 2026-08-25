import engine from './sonara-engine-v9-dual-fast.mjs';

const DEFAULT_MODAL_URL = 'https://alo986761986-gif--sonara-acestep-serve-acestep.modal.run';

function safeJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'no-store'
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/diagnostics/modal-connectivity' && request.method === 'GET') {
      const baseUrl = String(env.ACESTEP_API_URL || DEFAULT_MODAL_URL).replace(/\/$/, '');
      const key = String(env.MODAL_PROXY_KEY || '').trim();
      const secret = String(env.MODAL_PROXY_SECRET || '').trim();

      if (!key || !secret) {
        return safeJson({
          ok: false,
          stage: 'binding-check',
          hasModalKey: Boolean(key),
          hasModalSecret: Boolean(secret),
          error: 'Modal proxy credential binding is missing.'
        }, 503);
      }

      try {
        const response = await fetch(`${baseUrl}/v1/models`, {
          method: 'GET',
          headers: {
            'Modal-Key': key,
            'Modal-Secret': secret,
            Accept: 'application/json'
          },
          signal: AbortSignal.timeout(45000)
        });
        const raw = await response.text();
        let payload = null;
        try { payload = raw ? JSON.parse(raw) : null; } catch {}
        const records = Array.isArray(payload?.data?.models) ? payload.data.models : [];
        const models = records.map((item) => String(item?.name || '')).filter(Boolean);
        return safeJson({
          ok: response.ok,
          stage: 'modal-model-catalog',
          modalHttpStatus: response.status,
          hasModalKey: true,
          hasModalSecret: true,
          modelCount: models.length,
          models,
          defaultModel: String(payload?.data?.default_model || ''),
          error: response.ok ? null : String(payload?.detail || payload?.error || payload?.message || `Modal HTTP ${response.status}`)
        }, response.ok ? 200 : 502);
      } catch (error) {
        return safeJson({
          ok: false,
          stage: 'modal-network',
          hasModalKey: true,
          hasModalSecret: true,
          error: error instanceof Error ? error.message : String(error)
        }, 502);
      }
    }

    return engine.fetch(request, env, ctx);
  }
};
