import worker from './sonara-ab-player-visibility-edge.mjs';
export { SonaraJobState } from './sonara-ab-player-visibility-edge.mjs';
import {
  QUALITY_DIRECTOR_VERSION,
  PROFESSIONAL_RELEASE_SCORE,
  analyzeProfessionalCandidate,
  summarizeProfessionalReports,
  upgradeQualityPayload
} from './sonara-quality-director-v2.mjs';
import {
  SONARA_STUDIO_V2_VERSION,
  SONARA_SESSIONS_VERSION,
  SONARA_LONG_MEMORY_VERSION,
  STEMS_12,
  SESSION_OPERATIONS,
  sessionOperationInstruction,
  mergeSongMemory,
  memoryInstruction,
  studioV2Capabilities
} from './sonara-studio-v2-contract.mjs';

const VERSION = 'sonara-next-studio-edge-v2';
const JOB_PATH = /^\/api\/(?:music\/job|studio\/job)\//;
const GENERATE_PATHS = new Set(['/api/billing/generate', '/api/engine/generate']);
const ALLOWED_ORIGINS = new Set(['https://sonaraenterprise.com', 'https://www.sonaraenterprise.com', 'https://api.sonaraenterprise.com']);
const ALLOWED_AUDIO_HOSTS = new Set(['sonaraenterprise.com', 'www.sonaraenterprise.com', 'api.sonaraenterprise.com', 'molab.sonaraenterprise.com']);
const PROFILE_HEADER = 'x-sonara-profile-id';
const PROJECT_HEADER = 'x-sonara-project-id';
const ALIASES = Object.freeze({
  '/api/studio/replace': '/api/studio/repaint',
  '/api/studio/inpaint': '/api/studio/repaint',
  '/api/studio/extend': '/api/studio/complete',
  '/api/studio/remix': '/api/studio/cover',
  '/api/studio/style-dna': '/api/studio/persona',
  '/api/studio/voice-dna': '/api/studio/voice',
  '/api/studio/audio-to-audio': '/api/studio/reference',
  '/api/studio/stems-pro': '/api/studio/stems',
  '/api/studio/regenerate-stem-section': '/api/studio/regenerate-stem'
});

const clean = value => String(value ?? '').trim();
const numeric = value => Number.isFinite(Number(value)) ? Number(value) : null;
const safeId = value => clean(value).replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 96);

function cors(request) {
  const origin = clean(request.headers.get('Origin'));
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://sonaraenterprise.com',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': `Authorization,Content-Type,Range,Cache-Control,Pragma,X-Sonara-Studio,${PROFILE_HEADER},${PROJECT_HEADER}`,
    'Access-Control-Expose-Headers': 'X-Sonara-Next-Studio,X-Sonara-Quality-Director,X-Sonara-Studio-V2',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'private, no-store',
      'x-sonara-next-studio': VERSION,
      'x-sonara-quality-director': QUALITY_DIRECTOR_VERSION,
      'x-sonara-studio-v2': SONARA_STUDIO_V2_VERSION,
      ...cors(request)
    }
  });
}

function validSonaraAudioUrl(value) {
  try {
    const url = new URL(clean(value));
    return url.protocol === 'https:' && ALLOWED_AUDIO_HOSTS.has(url.hostname) ? url.toString() : '';
  } catch {
    return '';
  }
}

function doStub(env, name) {
  if (!env?.SONARA_JOB_STATE) return null;
  try { return env.SONARA_JOB_STATE.get(env.SONARA_JOB_STATE.idFromName(name)); }
  catch { return null; }
}

async function readPersistentState(env, name, fallback = {}) {
  const stub = doStub(env, name);
  if (!stub) return fallback;
  try {
    const response = await stub.fetch('https://sonara.internal/state');
    if (!response.ok) return fallback;
    const data = await response.json();
    return data && typeof data === 'object' ? data : fallback;
  } catch {
    return fallback;
  }
}

async function writePersistentState(env, name, state) {
  const stub = doStub(env, name);
  if (!stub) return false;
  try {
    const response = await stub.fetch('https://sonara.internal/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...state, persistent: true, updatedAt: Date.now() })
    });
    return response.ok;
  } catch {
    return false;
  }
}

function profileId(request, body = {}) {
  return safeId(request.headers.get(PROFILE_HEADER) || body.profileId || body.sonaraProfileId);
}

function projectId(request, body = {}) {
  return safeId(request.headers.get(PROJECT_HEADER) || body.projectId || body.sonaraProjectId || body.songProjectId);
}

async function activeIdentityContext(request, env, body = {}) {
  const id = profileId(request, body);
  if (!id) return { profileId: '', voice: null, persona: null };
  const state = await readPersistentState(env, `identity-${id}`, { voiceProfiles: [], personaProfiles: [], activeVoiceId: null, activePersonaId: null });
  const voiceProfiles = Array.isArray(state.voiceProfiles) ? state.voiceProfiles : [];
  const personaProfiles = Array.isArray(state.personaProfiles) ? state.personaProfiles : [];
  return {
    profileId: id,
    voice: voiceProfiles.find(item => item?.id === state.activeVoiceId) || null,
    persona: personaProfiles.find(item => item?.id === state.activePersonaId) || null
  };
}

async function projectMemoryContext(request, env, body = {}, operation = '') {
  const pId = profileId(request, body) || 'anonymous';
  const prjId = projectId(request, body);
  if (!prjId) return { projectId: '', memory: null };
  const stateName = `song-memory-${pId}-${prjId}`;
  const previous = await readPersistentState(env, stateName, {});
  const memory = mergeSongMemory(previous, { ...body, projectId: prjId, sonaraSessionOperation: operation });
  await writePersistentState(env, stateName, memory);
  return { projectId: prjId, memory };
}

async function enrichStudioBody(request, env, body = {}, operation = '') {
  const prompt = clean(body.prompt || body.instruction);
  const identity = await activeIdentityContext(request, env, body);
  const memoryContext = await projectMemoryContext(request, env, body, operation);
  const additions = [sessionOperationInstruction(operation)];

  if (identity.voice) {
    additions.push(`SONARA ACTIVE VOICE DNA (${clean(identity.voice.name) || 'Voice'}, strength ${Number(identity.voice.strength || 82)}/100): ${clean(identity.voice.instruction)}. Keep one stable singer identity, timbre, formants, range, articulation, accent, pronunciation, breath behavior and vibrato.`);
  }
  if (identity.persona) {
    additions.push(`SONARA ACTIVE STYLE DNA (${clean(identity.persona.name) || 'Style'}, strength ${Number(identity.persona.strength || 72)}/100): ${clean(identity.persona.instruction)}. Apply it inside the explicit SONARA taxonomy and never override BPM or key locks.`);
  }
  const remembered = memoryInstruction(memoryContext.memory);
  if (remembered) additions.push(remembered);

  const referenceAudioUrl = clean(body.referenceAudioUrl || body.reference_audio_url)
    || validSonaraAudioUrl(identity.voice?.referenceAudioUrl)
    || validSonaraAudioUrl(identity.persona?.referenceAudioUrl)
    || '';

  return {
    ...body,
    prompt: [...additions.filter(Boolean), prompt].join(' ').slice(0, 9000),
    referenceAudioUrl: referenceAudioUrl || body.referenceAudioUrl,
    sonaraSessionOperation: operation,
    sonaraSessionsVersion: SONARA_SESSIONS_VERSION,
    sonaraStudioV2: SONARA_STUDIO_V2_VERSION,
    sonaraLongContextMemory: true,
    sonaraLongMemoryVersion: SONARA_LONG_MEMORY_VERSION,
    sonaraIdentityContinuity: true,
    sonaraSingerIdentityContinuity: true,
    sonaraChorusIdentityLock: true,
    sonaraMotifContinuity: true,
    sonaraEndingIntegrity: true,
    sonaraActiveVoiceProfile: identity.voice ? { id: identity.voice.id, name: identity.voice.name, strength: identity.voice.strength } : body.sonaraActiveVoiceProfile,
    sonaraActivePersonaProfile: identity.persona ? { id: identity.persona.id, name: identity.persona.name, strength: identity.persona.strength } : body.sonaraActivePersonaProfile,
    sonaraProjectMemory: memoryContext.memory || body.sonaraProjectMemory,
    projectId: memoryContext.projectId || body.projectId
  };
}

async function qualityV2(request) {
  let body = {};
  try { body = await request.json(); }
  catch { return json(request, { error: 'JSON non valido.' }, 400); }

  const urls = (Array.isArray(body.audioUrls) ? body.audioUrls : [body.audioUrl]).map(validSonaraAudioUrl).filter(Boolean).slice(0, 12);
  if (!urls.length) return json(request, { error: 'Nessun audio SONARA valido da analizzare.' }, 400);
  const requested = {
    bpm: numeric(body.bpm ?? body.requestedBpm),
    key: clean(body.key || body.key_scale),
    durationSec: numeric(body.durationSec ?? body.duration)
  };

  const reports = await Promise.all(urls.map(async (audioUrl, index) => {
    try {
      const report = await analyzeProfessionalCandidate(audioUrl, requested);
      return { ...report, index, audioUrl };
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
  return json(request, { status: 'success', sonaraQualityDirector: summary, reports: summary.reports });
}

async function projectMemoryEndpoint(request, env) {
  let body = {};
  if (request.method !== 'GET') {
    try { body = await request.json(); }
    catch { return json(request, { error: 'JSON non valido.' }, 400); }
  }
  const pId = profileId(request, body) || 'anonymous';
  const prjId = projectId(request, body) || safeId(new URL(request.url).searchParams.get('projectId'));
  if (!prjId) return json(request, { error: 'projectId obbligatorio.' }, 400);
  const stateName = `song-memory-${pId}-${prjId}`;
  if (request.method === 'DELETE') {
    const stub = doStub(env, stateName);
    if (stub) await stub.fetch('https://sonara.internal/state', { method: 'DELETE' });
    return json(request, { status: 'success', projectId: prjId, deleted: true });
  }
  const previous = await readPersistentState(env, stateName, {});
  if (request.method === 'GET') return json(request, { status: 'success', projectId: prjId, memory: previous });
  const memory = mergeSongMemory(previous, { ...body, projectId: prjId });
  await writePersistentState(env, stateName, memory);
  return json(request, { status: 'success', projectId: prjId, memory });
}

function releaseStatus(request) {
  return json(request, {
    ok: true,
    release: 'SONARA Studio 2.0',
    studio: studioV2Capabilities(),
    nextStudioEdge: VERSION,
    qualityDirector: QUALITY_DIRECTOR_VERSION,
    professionalReleaseScore: PROFESSIONAL_RELEASE_SCORE,
    sessionsMarker: 'sonara-sessions-2-0',
    productionMarker: SONARA_STUDIO_V2_VERSION,
    operations: [...SESSION_OPERATIONS],
    stems: [...STEMS_12]
  });
}

async function aliasStudioRequest(request, env) {
  const url = new URL(request.url);
  const targetPath = ALIASES[url.pathname];
  if (!targetPath) return request;

  const operation = url.pathname.split('/').pop() || 'studio';
  const nextUrl = new URL(request.url);
  nextUrl.pathname = targetPath;
  const headers = new Headers(request.headers);
  headers.set('x-sonara-next-studio', VERSION);
  headers.set('x-sonara-session-operation', operation);
  headers.set('x-sonara-studio-v2', SONARA_STUDIO_V2_VERSION);

  if (request.method !== 'POST') return new Request(nextUrl.toString(), request);
  const contentType = clean(headers.get('content-type')).toLowerCase();

  if (contentType.includes('multipart/form-data')) {
    try {
      const form = await request.clone().formData();
      const plain = {};
      for (const [key, value] of form.entries()) if (typeof value === 'string') plain[key] = value;
      const enriched = await enrichStudioBody(request, env, plain, operation);
      for (const [key, value] of Object.entries(enriched)) {
        if (value === undefined || value === null || value === '') continue;
        if (typeof value === 'object') form.set(key, JSON.stringify(value));
        else form.set(key, String(value));
      }
      if (operation === 'stems-pro' && !form.get('stems')) form.set('stems', JSON.stringify(STEMS_12));
      headers.delete('content-length');
      headers.delete('content-type');
      return new Request(nextUrl.toString(), {
        method: request.method,
        headers,
        body: form,
        credentials: request.credentials,
        cache: 'no-store',
        redirect: request.redirect
      });
    } catch {
      return new Request(nextUrl.toString(), request);
    }
  }

  if (!contentType.includes('application/json')) {
    return new Request(nextUrl.toString(), {
      method: request.method,
      headers,
      body: await request.clone().arrayBuffer(),
      redirect: request.redirect
    });
  }

  try {
    const body = await request.clone().json();
    const nextBody = await enrichStudioBody(request, env, body, operation);
    if (operation === 'stems-pro' && !nextBody.stems) nextBody.stems = [...STEMS_12];
    if (operation === 'regenerate-stem-section') {
      nextBody.repainting_start = numeric(body.start ?? body.repainting_start) ?? 0;
      nextBody.repainting_end = numeric(body.end ?? body.repainting_end) ?? -1;
    }
    headers.delete('content-length');
    headers.set('content-type', 'application/json');
    return new Request(nextUrl.toString(), {
      method: request.method,
      headers,
      body: JSON.stringify(nextBody),
      credentials: request.credentials,
      cache: 'no-store',
      redirect: request.redirect
    });
  } catch {
    return new Request(nextUrl.toString(), request);
  }
}

async function rewriteGenerationRequest(request, env) {
  if (request.method !== 'POST') return request;
  const url = new URL(request.url);
  if (!GENERATE_PATHS.has(url.pathname)) return request;
  const contentType = clean(request.headers.get('content-type')).toLowerCase();
  if (!contentType.includes('application/json')) return request;
  try {
    const body = await request.clone().json();
    const enriched = await enrichStudioBody(request, env, body, 'generate');
    const headers = new Headers(request.headers);
    headers.delete('content-length');
    headers.set('content-type', 'application/json');
    headers.set('x-sonara-quality-director', QUALITY_DIRECTOR_VERSION);
    headers.set('x-sonara-long-context', SONARA_LONG_MEMORY_VERSION);
    headers.set('x-sonara-studio-v2', SONARA_STUDIO_V2_VERSION);
    const next = {
      ...enriched,
      sonaraQualityDirector: QUALITY_DIRECTOR_VERSION,
      sonaraProfessionalReleaseScore: PROFESSIONAL_RELEASE_SCORE,
      sonaraAutomaticCandidateRanking: true,
      sonaraLongContextMemory: true,
      sonaraSectionIdentityLock: true,
      sonaraChorusIdentityLock: true,
      sonaraSingerIdentityContinuity: true,
      sonaraMotifContinuity: true,
      sonaraEndingIntegrity: true
    };
    return new Request(request.url, {
      method: request.method,
      headers,
      body: JSON.stringify(next),
      credentials: request.credentials,
      cache: 'no-store',
      redirect: request.redirect
    });
  } catch {
    return request;
  }
}

async function transformJson(response, transform) {
  const type = clean(response.headers.get('content-type')).toLowerCase();
  if (!response.ok || !type.includes('application/json')) return response;
  try {
    const data = await response.clone().json();
    const next = await transform(data);
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.set('content-type', 'application/json; charset=UTF-8');
    headers.set('x-sonara-next-studio', VERSION);
    headers.set('x-sonara-quality-director', QUALITY_DIRECTOR_VERSION);
    headers.set('x-sonara-studio-v2', SONARA_STUDIO_V2_VERSION);
    return new Response(JSON.stringify(next), { status: response.status, statusText: response.statusText, headers });
  } catch {
    return response;
  }
}

const UI = String.raw`(() => {
  if (window.__sonaraSessions20) return;
  window.__sonaraSessions20 = true;
  document.documentElement.dataset.sonaraSessions = '2.0';
})();`;

async function injectUi(request, response) {
  if (request.method !== 'GET' || !response.ok) return response;
  const url = new URL(request.url);
  if (!['sonaraenterprise.com', 'www.sonaraenterprise.com'].includes(url.hostname)) return response;
  const type = clean(response.headers.get('content-type')).toLowerCase();
  if (!type.includes('text/html')) return response;
  const html = await response.text();
  if (html.includes('sonara-sessions-2-0')) return new Response(html, response);
  const injection = `<script id="sonara-sessions-2-0">${UI.replace(/<\/script/gi, '<\\/script')}</script>`;
  const next = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${injection}</body>`) : `${html}${injection}`;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store');
  headers.set('x-sonara-next-studio', VERSION);
  headers.set('x-sonara-studio-v2', SONARA_STUDIO_V2_VERSION);
  return new Response(next, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/studio/')) {
      return new Response(null, { status: 204, headers: cors(request) });
    }
    if (request.method === 'GET' && url.pathname === '/api/studio/release-status') return releaseStatus(request);
    if (request.method === 'POST' && url.pathname === '/api/studio/quality-v2') return qualityV2(request);
    if (url.pathname === '/api/studio/project-memory' && ['GET','PUT','POST','DELETE'].includes(request.method)) return projectMemoryEndpoint(request, env);

    let routed = await aliasStudioRequest(request, env);
    routed = await rewriteGenerationRequest(routed, env);
    let response = await worker.fetch(routed, env, ctx);

    if (response.ok && (JOB_PATH.test(url.pathname) || GENERATE_PATHS.has(url.pathname))) {
      response = await transformJson(response, data => upgradeQualityPayload(data));
    }

    if (response.ok && ['/api/health', '/api/engine/ready', '/api/molab/ready', '/api/studio/capabilities'].includes(url.pathname)) {
      response = await transformJson(response, data => ({
        ...data,
        sonaraNextStudio: {
          ...studioV2Capabilities(),
          edgeVersion: VERSION,
          qualityDirector: QUALITY_DIRECTOR_VERSION,
          professionalReleaseScore: PROFESSIONAL_RELEASE_SCORE,
          operations: [...SESSION_OPERATIONS],
          stems: [...STEMS_12],
          automaticCandidateRanking: true,
          automaticRepairPlan: true
        }
      }));
    }

    return injectUi(request, response);
  }
};
