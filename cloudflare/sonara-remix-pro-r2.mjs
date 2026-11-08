import { deriveRelayGatewayInternalKey } from './sonara-gateway-verifier.mjs';
import {audioFormatForName,audioContentType} from './sonara-remix-pro-audio-formats.mjs';
/**
 * SONARA Remix Pro private two-source queue. Deliberately separate from the
 * existing sr2_* ACE-Step relay and its job history.
 * By default this feature is OFF until the billing gate and actual GPU worker
 * are independently verified. No client credentials authorize worker actions.
 */
export const PRO_AGENT_REVISION='sonara-remix-pro-r2-agent-v3-dual-reference-fusion';
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
const FAILURE_NOTICES=Object.freeze({
  SOURCE_HTTP_401:'Accesso al download audio rifiutato (401): controlla l’autenticazione dell’agente GPU.',
  SOURCE_HTTP_403:'Download audio bloccato (403): verifica il relay MoLab / Cloudflare.',
  SOURCE_HTTP_404:'Sorgente audio non trovata in R2 (404): ricarica entrambi i brani.',
  SOURCE_HTTP_409:'Download audio bloccato da lease non valido (409): controlla l’agente GPU.',
  SOURCE_HTTP_429:'Download audio limitato temporaneamente (429): riprova più tardi.',
  SOURCE_HTTP_500:'Errore temporaneo del servizio audio (500).',
  SOURCE_HTTP_502:'Errore temporaneo del servizio audio (502).',
  SOURCE_HTTP_503:'Servizio audio temporaneamente non disponibile (503).',
  SOURCE_HTTP_504:'Timeout temporaneo del servizio audio (504).',
  SOURCE_NETWORK_ERROR:'Connessione MoLab-R2 interrotta durante il download audio.',
  SOURCE_INVALID_AUDIO:'Audio sorgente non leggibile: prova WAV PCM/float mono o stereo, 10-900 secondi.',
  SOURCE_UNREADABLE_AUDIO:'File audio danneggiato o non decodificabile. Riesporta il brano e caricalo nuovamente.',
  SOURCE_DURATION_TOO_SHORT:'Brano troppo corto: occorrono almeno 10 secondi di audio.',
  SOURCE_DURATION_TOO_LONG:'Brano troppo lungo: massimo 15 minuti per sorgente.',
  SOURCE_CHANNELS_UNSUPPORTED:'Canali audio non supportati: utilizza mono, stereo o fino a 8 canali convertibili.',
  SOURCE_SAMPLERATE_UNSUPPORTED:'Frequenza di campionamento non supportata: utilizza audio tra 8 e 192 kHz.',
  SOURCE_STREAM_UNSUPPORTED:'File non supportato: deve contenere una sola traccia audio, senza video.',
  SOURCE_DECODER_UNAVAILABLE:'Decodifica audio non disponibile sull’agente GPU (FFmpeg/FFprobe).',
  SOURCE_DECODER_FAILED:'Impossibile decodificare l’audio sorgente: controlla formato e durata.',
  SOURCE_OVERSIZE:'File audio sorgente oltre il limite di 512 MiB.',
  SOURCE_TRANSFER_INVALID:'Download audio incompleto o non valido, senza riutilizzare file parziali.',
  REMIX_INVALID_DURATION:'Durata Remix non valida: seleziona da 0:30 a 8:00 in passi da 30 secondi.',
  REMIX_DURATION_MISMATCH:'Il motore non ha prodotto un unico brano A+B della durata scelta. Nessun risultato incompleto è stato pubblicato.',
  REMIX_PROCESSING_ERROR:'Errore durante l’elaborazione audio GPU. Verifica lo stato dell’agente MoLab.'
});
const FAILURE_PHASES=new Set(['source_a','source_b','normalize_a','normalize_b','processing']);
const failureExplanation=(j)=>{
  const notice=FAILURE_NOTICES[j?.failureCode];
  if(!notice)return 'Elaborazione Remix Pro non riuscita. Verifica il log diagnostico GPU.';
  const phase=({source_a:'Brano A',source_b:'Brano B',normalize_a:'Decodifica A',
    normalize_b:'Decodifica B'})[j?.failurePhase];
  return (phase?phase+': ':'')+notice;
};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const fail=(message,status=400)=>json({error:message},status);
const readJson=async obj=>{try{return obj?await obj.json():null;}catch{return null;}};
const maxBytes=512*1024*1024;
const partBytes=8*1024*1024;
const partMax=64;
const uploadMarker=(id,role)=>P+'uploads/'+id+'/'+role+'.json';
const finite=(v,def,min,max)=>v===null||v===undefined||v===''?def:Number.isFinite(Number(v))?Math.min(max,Math.max(min,Number(v))):def;
const enabled=e=>e.SONARA_REMIX_PRO_ENABLED==='true'&&e.SONARA_REMIX_PRO_BILLING_READY==='true'&&e.SONARA_R2_RELAY_ENABLED==='true';
const proAgentOk=r=>r.headers.get('X-Sonara-Pro-Agent-Revision')===PRO_AGENT_REVISION;
const record=async(b,id)=>readJson(await b.get(jobKey(id)));
async function gpuState(b){
  const d=b?await readJson(await b.get(heartbeatKey)):null;
  const age=Date.now()-Number(d?.lastSeen||0);
  return {ready:Boolean(d?.gpuReady===true&&d?.revision===PRO_AGENT_REVISION&&age>=0&&age<30_000),
    formatsReady:d?.formatsReady===true};
}
async function beat(b){
  const d=b?await readJson(await b.get(heartbeatKey)):null;
  const age=Date.now()-Number(d?.lastSeen||0);
  return Boolean(d?.gpuReady===true&&d?.revision===PRO_AGENT_REVISION&&age>=0&&age<30_000);
}
export async function proCapabilities(env) {
  const available=Boolean(env.SONARA_AUDIO_BUCKET)&&enabled(env)&&await beat(env.SONARA_AUDIO_BUCKET);
  const gpu=await gpuState(env.SONARA_AUDIO_BUCKET);
  return {mode:'remix-pro-private-2-source',available,engine:'Demucs 4.1 + ACE-Step XL Turbo',
    model:'htdemucs',expectedAgentRevision:PRO_AGENT_REVISION,
    multiformatAvailable:available&&gpu.formatsReady,
    formats:['wav','mp3','flac','m4a','mp4','aac','ogg','oga','opus','aif','aiff','aifc','webm','wma','caf','amr','ac3'],
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
    requestedDurationSeconds:Number(j.durationSeconds||j.params?.durationSec||0),
    ...(Number.isFinite(Number(j.actualDurationSeconds)) && Number(j.actualDurationSeconds)>0
       ? {actualDurationSeconds:Number(j.actualDurationSeconds)} : {}),
    progress:j.status==='COMPLETE'?100:j.status==='FAILED'?0:({
      queued:4,downloading:12,analyzing:24,separating:40,arranging:57,
      regenerating:72,mastering:86,uploading:93
    }[j.stage]||10),
    stage:String(j.stage||'queued'),error:j.status==='FAILED'?failureExplanation(j):null,
    ...(j.status==='FAILED'&&FAILURE_NOTICES[j.failureCode]?{errorCode:j.failureCode,failurePhase:j.failurePhase}:{}),
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
  const fmt=meta.format||((meta.filename||'').toLowerCase().endsWith('.wav')?'wav':null);
  if(!fmt||!audioContentType(fmt))return null;
  if(fmt==='wav'&&!['audio/wav','audio/x-wav','audio/wave'].includes(String(meta.contentType||'').toLowerCase()))return null;
  if(fmt!=='wav'&&meta.contentType!==audioContentType(fmt))return null;
  const head=await b.head(meta.objectKey);
  if(!head||head.size<44||head.size>maxBytes)return null;
  return {id,objectKey:meta.objectKey,bytes:head.size,format:fmt};
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
  if(!idPattern.test(id)||!Number.isInteger(duration)||duration<30||duration>480)
    return fail('Prenotazione e durata Remix Pro non valide.',400);
  // The job id must be allocated by the authenticated native billing gateway.
  if(await b.head(jobKey(id)))return fail('Job gia accodato.',409);
  if(body.rightsConfirmed!==true)return fail('Conferma i diritti di utilizzo dei due brani.');
  const a=String(body.sourceA||''),c=String(body.sourceB||'');
  if(a===c)return fail('Seleziona due sorgenti differenti.');
  const refs=await Promise.all([ownedReference(b,a,uid),ownedReference(b,c,uid)]);
  if(refs.some(v=>!v))return fail('Una sorgente non è tua, è scaduta oppure non è un audio supportato.',404);
  if(refs.some(v=>v.format!=='wav')&&!(await gpuState(b)).formatsReady)
    return fail('Agente GPU multiformato non ancora aggiornato. I WAV restano disponibili.',503);
if(!(await proQuota(e,'verify',id,uid,duration)))return fail('Registrazione privata Remix Pro non valida.',409);
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
    sourceA:refs[0],sourceB:refs[1],audio:null,stems:{},durationSeconds:duration,
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
    return {jobId:j.id,leaseId,params:j.params,sourceFormatA:j.sourceA?.format||'wav',sourceFormatB:j.sourceB?.format||'wav'};
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
async function privateAudio(req,b,key,format='wav') {
  const mime=audioContentType(format)||'audio/wav';
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
    return new Response(obj.body,{status:206,headers:{'content-type':mime,'cache-control':'private,no-store',
      'accept-ranges':'bytes','content-range':`bytes ${start}-${end}/${head.size}`,'content-length':String(end-start+1)}});
  }
  const obj=await b.get(key);
  return obj?new Response(obj.body,{headers:{'content-type':mime,'cache-control':'private,no-store',
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
    await b.put(heartbeatKey,JSON.stringify({revision:PRO_AGENT_REVISION,gpuReady:true,
      formatsReady:payload?.formatsReady===true,lastSeen:Date.now()}));
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
    return privateAudio(req,b,src.objectKey,src.format);
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
  // Long outputs and stems use the same private, lease-verified R2
  // multipart API. No large WAV is buffered in a single Worker request.
  const multi=action.match(/^(audio|stem\/(?:vocals-a|drums-b|bass-a|other-a))\/(start|part\/(\d{1,3})|finish)$/);
  if(multi) {
    const role=multi[1],kind=multi[2],tag=role.replace('/','-');
    const output=role==='audio'?audioKey(id):stemKey(id,role.slice(5));
    const stateKey=uploadMarker(id,tag);
    if(kind==='start'&&req.method==='POST') {
      const body=await req.json().catch(()=>null),size=Number(body?.bytes);
      if(!Number.isSafeInteger(size)||size<44||size>maxBytes)return fail('Invalid long WAV size',413);
      const parts=Math.ceil(size/partBytes);
      if(parts>partMax)return fail('Too many WAV parts',413);
      if(await b.head(stateKey))return fail('Upload already in progress',409);
      const upload=await b.createMultipartUpload(output,{httpMetadata:{contentType:'audio/wav'}});
      await b.put(stateKey,JSON.stringify({ownerUid:j.ownerUid,leaseId:j.leaseId,
        id,output,uploadId:upload.uploadId,size,parts,startedAt:Date.now()}));
      return json({partBytes,parts});
    }
    const current=await readJson(await b.get(stateKey));
    if(!current||current.id!==id||current.leaseId!==j.leaseId||
       current.ownerUid!==j.ownerUid||current.output!==output)
      return fail('Upload not found or lease changed',409);
    const multipart=b.resumeMultipartUpload(output,current.uploadId);
    if(kind.startsWith('part/')&&req.method==='PUT'){
      const n=Number(multi[3]);
      if(!Number.isInteger(n)||n<1||n>current.parts)return fail('Invalid part',400);
      const expected=n===current.parts?current.size-(n-1)*partBytes:partBytes;
      const data=await req.arrayBuffer();
      if(data.byteLength!==expected)return fail('Unexpected part length',400);
      if(n===1){
        const head=new Uint8Array(data.slice(0,12));
        if(String.fromCharCode(...head.slice(0,4))!=='RIFF'||
           String.fromCharCode(...head.slice(8,12))!=='WAVE')
          return fail('Real WAV required',415);
      }
      const result=await multipart.uploadPart(n,data);
      return json({partNumber:n,etag:result.etag});
    }
    if(kind==='finish'&&req.method==='POST'){
      const body=await req.json().catch(()=>null),parts=body?.parts;
      if(!Array.isArray(parts)||parts.length!==current.parts||
         !parts.every((p,k)=>p?.partNumber===k+1&&typeof p.etag==='string'&&p.etag.length>0&&p.etag.length<200))
        return fail('Incomplete multipart WAV',400);
      const existing=await b.head(output);
      if(!existing||existing.size!==current.size){
        try {await multipart.complete(parts);} catch {return fail('Multipart finalization failed',503);}
      }
      const head=await b.head(output);
      if(!head||head.size!==current.size)return fail('WAV size mismatch',503);
      // The lease renewer may update the same R2 job during a long upload.
      // Retry the metadata CAS without attempting to re-complete multipart.
      let recorded=false;
      for(let attempt=0;attempt<6;attempt++){
        const obj=await b.get(jobKey(id)),latest=await readJson(obj);
        if(latest?.status!=='LEASED'||latest.leaseId!==j.leaseId)return fail('Lease lost',409);
        if(role==='audio')latest.audio=output;
        else latest.stems[role.slice(5)]=output;
        latest.updatedAt=Date.now();
        if(await save(b,latest,obj.etag)){recorded=true;break;}
      }
      if(!recorded)return fail('Retry artifact confirmation',409);
      await b.delete(stateKey);
      return json({ok:true});
    }
    return fail('Method unsupported',405);
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
    // Only safe fixed-code diagnostics may be stored or shown to the owner.
    // Never store upstream responses, file paths, token values or audio content.
    const reported=await req.json().catch(()=>({}));
    // New agents provide measured duration. A mismatch rejects completion.
    // Omission is allowed for older in-flight jobs during guarded rollout.
    const claimedDuration=Number(reported?.actualDurationSeconds);
    const selectedDuration=Number(j.durationSeconds||j.params?.durationSec);
    if(action==='complete' && reported?.actualDurationSeconds!==undefined &&
       (!Number.isFinite(claimedDuration) ||
        !Number.isFinite(selectedDuration) ||
        Math.abs(claimedDuration-selectedDuration)>0.10))
      return fail('Durata del master diversa dalla selezione Remix Pro.',409);
    const failureCode=typeof reported?.errorCode==='string'&&
      Object.hasOwn(FAILURE_NOTICES,reported.errorCode)?reported.errorCode:null;
    const failurePhase=FAILURE_PHASES.has(reported?.failurePhase)?
      reported.failurePhase:null;
    // The terminal R2 state is written first, so a lease can never
    // produce audio after its reservation has been refunded.
    const next={...j,status:action==='complete'?'COMPLETE':'FAILED',
      stage:action==='complete'?'completed':'failed',leaseUntil:0,
      leaseId:null,updatedAt:Date.now(),params:null,sourceA:null,sourceB:null,
      ...(action==='complete'&&reported?.actualDurationSeconds!==undefined
         ? {actualDurationSeconds:claimedDuration} : {}),
      ...(action==='fail'?{failureCode,failurePhase}:{})};
    const sources=[j.sourceA,j.sourceB];
    const ok=await save(b,next,obj.etag);
    if(!ok)return fail('Retry completion',409);
    // Once R2 records COMPLETE/FAILED, the agent must not mistake a
    // temporarily unavailable quota ledger for a failed render. The Durable
    // Object alarm will idempotently settle the terminal R2 state.
    const settled=await proQuota(env,action==='complete'?'commit':'refund',id,j.ownerUid);
    await Promise.allSettled(sources.map(async src=>{
      if(!src?.objectKey)return;
      await Promise.all([b.delete(src.objectKey),b.delete(referenceKey(src.id))]);
    }));
    return json({ok:true,settlementPending:!settled},settled?200:202);
  }
  return fail('Method not supported',405);
}
