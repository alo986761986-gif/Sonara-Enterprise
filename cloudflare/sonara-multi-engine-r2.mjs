// SONARA dual open-model generation queue (isolated from the ACE-Step relay).
// All model jobs require the existing authenticated, metered billing proxy.
// No browser endpoint can enqueue jobs or claim a machine lease directly.
const PREFIX = 'multi-engine-v1/';
const JOB_RE = /^sr2_[0-9a-f-]{36}$/;
const MODEL_IDS = new Set(['heartmula-3b', 'stable-audio-3-medium']);
const MAX_AUDIO_BYTES = 80 * 1024 * 1024;
const HEARTBEAT_TTL = 45_000;
const MAX_LEASE_MS = 15 * 60 * 1000;
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' }
});
const jobKey = id => PREFIX + 'jobs/' + id + '.json';
const waveKey = id => PREFIX + 'audio/' + id + '.wav';
const queueKey = (created, id) => PREFIX + 'queue/' + String(created).padStart(13, '0') + '/' + id;
const heartbeatKey = PREFIX + 'agent/heartbeat.json';
const safeText = (v, limit = 4000) => String(v ?? '').trim().slice(0, limit);
const validModel = model => MODEL_IDS.has(model);
const enabled = env => env.SONARA_MULTI_ENGINE_ENABLED === 'true' && Boolean(env.SONARA_AUDIO_BUCKET);
const stableLicensed = env => env.SONARA_STABLE_AUDIO_LICENSE_OK === 'true';
const owner = request => safeText(request.headers.get('X-Sonara-User-Uid'), 128);
const privileged = (request, env) => Boolean(env.SONARA_INTERNAL_PROXY_SECRET) && request.headers.get('X-Sonara-Internal-Secret') === env.SONARA_INTERNAL_PROXY_SECRET;
const bearer = r => r.headers.get('X-Sonara-Relay-Token') || (r.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
const sha256 = async s => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))).map(c => c.toString(16).padStart(2,'0')).join('');
const constantEqual = (a, b) => {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i=0; i<a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
};
async function agentAuthorized(request, env) {
  const secret = bearer(request);
  if (secret.length < 32 || secret.length > 512 || /[^\x21-\x7e]/.test(secret)) return false;
  if (env.SONARA_RELAY_TOKEN && constantEqual(secret, env.SONARA_RELAY_TOKEN)) return true;
  const digest = await sha256(secret);
  const names = ['SONARA_RELAY_TOKEN_SHA256', 'SONARA_RELAY_TOKEN_SHA256_SECONDARY',
    'SONARA_RELAY_TOKEN_SHA256_TERTIARY','SONARA_RELAY_TOKEN_SHA256_QUATERNARY',
    'SONARA_RELAY_TOKEN_SHA256_QUINARY','SONARA_RELAY_TOKEN_SHA256_SENARY',
    'SONARA_RELAY_TOKEN_SHA256_SEPTENARY','SONARA_RELAY_TOKEN_SHA256_OCTONARY'];
  return names.some(name => /^[a-f0-9]{64}$/i.test(String(env[name] || '')) && constantEqual(digest, String(env[name]).toLowerCase()));
}
async function readJson(request, max = 20_000) {
  const text = await request.text();
  if (text.length > max) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}
async function readRecord(bucket, id) {
  const obj = await bucket.get(jobKey(id));
  if (!obj) return null;
  try { return await obj.json(); } catch { return null; }
}
async function agentHealth(bucket, env) {
  let h = null;
  try { h = await (await bucket?.get(heartbeatKey))?.json(); } catch {}
  const online = Boolean(h && Number.isFinite(Number(h.timestamp)) && Date.now() - Number(h.timestamp) < HEARTBEAT_TTL && Number(h.timestamp) <= Date.now() + 5000);
  const heartmula = enabled(env) && online && h?.models?.['heartmula-3b'] === true;
  const stable = enabled(env) && stableLicensed(env) && online && h?.models?.['stable-audio-3-medium'] === true && h?.stableLicenseAccepted === true;
  return {
    version: 'sonara-multi-engine-v1',
    agentOnline: online,
    models: {
      'heartmula-3b': { ready: Boolean(heartmula), maxSeconds: 240, task: 'vocal-and-lyrics', license: 'Apache-2.0' },
      'stable-audio-3-medium': { ready: Boolean(stable), maxSeconds: 380, task: 'instrumental', license: 'Stability-AI-Community' }
    },
    stableLicenseConfigured: stableLicensed(env),
  };
}
function modelAllowed(model, caps) {
  return Boolean(caps.models?.[model]?.ready);
}
function jobPublic(record, env) {
  const complete = record.status === 'COMPLETE';
  const model = record.modelId;
  const error = record.status === 'FAILED' ? 'Generazione non riuscita sul motore selezionato.' : null;
  return {
    jobId: record.id,
    status: complete ? 'COMPLETED' : record.status === 'FAILED' ? 'FAILED' : 'PROCESSING',
    progress: complete ? 100 : record.status === 'LEASED' ? 55 : 8,
    provider: 'molab',
    model,
    error,
    metadata: { currentStage: complete ? 'Master audio pronto' : record.status === 'LEASED' ? 'GPU: generazione in corso' : 'GPU: preparazione del job', audioFormat: 'wav', generationEngine: model },
    audioUrl: null,
    audioUrls: [],
    candidates: []
  };
}
async function signedAudio(id, env) {
  const expires = Date.now() + 30 * 60 * 1000;
  const payload = id + ':0:' + expires;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SONARA_INTERNAL_PROXY_SECRET), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  const signature = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)))).map(x => x.toString(16).padStart(2,'0')).join('');
  return 'https://api.sonaraenterprise.com/api/sonara-multi/audio/' + id + '?exp=' + expires + '&sig=' + signature;
}
async function verifySigned(id, url, env) {
  if (!env.SONARA_INTERNAL_PROXY_SECRET) return false;
  const expiry = Number(url.searchParams.get('exp'));
  if (!Number.isFinite(expiry) || expiry < Date.now() || expiry > Date.now() + 31 * 60 * 1000) return false;
  const signature = safeText(url.searchParams.get('sig'), 100);
  if (!/^[a-f0-9]{64}$/.test(signature)) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SONARA_INTERNAL_PROXY_SECRET), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  const expected = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(id + ':0:' + expiry)))).map(x => x.toString(16).padStart(2,'0')).join('');
  return constantEqual(signature, expected);
}
const postOnly = r => r.method === 'POST';
export async function handleSonaraMultiEngine(request, env, ctx) {
  const u = new URL(request.url);
  const p = u.pathname;
  const modelRequest = p === '/api/engine/generate' && request.method === 'POST';
  const isJob = /^\/api\/music\/job\/sr2_[0-9a-f-]{36}$/.test(p);
  const namespace = p.startsWith('/api/sonara-multi/');
  if (!namespace && !modelRequest && !isJob) return null;
  const bucket = env.SONARA_AUDIO_BUCKET;
  if (!bucket) return namespace ? json({ error:'Storage non configurato' }, 503) : null;
  if (modelRequest) {
    // Only intercept explicit model requests; existing ACE-Step behavior remains unchanged.
    if (!(String(request.headers.get('content-type')||'').toLowerCase().includes('application/json'))) return null;
    const payload = await readJson(request.clone(), 50_000);
    const modelId = safeText(payload?.sonaraModelId, 80);
    if (!validModel(modelId)) return null;
    if (!privileged(request, env) || !owner(request)) return json({ error:'Unauthorized multi-engine generation' }, 401);
    const caps = await agentHealth(bucket, env);
    if (!modelAllowed(modelId, caps)) return json({ error:'Il modello selezionato non è ancora attivo sulla GPU. Nessun brano creato.' }, 503);
    const duration = Number(payload.durationSec ?? payload.duration);
    if (!Number.isInteger(duration) || duration < 10 || duration > caps.models[modelId].maxSeconds) {
      return json({ error:'Durata non supportata dal modello selezionato.' }, 400);
    }
    if (modelId === 'stable-audio-3-medium' && safeText(payload.lyrics, 300)) return json({ error:'Stable Audio 3 Medium è disponibile per la generazione strumentale.' }, 400);
    const prompt = safeText(payload.prompt || payload.rawPrompt, 4000);
    if (!prompt) return json({error:'Prompt obbligatorio'},400);
    const id = 'sr2_' + crypto.randomUUID();
    const createdAt = Date.now();
    const job = {
      id, ownerUid: owner(request), modelId,
      status:'QUEUED', createdAt, updatedAt:createdAt,
      attempts:0, leaseId:null, leaseUntil:0, audioReady:false,
      request: {
        modelId, prompt,
        lyrics: safeText(payload.lyrics, 10000),
        genre: safeText(payload.genre, 120),
        subgenre: safeText(payload.subgenre, 120),
        bpm: Number(payload.bpm) || null,
        language: safeText(payload.vocalLanguage || payload.language, 30),
        durationSec:duration
      }
    };
    await bucket.put(jobKey(id), JSON.stringify(job), { httpMetadata:{contentType:'application/json'} });
    await bucket.put(queueKey(createdAt,id), id, { httpMetadata:{contentType:'text/plain'} });
    return json({ jobId:id, status:'PROCESSING', progress:0, provider:'molab', model:modelId }, 202);
  }
  if (isJob && request.method === 'GET') {
    const id = p.split('/').pop();
    const job = await readRecord(bucket, id);
    if (!job) return null; // the legacy ACE-Step queue owns every other sr2_ job
    if (!privileged(request,env) || !owner(request) || owner(request) !== job.ownerUid) return json({ error:'Not found' },404);
    const result = jobPublic(job,env);
    if (job.status === 'COMPLETE' && job.audioReady) {
      result.audioUrl = await signedAudio(id,env);
      result.audioUrls = [result.audioUrl];
      result.candidates = [{ id:'A', audioUrl:result.audioUrl, audioFormat:'wav', provider:'molab', model:job.modelId }];
    }
    return json(result);
  }
  if (p === '/api/sonara-multi/capabilities' && request.method === 'GET') return json(await agentHealth(bucket, env));
  const audioMatch = p.match(/^\/api\/sonara-multi\/audio\/(sr2_[0-9a-f-]{36})$/);
  if (audioMatch && ['GET','HEAD'].includes(request.method)) {
    const id=audioMatch[1];
    if (!(await verifySigned(id,u,env))) return json({error:'Unauthorized'},401);
    const job=await readRecord(bucket,id);
    if (!job || job.status !== 'COMPLETE' || !job.audioReady) return json({error:'Not found'},404);
    const range=request.headers.get('range');
    if (range && !/^bytes=\d+-\d*$/.test(range)) return json({error:'Unsupported range'},416);
    const head=await bucket.head(waveKey(id));
    if (!head) return json({error:'Not found'},404);
    let part = null, status=200;
    let start=0,end=head.size-1;
    if (range) {
      const m=/^bytes=(\d+)-(\d*)$/.exec(range);
      start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),head.size-1):head.size-1;
      if (start >= head.size || end < start) return json({error:'Range not satisfiable'},416);
      part={offset:start,length:end-start+1};status=206;
    }
    const headers=new Headers({'content-type':'audio/wav','cache-control':'private,max-age=300','accept-ranges':'bytes','content-length':String(end-start+1),'access-control-allow-origin':'https://sonaraenterprise.com'});
    if (part) headers.set('content-range', 'bytes '+start+'-'+end+'/'+head.size);
    if (request.method === 'HEAD') return new Response(null,{status,headers});
    const audio=await bucket.get(waveKey(id),part?{range:part}:undefined);
    if (!audio) return json({error:'Not found'},404);
    return new Response(audio.body,{status,headers});
  }
  const machinePrefix='/api/sonara-multi/agent/';
  const jobPrefix='/api/sonara-multi/job/';
  if (!p.startsWith(machinePrefix) && !p.startsWith(jobPrefix)) return namespace ? json({error:'Not found'},404) : null;
  if (!(await agentAuthorized(request,env))) return json({error:'Unauthorized'},401);
  if (!enabled(env)) return json({error:'Multi-engine disabilitato'},503);
  if (p === machinePrefix + 'heartbeat' && postOnly(request)) {
    const body=await readJson(request);
    if (!body || !body.models || typeof body.models!=='object') return json({error:'Invalid heartbeat'},400);
    const ready={
      'heartmula-3b':body.models['heartmula-3b']===true,
      'stable-audio-3-medium':body.models['stable-audio-3-medium']===true
    };
    await bucket.put(heartbeatKey, JSON.stringify({
      timestamp:Date.now(), models:ready, stableLicenseAccepted: body.stableLicenseAccepted===true,
      agentRevision:'sonara-multi-engine-v1'
    }), {httpMetadata:{contentType:'application/json'}});
    return json({ok:true,available:await agentHealth(bucket,env)});
  }
  if (p === machinePrefix + 'claim' && postOnly(request)) {
    const list=await bucket.list({prefix:PREFIX+'queue/',limit:30});
    const now=Date.now();
    for (const marker of list.objects) {
      const id=marker.key.split('/').pop();
      if (!JOB_RE.test(id)) {
        ctx?.waitUntil?.(bucket.delete(marker.key));
        continue;
      }
      const object=await bucket.get(jobKey(id));
      if (!object) {
        ctx?.waitUntil?.(bucket.delete(marker.key));
        continue;
      }
      let job;
      try { job = await object.json(); }
      catch { ctx?.waitUntil?.(bucket.delete(marker.key)); continue; }
      if (job.status === 'COMPLETE' || job.status === 'FAILED') {
        ctx?.waitUntil?.(bucket.delete(marker.key));
        continue;
      }
      const expired=job.status==='LEASED'&&Number(job.leaseUntil)<now;
      if (!(job.status==='QUEUED'||expired)) continue;
      if (job.attempts >= 3) {
        // An interrupted worker must not leave a job eternally PROCESSING.
        // Retain a FAILED record so the user's job polling can terminate.
        const failed = {...job,status:'FAILED',leaseId:null,updatedAt:now};
        await bucket.put(jobKey(id),JSON.stringify(failed),{
          onlyIf:{etagMatches:object.etag},httpMetadata:{contentType:'application/json'}
        });
        ctx?.waitUntil?.(bucket.delete(marker.key));
        continue;
      }
      const caps=await agentHealth(bucket,env);
      if (!modelAllowed(job.modelId,caps)) continue;
      const leaseId=crypto.randomUUID();
      const next={...job,status:'LEASED',leaseId,leaseUntil:now+MAX_LEASE_MS,attempts:job.attempts+1,updatedAt:now};
      const stored=await bucket.put(jobKey(id),JSON.stringify(next),{
        onlyIf:{etagMatches:object.etag},httpMetadata:{contentType:'application/json'}
      });
      if (!stored) continue;
      // Keep the queue marker until a terminal status; it allows automatic
      // recovery if MoLab stops unexpectedly before it publishes the WAV.
      return json({jobId:id,leaseId,modelId:job.modelId,request:job.request});
    }
    return json({jobId:null});
  }
  const m=p.match(/^\/api\/sonara-multi\/job\/(sr2_[0-9a-f-]{36})\/(renew|audio|complete|fail)$/);
  if (!m) return json({error:'Not found'},404);
  const [,id,action]=m;
  const job=await readRecord(bucket,id);
  if (!job || job.status!=='LEASED' || job.leaseId !== request.headers.get('X-Sonara-Lease')) return json({error:'Invalid lease'},409);
  if (action==='renew' && postOnly(request)) {
    job.leaseUntil=Date.now()+MAX_LEASE_MS;
    job.updatedAt=Date.now();
    await bucket.put(jobKey(id),JSON.stringify(job),{httpMetadata:{contentType:'application/json'}});
    return json({ok:true});
  }
  if (action==='audio' && request.method==='PUT') {
    const bytes=await request.arrayBuffer();
    const b=new Uint8Array(bytes);
    if (b.byteLength < 44 || b.byteLength > MAX_AUDIO_BYTES || String.fromCharCode(...b.subarray(0,4))!=='RIFF' || String.fromCharCode(...b.subarray(8,12))!=='WAVE') return json({error:'Invalid WAV'},415);
    await bucket.put(waveKey(id),bytes,{httpMetadata:{contentType:'audio/wav'}});
    job.audioReady=true;
    job.updatedAt=Date.now();
    await bucket.put(jobKey(id),JSON.stringify(job),{httpMetadata:{contentType:'application/json'}});
    return json({ok:true,bytes:b.byteLength});
  }
  if (action==='complete' && postOnly(request)) {
    if (!job.audioReady || !(await bucket.head(waveKey(id)))) return json({error:'Audio not uploaded'},409);
    job.status='COMPLETE';job.leaseId=null;job.updatedAt=Date.now();
    await bucket.put(jobKey(id),JSON.stringify(job),{httpMetadata:{contentType:'application/json'}});
    await bucket.delete(queueKey(job.createdAt,id));
    return json({ok:true});
  }
  if (action==='fail' && postOnly(request)) {
    job.status='FAILED';job.leaseId=null;job.updatedAt=Date.now();
    await bucket.put(jobKey(id),JSON.stringify(job),{httpMetadata:{contentType:'application/json'}});
    await bucket.delete(queueKey(job.createdAt,id));
    return json({ok:true});
  }
  return json({error:'Not found'},404);
}
