import runtime, { SonaraJobState, SonaraAuthStore } from './sonara-studio-native-pitch-bridge.mjs';

export { SonaraJobState, SonaraAuthStore };

const VERSION = 'sonara-studio-pitch-key-upload-bridge-2-dsp-only';
const APPLY_PATH = '/api/studio/pitch-key';
const ALLOWED_ORIGINS = new Set([
  'https://sonaraenterprise.com',
  'https://www.sonaraenterprise.com',
  'https://api.sonaraenterprise.com'
]);

const clean = value => String(value ?? '').trim();

function corsHeaders(request, headers) {
  const out = new Headers(headers);
  const origin = clean(request.headers.get('Origin'));
  if (ALLOWED_ORIGINS.has(origin)) {
    out.set('Access-Control-Allow-Origin', origin);
    out.set('Access-Control-Allow-Credentials', 'true');
    out.set('Vary', 'Origin');
  }
  out.set('x-sonara-studio-pitch-key-upload', VERSION);
  out.set('x-sonara-studio-pitch-key-mode', 'local-dsp-only');
  return out;
}

function localDspOnly(request) {
  return new Response(JSON.stringify({
    error: 'Pitch & Key usa DSP locale V6 sul file caricato. La rigenerazione AI del brano e disabilitata.',
    code: 'SONARA_PITCH_KEY_LOCAL_DSP_ONLY',
    mode: 'local-dsp-only',
    version: VERSION
  }), {
    status: 409,
    headers: corsHeaders(request, {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'no-store'
    })
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const contentType = clean(request.headers.get('content-type')).toLowerCase();

    // Safety guard for stale clients: never send a user-uploaded Pitch & Key file to
    // /api/studio/repair or any generative music route. V6 processes the source bytes
    // locally in the browser and exports a WAV derived from those exact samples.
    if (url.pathname === APPLY_PATH && request.method === 'POST' && contentType.includes('multipart/form-data')) {
      return localDspOnly(request);
    }

    return runtime.fetch(request, env, ctx);
  }
};
