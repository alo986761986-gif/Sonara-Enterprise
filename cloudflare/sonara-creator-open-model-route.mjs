// Routes explicitly selected Music Creator models to the isolated GPU queue.
// Existing ACE-Step and Remix Pro routes must never depend on this module.
import { handleSonaraMultiEngine } from './sonara-multi-engine-r2.mjs';

const MODELS = new Set(['heartmula-3b', 'stable-audio-3-medium']);
const OPEN_JOB_ID = /^sr2_[0-9a-f-]{36}$/;
const MULTI_JOB_PREFIX = 'multi-engine-v1/jobs/';

export function selectedCreatorOpenModel(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return '';
  if (body.sonaraMultiEngineCreatorRequest !== true || body.sonaraRemixPro === true) return '';
  const model = typeof body.sonaraModelId === 'string' ? body.sonaraModelId : '';
  return MODELS.has(model) ? model : '';
}

export async function enqueueCreatorOpenModel(source, env, ctx, uid, internalSecret, baseUrl) {
  if (!selectedCreatorOpenModel(source)) return null;
  if (!uid || uid.length > 128 || !internalSecret) {
    return new Response(JSON.stringify({error:'Unauthorized music creator'}), {status:401,headers:{'content-type':'application/json'}});
  }
  const body = { ...source, sonaraModelId: selectedCreatorOpenModel(source) };
  const req = new Request(new URL('/api/engine/generate',baseUrl),{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'X-Sonara-Internal-Secret':internalSecret,
      'X-Sonara-User-Uid':uid,
    },
    body:JSON.stringify(body)
  });
  // The multi-engine handler enforces model availability, duration, and
  // per-user ownership before adding anything to R2.
  return handleSonaraMultiEngine(req, { ...env, SONARA_INTERNAL_PROXY_SECRET:internalSecret }, ctx);
}

export async function isCreatorOpenModelJob(request, env) {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname !== '/api/billing/job') return false;
  const jobId = String(url.searchParams.get('jobId') || '').trim();
  if (!OPEN_JOB_ID.test(jobId) || !env.SONARA_AUDIO_BUCKET) return false;
  // The legacy ACE-Step job IDs are also sr2_. Only intercept when this job
  // exists in the isolated multi-engine R2 namespace.
  try {
    return Boolean(await env.SONARA_AUDIO_BUCKET.head(MULTI_JOB_PREFIX + jobId + '.json'));
  } catch {
    // If R2 is unavailable, fail closed rather than pretending legacy owns it.
    throw new Error('Multi-engine job lookup unavailable');
  }
}

export async function pollCreatorOpenModelJob(request, env, ctx, uid, internalSecret) {
  if (!uid || uid.length > 128 || !internalSecret) {
    return new Response(JSON.stringify({error:'Unauthorized music creator'}), {status:401,headers:{'content-type':'application/json'}});
  }
  const jobId = String(new URL(request.url).searchParams.get('jobId') || '').trim();
  if (!OPEN_JOB_ID.test(jobId)) {
    return new Response(JSON.stringify({error:'Invalid job ID'}), {status:400,headers:{'content-type':'application/json'}});
  }
  const target = new URL('/api/music/job/' + jobId, request.url);
  const req = new Request(target, {
    method:'GET',
    headers:{
      'X-Sonara-Internal-Secret':internalSecret,
      'X-Sonara-User-Uid':uid,
    }
  });
  // Polls authenticate with the native session's UID, never a client-supplied
  // owner header. The handler enforces job ownership and signs WAV URLs.
  return handleSonaraMultiEngine(req,{...env,SONARA_INTERNAL_PROXY_SECRET:internalSecret},ctx);
}
