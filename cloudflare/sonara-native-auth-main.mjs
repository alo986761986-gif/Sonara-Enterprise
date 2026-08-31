import worker, { SonaraJobState } from './sonara-next-studio-edge.mjs';
import { SonaraAuthStore } from './sonara-native-auth-safe.mjs';
import {
  QUALITY_DIRECTOR_VERSION,
  analyzeProfessionalCandidate,
  summarizeProfessionalReports
} from './sonara-quality-director-v2.mjs';

export { SonaraJobState, SonaraAuthStore };

const ALLOWED_AUDIO_HOSTS = new Set([
  'sonaraenterprise.com',
  'www.sonaraenterprise.com',
  'api.sonaraenterprise.com',
  'molab.sonaraenterprise.com'
]);

const clean = value => String(value ?? '').trim();
const numeric = value => Number.isFinite(Number(value)) ? Number(value) : null;

function qualityJson(request, data, status = 200) {
  const origin = clean(request.headers.get('Origin'));
  const allowedOrigin = ['https://sonaraenterprise.com', 'https://www.sonaraenterprise.com', 'https://api.sonaraenterprise.com'].includes(origin)
    ? origin
    : 'https://sonaraenterprise.com';
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'private, no-store',
      'access-control-allow-origin': allowedOrigin,
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'Authorization,Content-Type,Range,Cache-Control,Pragma,X-Sonara-Profile-Id,X-Sonara-Project-Id',
      'access-control-expose-headers': 'X-Sonara-Quality-Director',
      'x-sonara-quality-director': QUALITY_DIRECTOR_VERSION,
      vary: 'Origin'
    }
  });
}

function validAudioUrl(value) {
  try {
    const url = new URL(clean(value));
    return url.protocol === 'https:' && ALLOWED_AUDIO_HOSTS.has(url.hostname) ? url.toString() : '';
  } catch {
    return '';
  }
}

function molabBase(env) {
  return clean(env?.SONARA_MOLAB_XL_URL || env?.MOLAB_ACESTEP_URL).replace(/\/$/, '');
}

function upstreamHeaders(env, inputHeaders) {
  const headers = new Headers(inputHeaders || {});
  const key = clean(env?.ACE_STEP_API_KEY || env?.ACESTEP_API_KEY);
  if (key) {
    headers.set('Authorization', `Bearer ${key}`);
    headers.set('X-API-Key', key);
  }
  return headers;
}

async function qualityFetch(input, init = {}, env) {
  const raw = input instanceof Request ? input.url : String(input);
  let url;
  try { url = new URL(raw); }
  catch { return fetch(input, init); }

  const isSonaraAudioProxy = ['api.sonaraenterprise.com', 'molab.sonaraenterprise.com'].includes(url.hostname)
    && ['/api/molab/audio', '/v1/audio'].includes(url.pathname);
  if (!isSonaraAudioProxy) return fetch(input, init);

  const path = clean(url.searchParams.get('path'));
  const baseUrl = molabBase(env);
  if (!path || !baseUrl) return fetch(input, init);

  const target = new URL('/v1/audio', `${baseUrl}/`);
  target.searchParams.set('path', path);
  return fetch(target.toString(), {
    ...init,
    headers: upstreamHeaders(env, init?.headers),
    signal: init?.signal || AbortSignal.timeout(120_000)
  });
}

async function handleQualityV2(request, env) {
  let body = {};
  try { body = await request.json(); }
  catch { return qualityJson(request, { error: 'JSON non valido.' }, 400); }

  const urls = (Array.isArray(body.audioUrls) ? body.audioUrls : [body.audioUrl])
    .map(validAudioUrl)
    .filter(Boolean)
    .slice(0, 12);
  if (!urls.length) return qualityJson(request, { error: 'Nessun audio SONARA valido da analizzare.' }, 400);

  const requested = {
    bpm: numeric(body.bpm ?? body.requestedBpm),
    key: clean(body.key || body.key_scale),
    durationSec: numeric(body.durationSec ?? body.duration)
  };

  const reports = await Promise.all(urls.map(async (audioUrl, index) => {
    try {
      const measured = await analyzeProfessionalCandidate(
        audioUrl,
        requested,
        (input, init) => qualityFetch(input, init, env)
      );
      return { ...measured, index, audioUrl };
    } catch (error) {
      return {
        index,
        audioUrl,
        measuredFromRealWav: false,
        professionalScore: 0,
        professionalReleasePassed: false,
        professionalTier: 'reject',
        hardFailureReasons: ['analysis-error'],
        repairPlan: ['Run SONARA Quality Repair and analyze the resulting real WAV again.'],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }));

  const summary = summarizeProfessionalReports(reports, requested);
  return qualityJson(request, {
    status: 'success',
    sonaraQualityDirector: summary,
    reports: summary.reports,
    directMolabRealWavAnalysis: true
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS' && url.pathname === '/api/studio/quality-v2') {
      return qualityJson(request, { ok: true }, 204);
    }
    if (request.method === 'POST' && url.pathname === '/api/studio/quality-v2') {
      return handleQualityV2(request, env);
    }
    return worker.fetch(request, env, ctx);
  }
};