import { deriveRelayGatewayInternalKey } from './sonara-gateway-verifier.mjs';
/**
 * SONARA Remix Pro private two-source queue. Deliberately separate from the
 * existing sr2_* ACE-Step relay and its job history.
 * By default this feature is OFF until the billing gate and actual GPU worker
 * are independently verified. No client credentials authorize worker actions.
 */
export const PRO_AGENT_REVISION='sonara-remix-pro-r2-agent-v1';
const P='relay-v1/pro/';
const heartbeatKey=P+'agent/heartbeat.json';
const jobKey=id=>P+'jobs/'+id+'.json';
const queueKey=(date,id)=>P+'queue/'+String(date).padStart(13,'0')+'/'+id;
const audioKey=id=>P+'outputs/'+id+'/master.wav';
const stemKey=(id,stem)=>P+'stems/'+id+'/'+stem+'.wav';
const referenceKey=id=>'relay-v1/references/'+id+'.json';
const UUID='[0-9a-f-]{36}';
const idPattern=new RegExp('^srpro_'+UUID+'$');
const refPattern=new RegExp('^sref_'+UUID+'$');
const ROLES=new Set(['vocals-a','drums-b','bass-a','other-a']);
const STAGES=new Set(['queued','downloading','analyzing','separating','arranging','regenerating','mastering','uploading','completed','failed']);
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const fail=(message,status=400)=>json({error:message},status);
const readJson=async obj=>{try{return obj?await obj.json():null;}catch{return null;}};
const maxBytes=80*1024*1024;
const finite=(v,def,min,max)=>v===null||v===undefined||v===''?def:Number.isFinite(Number(v))?Math.min(max,Math.max(min,Number(v))):def;
const enabled=e=>e.SONARA_REMIX_PRO_ENABLED==='true'&&e.SONARA_REMIX_PRO_BILLING_READY==='true'&&e.SONARA_R2_RELAY_ENABLED==='true';
const proAgentOk=r=>r.headers.get('X-Sonara-Pro-Agent-Revision')===PRO_AGENT_REVISION;
const record=async(b,id)=>readJson(await b.get(jobKey(id)));
async function beat(b){
  const d=b?await readJson(await b.get(heartbeatKey)):null;
  const age=Date.now()-Number(d?.lastSeen||0);
  return Boolean(d?.gpuReady===true&&d?.revision===PRO_AGENT_REVISION&&age>=0&&age<30_000);
}
export async function proCapabilities(env) {
  const available=Boolean(env.SONARA_AUDIO_BUCKET)&&enabled(env)&&await beat(env.SONARA_AUDIO_BUCKET);
  return {mode:'remix-pro-private-2-source',available,engine:'Demucs 4.1 + ACE-Step XL Turbo',
    model:'htdemucs',expectedAgentRevision:PRO_AGENT_REVISION,
    requiresBillingReady:true,siteIntegrated:true};
}
async function save(b,j,conditional){
  return b.put(jobKey(j.id),JSON.stringify(j),{
    httpMetadata:{contentType:'application/json'},
    ...(conditional?{onlyIf:{etagMatches:conditional}}:{})
  });
}
function publicStatus(j){
  const id=j.id;
  return {jobId:id,status:j.status==='COMPLETE'?'COMPLETED':j.status==='FAILED'?'FAILED':'PROCESSING',
    progress:j.status==='COMPLETE'?100:j.status==='FAILED'?0:({
      queued:4,downloading:12,analyzing:24,separating:40,arranging:57,
      regenerating:72,mastering:86,uploading:93
    }[j.stage]||10),
    stage:String(j.stage||'queued'),error:j.status==='FAILED'?'Elaborazione Remix Pro non riuscita.':null,
    audioUrl:j.status==='COMPLETE'?'/api/sonara-relay/pro-job/'+id+'/audio':null,
    stems:j.status==='COMPLETE'?Object.keys(j.stems||{}).filter(k=>ROLES.has(k)).map(role=>({
      role,url:'/api/sonara-relay/pro-job/'+id+'/stem/'+role
    })):[]};
}
async function ownedReference(b,id,uid) {
  if(!refPattern.test(id))return null;
  const meta=await readJson(await b.get(referenceKey(id)));
  if(!meta||meta.id!==id||meta.ownerUid!==uid||Number(meta.expiresAt||0)<Date.now())return null;
  if(meta.objectKey!=='relay-v1/references/'+id+'/source')return null;
  if(!['audio/wav','audio/x-wav','audio/wave'].includes(String(meta.contentType||'').toLowerCase()))return null;
  const head=await b.head(meta.objectKey);
  if(!head||head.size<44||head.size>maxBytes)return null;
  return {id,objectKey:meta.objectKey,bytes:head.size};
}
// Private, signed Durable Object settlement, never callable by customers.
async function proQuota(env, action, jobId, ownerUid='', seconds=0) {
  if (!env.SONARA_AUTH) return false;
  try {
    const secret = await deriveRelayGatewayInternalKey(env);
    const stub = env.SONARA_AUTH.get(env.SONARA_AUTH.idFromName('sonara-auth-global-v1'));
    const response = await stub.fetch(new Request(
      'https://sonara.internal/__sonara_internal/remix-pro-usage', {
        method: 'POST',
        headers: {'content-type':'application/json','X-Sonara-Internal-Secret':secret},
        body:JSON.stringify({action,jobId,ownerUid,seconds})
      }
    ));
    return response.ok && (await response.json().catch(()=>({}))).ok===true;
  } catch { return false; }
}
async function enqueue(req,e,auth,b) {
  if(!auth.gateway(req,e))return fail('Unauthorized',401);
  if(!enabled(e))return fail('Remix Pro non ancora abilitato per la fatturazione.',503);
  if(!(await beat(b)))return fail('Agente Remix Pro GPU non collegato.',503);
  const uid=auth.gatewayOwner(req);
  if(!uid)return fail('Owner missing',401);
  const raw=await req.text();
  if(raw.length>35_000)return fail('Payload too large',413);
  let body;try{body=JSON.parse(raw);}catch{return fail('Invalid JSON');}
  if(!body||typeof body!=='object'||Array.isArray(body))return fail('Invalid JSON');
  const id=String(body.jobId||'');
  const duration=Number(body.durationSec);
  if(!idPattern.test(id)||!Number.isInteger(duration)||duration<10||duration>120)
    return fail('Prenotazione e durata Remix Pro non valide.',400);
  // The job id must be allocated by the authenticated native billing gateway.
  if(await b.head(jobKey(id)))return fail('Job gia accodato.',409);
  if(body.rightsConfirmed!==true)return fail('Conferma i diritti di utilizzo dei due brani.');
  const a=String(body.sourceA||''),c=String(body.sourceB||'');
  if(a===c)return fail('Seleziona due sorgenti differenti.');
  const refs=await Promise.all([ownedReference(b,a,uid),ownedReference(b,c,uid)]);
  if(refs.some(v=>!v))return fail('Una sorgente non è tua, è scaduta oppure non è un WAV valido.',404);
if(!(await proQuota(e,'verify',id,uid,duration)))return fail('Quota Remix Pro non prenotata.',409);
  const jobs=await b.list({prefix:P+'jobs/',limit:100});
  for(const item of jobs.objects||[]) {
    const old=await readJson(await b.get(item.key));
    if(old?.ownerUid===uid&&old?.kind==='sonara-remix-pro'&&
       (old.status==='QUEUED'||old.status==='LEASED'))return fail('Hai già un Remix Pro in corso. Verifica prima quel job.',409);
  }
  const now=Date.now();
  // A PREPARING record is never claimable; a failed enqueue may be refunded.
  const j={kind:'sonara-remix-pro',id,ownerUid:uid,status:'PREPARING',stage:'queued',attempts:0,
    leaseId:null,leaseUntil:0,createdAt:now,updatedAt:now,
    sourceA:refs[0],sourceB:refs[1],audio:null,stems:{},
    params:{
      prompt:String(body.prompt||'').trim().slice(0,6500),
      durationSec:duration,
      bpmA:body.bpmA===null||body.bpmA===undefined||body.bpmA===''?null:finite(body.bpmA,null,55,200),
      bpmB:body.bpmB===null||body.bpmB===undefined||body.bpmB===''?null:finite(body.bpmB,null,55,200),
      bassFrom:body.bassFrom==='b'?'b':'a',
      coverStrength:finite(body.coverStrength,.76,.35,.92),
      coverNoise:finite(body.coverNoise,.14,.04,.3),
      key:String(body.key||'').slice(0,40)
    }};
  if(!j.params.prompt)return fail('Scrivi il prompt del Remix Pro.');
  const saved=await save(b,j);
  if(!saved)return fail('Impossibile registrare il job.',503);
  try {
    await b.put(queueKey(now,id),id,{httpMetadata:{contentType:'text/plain'}});
    const current=await b.get(jobKey(id));
    if(!current) return fail('Job preparation lost',503);
    j.status='QUEUED';
    if(!(await save(b,j,current.etag)))return fail('Job activation failed',503);
  } catch { return fail('Job preparation failed',503); }
  return json({...publicStatus(j),model:'Demucs+ACE-Step-XL-Turbo'},202);
}
async function claim(e,b,ctx){
  const now=Date.now();
  async function tryObject(obj) {
    if(!obj)return null;
    const j=await readJson(obj);
    if(!j||j.kind!=='sonara-remix-pro'||!idPattern.test(j.id))return null;
    const expired=j.status==='LEASED'&&j.leaseUntil<now;
    const queueExpired=j.status==='QUEUED'&&now-Number(j.createdAt||0)>2*60*60*1000;
    if(queueExpired||(expired&&j.attempts>=3)){
      // Mark the record FAILED with conditional R2 write before any refund.
      // Otherwise a concurrent lease may still execute a refunded job.
      const failed={...j,status:'FAILED',stage:'failed',leaseId:null,
        leaseUntil:0,updatedAt:now,params:null,sourceA:null,sourceB:null};
      const updated=await save(b,failed,obj.etag);
      if(updated) await proQuota(e,'refund',j.id,j.ownerUid);
      return null;
    }
    if(!((j.status==='QUEUED')||expired)||j.attempts>=3)return null;
    const leaseId=crypto.randomUUID();
    const updated={...j,status:'LEASED',attempts:j.attempts+1,leaseId,
      leaseUntil:now+15*60*1000,updatedAt:now,stage:'downloading'};
    const ok=await save(b,updated,obj.etag);
    if(!ok)return null;
    return {jobId:j.id,leaseId,params:j.params};
  }
  const index=await b.list({prefix:P+'queue/',limit:64});
  for(const marker of index.objects||[]){
    const id=String(marker.key).split('/').pop();
    if(!idPattern.test(id))continue;
    const claimed=await tryObject(await b.get(jobKey(id)));
    if(claimed){ctx?.waitUntil?.(b.delete(marker.key));return claimed;}
    const j=await record(b,id);
    if(j&&(j.status==='COMPLETE'||j.status==='FAILED'))ctx?.waitUntil?.(b.delete(marker.key));
  }
  // Recovery of abandoned leases, only from this independent PRO queue.
  const all=await b.list({prefix:P+'jobs/',limit:100});
  for(const obj of all.objects||[]){
    const claimed=await tryObject(await b.get(obj.key));
    if(claimed)return claimed;
  }
  return {jobId:null};
}
async function privateAudio(req,b,key) {
  const head=await b.head(key);
  if(!head)return fail('File non trovato',404);
  const range=String(req.headers.get('range')||'');
  if(range){
    const m=/^bytes=(\d*)-(\d*)$/.exec(range);
    if(!m||(m[1]===''&&m[2]===''))return fail('Invalid Range',416);
    let start=m[1]!==''?Number(m[1]):Math.max(0,head.size-Number(m[2]));
    let end=m[2]!==''&&m[1]!==''?Math.min(Number(m[2]),head.size-1):head.size-1;
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start> end||start>=head.size)return fail('Range not satisfiable',416);
    const obj=await b.get(key,{range:{offset:start,length:end-start+1}});
    if(!obj)return fail('File non trovato',404);
    return new Response(obj.body,{status:206,headers:{'content-type':'audio/wav','cache-control':'private,no-store',
      'accept-ranges':'bytes','content-range':`bytes ${start}-${end}/${head.size}`,'content-length':String(end-start+1)}});
  }
  const obj=await b.get(key);
  return obj?new Response(obj.body,{headers:{'content-type':'audio/wav','cache-control':'private,no-store',
    'content-length':String(head.size),'accept-ranges':'bytes'}}):fail('File non trovato',404);
}
export async function handleRemixPro(req,env,ctx,auth) {
  const p=new URL(req.url).pathname,b=env.SONARA_AUDIO_BUCKET;
  if(p==='/api/sonara-relay/pro-capabilities'&&req.method==='GET')
    return json(await proCapabilities(env));
  if(!b)return fail('Private storage unavailable',503);
  if(p==='/api/sonara-relay/pro-enqueue'&&req.method==='POST')
    return enqueue(req,env,auth,b);
  if(p==='/api/sonara-relay/pro-heartbeat'&&req.method==='POST') {
    if(!(await auth.agent(req,env))||!proAgentOk(req))return fail('Unauthorized agent',401);
    const payload=await req.json().catch(()=>({}));
    if(payload?.gpuReady!==true)return fail('GPU verification required',409);
    await b.put(heartbeatKey,JSON.stringify({revision:PRO_AGENT_REVISION,gpuReady:true,lastSeen:Date.now()}));
    return json({authenticated:true,revision:PRO_AGENT_REVISION});
  }
  if(p==='/api/sonara-relay/pro-claim'&&req.method==='POST'){
    if(!(await auth.agent(req,env))||!proAgentOk(req))return fail('Unauthorized agent',401);
    if(!enabled(env))return fail('Remix Pro disabled',503);
    return json(await claim(env,b,ctx));
  }
  const match=p.match(/^\/api\/sonara-relay\/pro-job\/(srpro_[0-9a-f-]{36})(?:\/(.+))?$/);
  if(!match)return fail('Not found',404);
  const id=match[1],action=match[2]||'',obj=await b.get(jobKey(id)),j=await readJson(obj);
  if(!j||j.kind!=='sonara-remix-pro')return fail('Not found',404);
  if(req.method==='GET'&&(action===''||action==='audio'||/^stem\//.test(action))) {
    const user=await auth.user(req,env);
    if(!user||user.uid!==j.ownerUid)return fail('Not found',404);
    if(action==='')return json(publicStatus(j));
    if(j.status!=='COMPLETE')return fail('Audio non ancora pronto',409);
    if(action==='audio')return privateAudio(req,b,audioKey(id));
    const role=action.slice(5);
    if(!ROLES.has(role)||!j.stems?.[role])return fail('Stem non trovato',404);
    return privateAudio(req,b,stemKey(id,role));
  }
  if(!(await auth.agent(req,env))||!proAgentOk(req))return fail('Unauthorized agent',401);
  if(j.status!=='LEASED'||String(req.headers.get('X-Sonara-Pro-Lease')||'')!==j.leaseId||
     j.leaseUntil<Date.now())return fail('Invalid or expired lease',409);
  if(req.method==='GET'&&(action==='source/a'||action==='source/b')) {
    const src=action==='source/a'?j.sourceA:j.sourceB;
    return privateAudio(req,b,src.objectKey);
  }
  if(action==='renew'&&req.method==='POST'){
    j.leaseUntil=Date.now()+15*60*1000;j.updatedAt=Date.now();
    const ok=await save(b,j,obj.etag);
    return ok?json({ok:true}):fail('Retry lease',409);
  }
  if(action==='progress'&&req.method==='POST'){
    const d=await req.json().catch(()=>({}));
    if(!STAGES.has(d.stage))return fail('Invalid stage');
    j.stage=d.stage;j.updatedAt=Date.now();
    return (await save(b,j,obj.etag))?json({ok:true}):fail('Retry progress',409);
  }
  const uploadRole=action.startsWith('stem/')?action.slice(5):null;
  if(req.method==='PUT'&&(action==='audio'||ROLES.has(uploadRole))){
    if(!req.body||Number(req.headers.get('content-length')||0)>maxBytes)return fail('Invalid upload',413);
    const key=action==='audio'?audioKey(id):stemKey(id,uploadRole);
    await b.put(key,req.body,{httpMetadata:{contentType:'audio/wav'}});
    const head=await b.head(key);
    if(!head||head.size<44||head.size>maxBytes){await b.delete(key);return fail('Invalid WAV upload length',413);}
    const next=await b.get(jobKey(id)),latest=await readJson(next);
    if(latest?.leaseId!==j.leaseId||latest?.status!=='LEASED')return fail('Lease lost',409);
    if(action==='audio')latest.audio=key;
    else latest.stems[uploadRole]=key;
    latest.updatedAt=Date.now();
    return (await save(b,latest,next.etag))?json({ok:true}):fail('Retry artifact confirmation',409);
  }
  if(req.method==='POST'&&(action==='complete'||action==='fail')){
    if(action==='complete'&&(!j.audio||!await b.head(j.audio)))return fail('Final WAV required',409);
    // The terminal R2 state is written first, so a lease can never
    // produce audio after its reservation has been refunded.
    const next={...j,status:action==='complete'?'COMPLETE':'FAILED',
      stage:action==='complete'?'completed':'failed',leaseUntil:0,
      leaseId:null,updatedAt:Date.now(),params:null,sourceA:null,sourceB:null};
    const sources=[j.sourceA,j.sourceB];
    const ok=await save(b,next,obj.etag);
    if(!ok)return fail('Retry completion',409);
    // If settlement fails, Durable Object alarm will detect terminal R2
    // status and settle the reservation asynchronously.
    if(!(await proQuota(env,action==='complete'?'commit':'refund',id,j.ownerUid)))
      return fail('Quota reconciliation pending; job saved',503);
    await Promise.all(sources.map(async src=>{
      if(!src?.objectKey)return;
      await Promise.all([b.delete(src.objectKey),b.delete(referenceKey(src.id))]);
    })).catch(()=>undefined);
    return json({ok:true});
  }
  return fail('Method not supported',405);
}
