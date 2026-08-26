import sonaraProxy from './sonara-web-dj-proxy.mjs';

const BLOCKED_GENERATOR_EDGE_SCRIPTS = [
  'sonara-intelligent-lyrics-edge.js',
  'sonara-vocal-character-edge.js',
  'sonara-vocal-character-visible.js'
];
const BILLING_GENERATE_PATH = '/api/billing/generate';
const RETRYABLE_GENERATION_STATUSES = new Set([502, 503, 504, 524]);
const GENERATION_RETRY_DELAY_MS = 1200;

function stripDuplicateGeneratorScripts(html) {
  return BLOCKED_GENERATOR_EDGE_SCRIPTS.reduce((output, scriptName) => {
    const escaped = scriptName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`<script\\b[^>]*\\bsrc=["'][^"']*${escaped}[^"']*["'][^>]*>\\s*<\\/script>`, 'gi');
    return output.replace(pattern, '');
  }, html);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function jsonGenerationFailure(upstreamStatus, message) {
  return new Response(JSON.stringify({
    error: {
      code: 'GENERATION_UPSTREAM_RETRYABLE',
      message
    },
    retryable: true,
    upstreamStatus
  }), {
    status: 503,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-sonara-generator-recovery': 'billing-json-v2'
    }
  });
}

async function normalizeBillingGenerationResponse(response) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    const headers = new Headers(response.headers);
    headers.set('cache-control', 'no-store');
    headers.set('x-sonara-generator-recovery', 'billing-json-v2');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  const upstreamStatus = response.status || 502;
  return jsonGenerationFailure(
    upstreamStatus,
    RETRYABLE_GENERATION_STATUSES.has(upstreamStatus)
      ? 'SONARA sta riattivando il motore di generazione. Riprova automaticamente senza perdere la sessione.'
      : `Il motore SONARA ha restituito una risposta non valida (HTTP ${upstreamStatus}).`
  );
}

async function generateWithRecovery(request, env, ctx) {
  const first = await sonaraProxy.fetch(request.clone(), env, ctx);
  if (!RETRYABLE_GENERATION_STATUSES.has(first.status)) {
    return normalizeBillingGenerationResponse(first);
  }

  await wait(GENERATION_RETRY_DELAY_MS);
  const second = await sonaraProxy.fetch(request.clone(), env, ctx);
  return normalizeBillingGenerationResponse(second);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === BILLING_GENERATE_PATH) {
      return generateWithRecovery(request, env, ctx);
    }

    const response = await sonaraProxy.fetch(request, env, ctx);
    const contentType = response.headers.get('content-type') || '';

    if (request.method === 'HEAD' || !contentType.includes('text/html')) {
      return response;
    }

    const html = stripDuplicateGeneratorScripts(await response.text());
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.set('cache-control', 'no-store, max-age=0');
    headers.set('x-sonara-generator-stability', 'native-react-controls-v1');

    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
