import runtime, { SonaraJobState, SonaraAuthStore } from './sonara-quality-ultra-stability-guard.mjs';

export { SonaraJobState, SonaraAuthStore };

const VERSION = 'sonara-quality-fast-batch-v8';
const GENERATE_PATHS = new Set(['/api/engine/generate', '/api/billing/generate']);

const clean = value => String(value ?? '').trim();

function profileOf(body = {}) {
  const raw = clean(body.generationProfileV3 || body.renderProfile || body.generationProfile || body.qualityProfile || 'quality').toLowerCase();
  if (['ultra', 'maximum', 'max', 'studio', 'master'].includes(raw)) return 'ultra';
  if (['fast', 'speed', 'preview'].includes(raw)) return 'fast';
  return 'quality';
}

function qualityBatchBody(body = {}) {
  return {
    ...body,
    sonaraDirectorBypass: true,
    sonaraQualityFastBatchV8: true,
    sonaraQualityFastBatchVersion: VERSION,
    sonaraQualityUltraStability: false,
    sonaraQualitySequentialSingleTakes: false,
    sonaraQualityBStrictPublishGate: false,
    sonaraQualityBAutoRetry: false,
    candidateCount: 2,
    candidate_count: 2,
    dualFast: true,
    sonaraVisibleCandidateTarget: 2,
    sonaraInternalCandidateTarget: 2,
    sonaraGenerationProfile: 'quality',
    generationProfileV3: 'quality',
    renderProfile: 'quality',
    generationProfile: 'quality'
  };
}

function withVersion(response) {
  const headers = new Headers(response.headers);
  headers.set('x-sonara-quality-fast-batch', VERSION);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function transformJson(response) {
  const type = clean(response.headers.get('content-type')).toLowerCase();
  if (!type.includes('application/json')) return withVersion(response);
  try {
    const data = await response.clone().json();
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.set('content-type', 'application/json; charset=UTF-8');
    headers.set('x-sonara-quality-fast-batch', VERSION);
    return new Response(JSON.stringify({
      ...data,
      metadata: {
        ...(data?.metadata || {}),
        qualityFastBatch: VERSION,
        qualitySequentialSingleTakes: false,
        concurrentBatches: true,
        candidateCount: Number(data?.metadata?.candidateCount || data?.candidates?.length || 2),
        qualityBlockingWavAnalysis: false
      }
    }), {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  } catch {
    return withVersion(response);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'POST' && GENERATE_PATHS.has(url.pathname) && clean(request.headers.get('content-type')).toLowerCase().includes('application/json')) {
      let body;
      try { body = await request.clone().json(); }
      catch { return runtime.fetch(request, env, ctx); }
      if (body?.sonaraDirectorBypass === true) return runtime.fetch(request, env, ctx);
      if (profileOf(body) === 'quality') {
        const headers = new Headers(request.headers);
        headers.delete('content-length');
        headers.set('content-type', 'application/json');
        headers.set('x-sonara-quality-fast-batch', VERSION);
        const response = await runtime.fetch(new Request(request.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(qualityBatchBody(body)),
          cache: 'no-store'
        }), env, ctx);
        return transformJson(response);
      }
    }
    return withVersion(await runtime.fetch(request, env, ctx));
  }
};
