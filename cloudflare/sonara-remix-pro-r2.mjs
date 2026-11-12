import { deriveRelayGatewayInternalKey } from './sonara-gateway-verifier.mjs';
import { parseV6Controls } from './sonara-remix-pro-v6-controls.mjs';
import {audioFormatForName,audioContentType} from './sonara-remix-pro-audio-formats.mjs';
/**
 * SONARA Remix Pro private two-source queue. Deliberately separate from the
 * existing sr2_* ACE-Step relay and its job history.
 * By default this feature is OFF until the billing gate and actual GPU worker
 * are independently verified. No client credentials authorize worker actions.
 */
export const PRO_AGENT_REVISION='sonara-remix-pro-r2-agent-v3-dual-reference-fusion';
const LEGACY_AGENT_REVISION='sonara-remix-pro-r2-agent-v2-longwav';
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
  SOURCE_STREAM_UNSUPPORTED:'Il file non contiene una traccia audio utilizzabile. Sono ammessi anche video musicali con audio.',
  SOURCE_DECODER_UNAVAILABLE:'Decodifica audio non disponibile sull’agente GPU (FFmpeg/FFprobe).',
  SOURCE_DECODER_FAILED:'Impossibile decodificare l’audio sorgente: controlla formato e durata.',
  SOURCE_OVERSIZE:'File audio sorgente oltre il limite di 512 MiB.',
  SOURCE_TRANSFER_INVALID:'Download audio incompleto o non valido, senza riutilizzare file parziali.',
  REMIX_INVALID_DURATION:'Durata Remix non valida: seleziona da 0:30 a 8:00 in passi da 30 secondi.',
  REMIX_DURATION_MISMATCH:'Il motore non ha prodotto un unico brano A+B della durata scelta. Nessun risultato incompleto è stato pubblicato.',
  REMIX_ANALYSIS_FAILED:'Analisi dei due brani non riuscita sul worker MoLab. Nessun remix incompleto è stato pubblicato.',
  REMIX_DEMUCS_FAILED:'Separazione strumenti Demucs non riuscita sulla GPU. Controllare il modello e i codec audio su MoLab.',
  REMIX_FUSION_PLAN_FAILED:'Impossibile preparare la fusione A+B: i riferimenti musicali non sono utilizzabili.',
  REMIX_ACE_STEP_FAILED:'ACE-Step non ha completato la generazione dell’accompagnamento. Controlla lo stato del modello e del task GPU.',
  REMIX_VOCAL_FUSION_FAILED:'ACE-Step potrebbe aver generato l’audio, ma la fusione delle voci originali A+B o il mix House non è riuscito. Nessun master incompleto è stato pubblicato.',
  REMIX_MASTERING_FAILED:'Mastering audio non riuscito sul worker MoLab.',
  REMIX_AUDIO_QUALITY_REJECTED:'Il remix generato non ha superato i controlli tecnici di qualità; il file non è stato pubblicato.',
  REMIX_UPLOAD_FAILED:'Il remix è stato elaborato ma il trasferimento audio privato in Cloudflare R2 non è riuscito.',
  REMIX_COMPLETION_FAILED:'Il master non è stato confermato dal gateway prima della scadenza del lavoro.',
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
const leaseReceiptHash=async lease=>{
  const bytes=new TextEncoder().encode(lease);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
};
const readJson=async obj=>{try{return obj?await obj.json():null;}catch{return null;}};
const maxBytes=512*1024*1024;
const partBytes=8*1024*1024;
const partMax=64;
const uploadMarker=(id,role)=>P+'uploads/'+id+'/'+role+'.json';
const finite=(v,def,min,max)=>v===null||v===undefined||v===''?def:Number.isFinite(Number(v))?Math.min(max,Math.max(min,Number(v))):def;
const enabled=e=>e.SONARA_REMIX_PRO_ENABLED==='true'&&e.SONARA_REMIX_PRO_BILLING_READY==='true'&&e.SONARA_R2_RELAY_ENABLED==='true';
const agentRevision=r=>String(r.headers.get('X-Sonara-Pro-Agent-Revision')||'');
const proAgentOk=r=>[PRO_AGENT_REVISION,LEGACY_AGENT_REVISION].includes(agentRevision(r));
const record=async(b,id)=>readJson(await b.get(jobKey(id)));
// Per-account, R2-backed archive. Only the authenticated owner may query it.
// A one-time, cursor-bounded migration discovers masters created before the
// archive index existed, without ever returning another user's job.
const libraryOwnerPrefix=async uid=>P+'library/'+await leaseReceiptHash('owner:'+uid)+'/';
const libraryIndexKey=async(uid,j)=>{
  const stamp=Math.max(0,9999999999999-Math.max(0,Number(j.createdAt)||0));
  return (await libraryOwnerPrefix(uid))+String(stamp).padStart(13,'0')+'-'+j.id+'.json';
};
const libraryMigrationKey=async uid=>P+'library-migration/'+await leaseReceiptHash('owner:'+uid)+'.json';
const safeTitle=text=>String(text||'').replace(/[\u0000-\u001f\u007f<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,96);
async function saveLibraryIndex(b,j){
  if(!j?.ownerUid||!idPattern.test(j.id))return;
  await b.put(await libraryIndexKey(j.ownerUid,j),
    JSON.stringify({jobId:j.id,createdAt:j.createdAt}),
    {httpMetadata:{contentType:'application/json'}});
}
async function ownerLibrary(req,e,b,auth){
  const user=await auth.user(req,e);
  if(!user?.uid)return fail('Accedi per consultare il tuo archivio Remix Pro.',401);
  const uid=user.uid,url=new URL(req.url),prefix=await libraryOwnerPrefix(uid);
  // Backfill at most one R2 page per request. The cursor is stored privately,
  // so repeated archive opens gradually discover historic masters.
  const migrationKey=await libraryMigrationKey(uid);
  let migration=await readJson(await b.get(migrationKey))||{done:false};
  if(!migration.done){
    try {
      const page=await b.list({prefix:P+'jobs/',limit:75,
        ...(migration.cursor?{cursor:migration.cursor}:{})});
      for(const obj of page.objects||[]){
        const j=await readJson(await b.get(obj.key));
        if(j?.kind==='sonara-remix-pro'&&j.ownerUid===uid&&
           j.status==='COMPLETE'&&idPattern.test(j.id)&&await b.head(audioKey(j.id)))
          await saveLibraryIndex(b,j);
      }
      migration=page.truncated&&typeof page.cursor==='string'&&page.cursor
        ? {done:false,cursor:page.cursor}:{done:true};
      await b.put(migrationKey,JSON.stringify(migration),
        {httpMetadata:{contentType:'application/json'}});
    } catch { migration={done:false}; }
  }
  const cursor=String(url.searchParams.get('cursor')||'');
  if(cursor.length>250)return fail('Invalid archive cursor',400);
  const index=await b.list({prefix,limit:100,...(cursor?{cursor}:{})});
  const jobs=[];
  for(const item of index.objects||[]){
    const marker=await readJson(await b.get(item.key));
    if(!idPattern.test(String(marker?.jobId||'')))continue;
    const j=await record(b,marker.jobId);
    if(j?.ownerUid!==uid||j?.kind!=='sonara-remix-pro'||j.status!=='COMPLETE')continue;
    // Do not show ghost masters or expose object keys.
    if(!await b.head(audioKey(j.id)))continue;
    jobs.push({...publicStatus(j),title:safeTitle(j.title)||'Remix Pro '+j.id.slice(6,14),
      createdAt:Number(j.createdAt)||0,updatedAt:Number(j.updatedAt)||0,
      engineVersion:j.engineVersion||'legacy'});
    if(jobs.length>=40)break;
  }
  return json({jobs,hasMore:index.truncated===true,
    nextCursor:index.truncated===true?String(index.cursor||''):null,
    legacyScanIncomplete:!migration.done});
}
async function gpuState(b){
  const d=b?await readJson(await b.get(heartbeatKey)):null;
  const age=Date.now()-Number(d?.lastSeen||0);
  const fresh=Boolean(d?.gpuReady===true&&age>=0&&age<30_000);
  return {ready:fresh&&d?.revision===PRO_AGENT_REVISION,
    legacyReady:fresh&&d?.revision===LEGACY_AGENT_REVISION,
    formatsReady:d?.formatsReady===true,
    v5Ready:fresh&&d?.v5Ready===true&&d?.revision===PRO_AGENT_REVISION,
    v6Ready:fresh&&d?.v6Ready===true&&d?.v5Ready===true&&d?.revision===PRO_AGENT_REVISION,
    v7Ready:fresh&&d?.v7Ready===true&&d?.v6Ready===true&&d?.v5Ready===true&&d?.revision===PRO_AGENT_REVISION,
    v7RhythmReady:fresh&&d?.v7RhythmReady===true&&d?.v7Ready===true&&d?.revision===PRO_AGENT_REVISION,
    v7CreativeModesReady:fresh&&d?.v7CreativeModesReady===true&&d?.v7Ready===true&&d?.revision===PRO_AGENT_REVISION,
    explosiveReady:fresh&&d?.v6Ready===true&&d?.v6ExplosiveReady===true&&d?.revision===PRO_AGENT_REVISION};
}
async function beat(b){
  const d=b?await readJson(await b.get(heartbeatKey)):null;
  const age=Date.now()-Number(d?.lastSeen||0);
  return Boolean(d?.gpuReady===true&&[PRO_AGENT_REVISION,LEGACY_AGENT_REVISION].includes(d?.revision)&&age>=0&&age<30_000);
}
export async function proCapabilities(env) {
  const available=Boolean(env.SONARA_AUDIO_BUCKET)&&enabled(env)&&await beat(env.SONARA_AUDIO_BUCKET);
  const gpu=await gpuState(env.SONARA_AUDIO_BUCKET);
  return {mode:'remix-pro-private-2-source',available,
    fusionAvailable:available&&gpu.ready,v5Available:available&&gpu.v5Ready,
    v6Available:available&&gpu.v6Ready,
    v7Available:available&&gpu.v7Ready,
    v7RhythmAvailable:available&&gpu.v7RhythmReady,
    v7CreativeModesAvailable:available&&gpu.v7CreativeModesReady,
    explosiveAvailable:available&&gpu.explosiveReady,engine:'Demucs 4.1 + ACE-Step XL Turbo',
    model:'htdemucs',expectedAgentRevision:PRO_AGENT_REVISION,
    multiformatAvailable:available&&gpu.formatsReady,
    formats:['wav','mp3','flac','m4a','mp4','mov','m4v','aac','ogg','oga','opus','aif','aiff','aifc','webm','wma','caf','amr','ac3'],
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
    title:safeTitle(j.title)||'Remix Pro '+id.slice(6,14),
    createdAt:Number(j.createdAt)||0,engineVersion:j.engineVersion||'legacy',
    ...(idPattern.test(String(j.parentJobId||''))?{parentJobId:j.parentJobId}:{}),
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
    ...(j.status==='COMPLETE'&&j.v5Result?{v5Result:j.v5Result}:{}),
    ...(j.status==='COMPLETE'&&j.v6Result?{v6Result:j.v6Result}:{}),
    ...(j.status==='COMPLETE'&&j.v7Result?{v7Result:j.v7Result}:{}),
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
  if(fmt!=='wav'&&meta.contentType!==audioContentType(fmt)&&
     !(fmt==='mp4'&&meta.contentType==='audio/mp4'))return null; // previously uploaded MP4 audio
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
  if(!(await gpuState(b)).ready)return fail('Fusione creativa A+B non ancora attiva: serve agente MoLab V3.',503);
  const uid=auth.gatewayOwner(req);
  if(!uid)return fail('Owner missing',401);
  const raw=await req.text();
  if(raw.length>35_000)return fail('Payload too large',413);
  let body;try{body=JSON.parse(raw);}catch{return fail('Invalid JSON');}
  if(!body||typeof body!=='object'||Array.isArray(body))return fail('Invalid JSON');
  const id=String(body.jobId||'');
  const duration=Number(body.durationSec);
  if(!idPattern.test(id)||!Number.isInteger(duration)||duration<30||duration>480||duration%30!==0)
    return fail('Prenotazione e durata Remix Pro non valide.',400);
  // Independent intent must agree with the requested seconds. Reject before
  // creating any R2 job or performing a billing reservation verification.
  if(body.expectedDurationSec!==undefined &&
     (!Number.isInteger(Number(body.expectedDurationSec)) ||
      Number(body.expectedDurationSec)!==duration))
    return fail('La durata inviata non coincide con la selezione originale: nessun job creato.',409);
  // The job id must be allocated by the authenticated native billing gateway.
  // Idempotent replays are reconciled below only after ownership + quota verification.
  if(body.rightsConfirmed!==true)return fail('Conferma i diritti di utilizzo dei due brani.');
  const v5=body.v5===true;
  const v6=body.v6===true;
  const v7=body.v7===true;
  if(v7 && !v6)return fail('V7 Deep Fusion richiede la pipeline V6.',400);
  if(v7 && !(await gpuState(b)).v7Ready)
    return fail('Il motore V7 non risulta installato sul worker MoLab. V6 resta disponibile.',503);
  if(body.v7CreativeModes===true && (!v7 || !(await gpuState(b)).v7CreativeModesReady))
    return fail('Le nuove modalità creative richiedono il worker V7 aggiornato.',503);
  let rhythmControls=null;
  if(body.v7RhythmControls!==undefined) {
    if(!v7 || !(await gpuState(b)).v7RhythmReady)
      return fail('Rhythm Lock richiede il worker V7 aggiornato.',503);
    const raw=body.v7RhythmControls;
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||
       Object.keys(raw).some(k=>!['tempoMode','meter','phraseBars','vocalGrid'].includes(k)))
      return fail('Controlli ritmo non validi.',400);
    rhythmControls={tempoMode:'source-a',meter:'4/4',phraseBars:8,vocalGrid:'half-bar',...raw};
    if(!['source-a','manual'].includes(rhythmControls.tempoMode)||
       rhythmControls.meter!=='4/4'||
       ![4,8,16].includes(rhythmControls.phraseBars)||
       !Number.isInteger(rhythmControls.phraseBars)||
       !['bar','half-bar'].includes(rhythmControls.vocalGrid))
      return fail('Ritmo e battute non validi.',400);
    if(rhythmControls.tempoMode==='manual'&&
       (typeof body.bpmA!=='number'||!Number.isFinite(body.bpmA)||
         body.bpmA<55||body.bpmA>200))
      return fail('Imposta BPM A valido tra 55 e 200 per il tempo manuale.',400);
  }
  let v6Controls=null;
  if(v6) {
    if(!v5)return fail('Remix V6 requires the V5 private pipeline.',400);
    if(!(await gpuState(b)).v6Ready)return fail('Motore creativo V6 non installato sul worker MoLab; V5 resta disponibile.',503);
    try {v6Controls=parseV6Controls(body.v6Controls);}
    catch {return fail('Parametri Creative DNA V6 non validi.',400);}
    if(v6Controls.mode==='explosive'&&!(await gpuState(b)).explosiveReady)
      return fail('Explosive Fusion richiede un worker MoLab aggiornato.',503);
  }
  if(v5) {
    if(!(await gpuState(b)).v5Ready)return fail('Remix Pro V5 richiede un worker MoLab V5 verificato.',503);
    if(!['auto','house','tech-house','deep-house','jazz-fusion','hip-hop','latin-house','pop'].includes(body.genre))
      return fail('Genere V5 non supportato.',400);
    if(!Number.isInteger(body.bInfluence)||body.bInfluence<20||body.bInfluence>80)
      return fail('Bilanciamento A/B V5 non valido.',400);
    if(!['manual','auto'].includes(body.durationMode))return fail('Modalita durata V5 non valida.',400);
    // Older clients may submit two or three candidates for a longer track.
    // Preserve the duration and clamp only the GPU work budget. Reject
    // malformed or out-of-range requests rather than silently trusting them.
    const requestedCount=body.candidateCount===undefined?1:Number(body.candidateCount);
    if(!Number.isInteger(requestedCount)||requestedCount<1||requestedCount>3)
      return fail('Numero di candidati Remix Pro non valido (1–3).',400);
  }
  const candidateLimit=duration<=90?3:duration<=180?2:1;
  const acceptedCandidateCount=v5
    ? Math.min(body.candidateCount===undefined?1:Number(body.candidateCount),candidateLimit)
    : 1;
  const parentJobId=body.parentJobId===undefined||body.parentJobId===null?'':String(body.parentJobId);
  if(parentJobId && !idPattern.test(parentJobId))return fail('Versione di origine non valida.',400);
  if(parentJobId===id)return fail('Una versione non può derivare da se stessa.',409);
  if(parentJobId){
    const parent=await record(b,parentJobId);
    if(!parent||parent.kind!=='sonara-remix-pro'||parent.ownerUid!==uid||parent.status!=='COMPLETE'||!parent.audio||!await b.head(audioKey(parentJobId)))
      return fail('Remix originale non disponibile nel tuo archivio.',404);
  }
  const a=String(body.sourceA||''),c=String(body.sourceB||'');
  if(a===c)return fail('Seleziona due sorgenti differenti.');
  const refs=await Promise.all([ownedReference(b,a,uid),ownedReference(b,c,uid)]);
  if(refs.some(v=>!v))return fail('Una sorgente non è tua, è scaduta oppure non è un audio supportato.',404);
  if(refs.some(v=>v.format!=='wav')&&!(await gpuState(b)).formatsReady)
    return fail('Agente GPU multiformato non ancora aggiornato. I WAV restano disponibili.',503);
if(!(await proQuota(e,'verify',id,uid,duration)))return fail('Registrazione privata Remix Pro non valida.',409);
  // The Durable Object reservation is the single authoritative one-active-job
  // guard. Scanning only the first 100 global R2 jobs was both unreliable and
  // could block the next job after the previous one completed.
  const existingObj=await b.get(jobKey(id));
  const existing=await readJson(existingObj);
  if(existingObj){
    if(!existing||existing.kind!=='sonara-remix-pro'||existing.ownerUid!==uid||
       Number(existing.durationSeconds)!==duration||
       existing.sourceA?.id!==a||existing.sourceB?.id!==c||
       String(existing.parentJobId||'')!==parentJobId)
      return fail('Job id collision or incompatible reservation',409);
    if(existing.status==='QUEUED'||existing.status==='LEASED'||existing.status==='COMPLETE')
      return json({...publicStatus(existing),reused:true},existing.status==='QUEUED'?202:200);
    if(existing.status!=='PREPARING')return fail('Il job precedente non è recuperabile.',409);
    const prepTime=Number(existing.createdAt)||Date.now();
    await b.put(queueKey(prepTime,id),id,{httpMetadata:{contentType:'text/plain'}});
    const resumed={...existing,status:'QUEUED',updatedAt:Date.now()};
    if(!(await save(b,resumed,existingObj.etag)))return fail('Preparazione del job in verifica.',503);
    await saveLibraryIndex(b,resumed).catch(()=>{});
    return json({...publicStatus(resumed),reused:true},202);
  }
  const now=Date.now();
  // A PREPARING record is never claimable; a failed enqueue may be refunded.
  const j={kind:'sonara-remix-pro',id,ownerUid:uid,
    title:safeTitle(body.title)||('Remix Pro '+new Date().toISOString().slice(0,10)),
    ...(parentJobId?{parentJobId}:{}),
    engineVersion:v7?'v7':v6?'v6':v5?'v5':'legacy',
    status:'PREPARING',stage:'queued',attempts:0,
    leaseId:null,leaseUntil:0,createdAt:now,updatedAt:now,
    sourceA:refs[0],sourceB:refs[1],audio:null,stems:{},durationSeconds:duration,
    params:{
      prompt:String(body.prompt||'').trim().slice(0,6500),
      durationSec:duration,
      bpmA:body.bpmA===null||body.bpmA===undefined||body.bpmA===''?null:finite(body.bpmA,null,55,200),
      bpmB:body.bpmB===null||body.bpmB===undefined||body.bpmB===''?null:finite(body.bpmB,null,55,200),
      bassFrom:body.bassFrom==='b'?'b':'a',
      coverStrength:finite(body.coverStrength,.72,.35,.92),
      coverNoise:finite(body.coverNoise,0,0,.3),
      key:String(body.key||'').slice(0,40),
      ...(v5?{v5:true,genre:body.genre,bInfluence:body.bInfluence,
               candidateCount:acceptedCandidateCount,durationMode:body.durationMode}:{}),
      ...(v6?{v6:true,v6Controls}:{ }),
      ...(v7?{v7Studio:true}:{}),
      ...(rhythmControls?{v7RhythmControls:rhythmControls}:{}),
      ...(body.v7CreativeModes===true?{v7CreativeModes:true}:{})
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
  await saveLibraryIndex(b,j).catch(()=>{});
  return json({...publicStatus(j),model:'Demucs+ACE-Step-XL-Turbo'},202);
}
async function claim(e,b,ctx,v5WorkerReady=false,v6WorkerReady=false){
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
    // Legacy V4.2 agents sharing this queue must not claim V5-only tasks.
    if(j.params?.v5===true&&!v5WorkerReady)return null;
    if(j.params?.v6===true&&!v6WorkerReady)return null;
    const leaseId=crypto.randomUUID();
    const updated={...j,status:'LEASED',attempts:j.attempts+1,leaseId,
      leaseUntil:now+15*60*1000,updatedAt:now,stage:'downloading'};
    const ok=await save(b,updated,obj.etag);
    if(!ok)return null;
    return {jobId:j.id,leaseId,params:j.params,sourceFormatA:j.sourceA?.format||'wav',sourceFormatB:j.sourceB?.format||'wav'};
  }
  // A long history of terminal queue markers must never starve fresh
  // generations just because they lie beyond the first R2 list page.
  let queueCursor='';
  for(let page=0;page<8;page++){
    const index=await b.list({prefix:P+'queue/',limit:64,
      ...(queueCursor?{cursor:queueCursor}:{})});
    for(const marker of index.objects||[]){
      const id=String(marker.key).split('/').pop();
      if(!idPattern.test(id))continue;
      const claimed=await tryObject(await b.get(jobKey(id)));
      if(claimed){ctx?.waitUntil?.(b.delete(marker.key));return claimed;}
      const j=await record(b,id);
      if(!j||j.status==='COMPLETE'||j.status==='FAILED')
        ctx?.waitUntil?.(b.delete(marker.key));
    }
    if(index.truncated!==true||!index.cursor)break;
    queueCursor=index.cursor;
  }
  // Recovery of abandoned leases, also cursor-bounded; keep the historical
  // queue resumable without prioritizing stale records over fresh ones.
  let jobsCursor='';
  for(let page=0;page<5;page++){
    const all=await b.list({prefix:P+'jobs/',limit:100,
      ...(jobsCursor?{cursor:jobsCursor}:{})});
    for(const obj of all.objects||[]){
      const claimed=await tryObject(await b.get(obj.key));
      if(claimed)return claimed;
    }
    if(all.truncated!==true||!all.cursor)break;
    jobsCursor=all.cursor;
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
  if(p==='/api/sonara-relay/pro-library'&&req.method==='GET')
    return ownerLibrary(req,env,b,auth);
  if(p==='/api/sonara-relay/pro-enqueue'&&req.method==='POST')
    return enqueue(req,env,auth,b);
  if(p==='/api/sonara-relay/pro-heartbeat'&&req.method==='POST') {
    if(!(await auth.agent(req,env))||!proAgentOk(req))return fail('Unauthorized agent',401);
    const payload=await req.json().catch(()=>({}));
    if(payload?.gpuReady!==true)return fail('GPU verification required',409);
    // During rollout, an older agent may still heartbeat. Never label an
    // old V2 process as fusion-ready merely because gateway code is V3.
    await b.put(heartbeatKey,JSON.stringify({revision:agentRevision(req),gpuReady:true,
      formatsReady:payload?.formatsReady===true,v5Ready:payload?.v5Ready===true,
      v6Ready:payload?.v5Ready===true&&payload?.v6Ready===true,
      v7Ready:payload?.v5Ready===true&&payload?.v6Ready===true&&payload?.v7Ready===true,
      v7RhythmReady:payload?.v5Ready===true&&payload?.v6Ready===true&&payload?.v7Ready===true&&payload?.v7RhythmReady===true,
      v7CreativeModesReady:payload?.v5Ready===true&&payload?.v6Ready===true&&payload?.v7Ready===true&&payload?.v7CreativeModesReady===true,
      v6ExplosiveReady:payload?.v5Ready===true&&payload?.v6Ready===true&&payload?.v6ExplosiveReady===true,
      lastSeen:Date.now()}));
    return json({authenticated:true,revision:agentRevision(req)});
  }
  if(p==='/api/sonara-relay/pro-claim'&&req.method==='POST'){
    if(!(await auth.agent(req,env))||agentRevision(req)!==PRO_AGENT_REVISION)return fail('V3 agent required for fusion claims',401);
    if(!enabled(env))return fail('Remix Pro disabled',503);
    const claimInfo=await req.json().catch(()=>({}));
    return json(await claim(env,b,ctx,claimInfo?.v5Ready===true,claimInfo?.v6Ready===true));
  }
  const match=p.match(/^\/api\/sonara-relay\/pro-job\/(srpro_[0-9a-f-]{36})(?:\/(.+))?$/);
  if(!match)return fail('Not found',404);
  const id=match[1],action=match[2]||'',obj=await b.get(jobKey(id)),j=await readJson(obj);
  if(!j||j.kind!=='sonara-remix-pro')return fail('Not found',404);
  if(req.method==='PATCH'&&action===''){
    const user=await auth.user(req,env);
    if(!user?.uid||user.uid!==j.ownerUid)return fail('Not found',404);
    if(j.status!=='COMPLETE')return fail('Only completed remixes can be renamed',409);
    let body;
    try{body=await req.json();}catch{return fail('Invalid JSON',400);}
    const title=safeTitle(body?.title);
    if(!title||title.length<2)return fail('Titolo non valido',400);
    for(let attempt=0;attempt<4;attempt++){
      const currentObj=await b.get(jobKey(id)),current=await readJson(currentObj);
      if(current?.ownerUid!==user.uid||current?.status!=='COMPLETE')
        return fail('Remix non disponibile',409);
      if(await save(b,{...current,title,updatedAt:Date.now()},currentObj.etag))
        return json({ok:true,title});
    }
    return fail('Modifica titolo in conflitto: riprova',409);
  }
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
  // A signed, private acknowledgement permits an agent to confirm a successful
  // terminal R2 write even when its original HTTPS response was interrupted.
  // No customer endpoint can call this; never expose the job's former lease.
  if(action==='receipt'&&req.method==='GET'){
    const token=String(req.headers.get('X-Sonara-Pro-Lease')||'');
    if(!/^[0-9a-f-]{36}$/.test(token))return fail('Invalid receipt lease',403);
    const proof=await leaseReceiptHash(token);
    if(j.status==='COMPLETE'&&j.completionLeaseHash===proof&&j.audio&&await b.head(j.audio))
      return json({ok:true,completed:true});
    if(j.status==='LEASED'&&j.leaseId===token&&j.leaseUntil>=Date.now())
      return json({ok:true,completed:false});
    return fail('Receipt unavailable or lease changed',409);
  }
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
    const v5Result=j.params?.v5===true && action==='complete' &&
      Number.isInteger(reported?.candidateCount)&&reported.candidateCount>=1&&reported.candidateCount<=3 &&
      Number.isInteger(reported?.acceptedCandidates)&&reported.acceptedCandidates>=1 &&
      reported.acceptedCandidates<=reported.candidateCount &&
      Number.isFinite(Number(reported?.technicalScore)) &&
      Number(reported.technicalScore)>=0&&Number(reported.technicalScore)<=100
      ? {candidatesGenerated:reported.candidateCount,candidatesAccepted:reported.acceptedCandidates,
         technicalScore:Number(reported.technicalScore),artisticListeningRequired:true} : null;
    const safeV6=reported?.v6Selection;
    const v6Result=action==='complete' && j.params?.v6===true &&
      safeV6 && typeof safeV6==='object' && safeV6.isArtisticJudgment===false &&
      ['selectionScore','spectralDiversityProxy','continuityProxy'].every(k=>
        typeof safeV6[k]==='number' && Number.isFinite(safeV6[k]) &&
        safeV6[k]>=0 && safeV6[k]<=100) &&
      ['club','streaming'].includes(reported?.v6Master)
      ? {selectionScore:safeV6.selectionScore,
         spectralDiversityProxy:safeV6.spectralDiversityProxy,
         continuityProxy:safeV6.continuityProxy,
         masterProfile:reported.v6Master,
         artisticListeningRequired:true,isArtisticJudgment:false} : null;
    const safeV7=reported?.v7Result;
    const v7Master=safeV7?.master;
    const v7Result=action==='complete' && j.params?.v7Studio===true &&
      safeV7?.originalVoiceContractVerified===true&&safeV7?.oneClockSourceA===true &&
      Number.isFinite(safeV7.measuredSelectionPriority)&&safeV7.measuredSelectionPriority>=0&&safeV7.measuredSelectionPriority<=100 &&
      ['compatible-estimated-tonal-centers','different-estimated-tonal-centers','key-uncertain'].includes(safeV7.harmonicEstimate) &&
      v7Master?.qualityGateBypassed===false &&
      ['measuredLufs','measuredTruePeakDbTp','measuredCrestDb'].every(k=>
        Number.isFinite(v7Master[k])&&v7Master[k]>-100&&v7Master[k]<100)
      ? {priority:safeV7.measuredSelectionPriority,
         harmonicEstimate:safeV7.harmonicEstimate,
         master:{lufs:v7Master.measuredLufs,truePeakDbTp:v7Master.measuredTruePeakDbTp,
           crestDb:v7Master.measuredCrestDb},
         audioPreviewGenerated:false,artisticListeningRequired:true}:null;
    const v7CreativeMode=(
      j.params?.v7CreativeModes===true &&
      safeV7?.creativeMode===j.params?.v6Controls?.mode &&
      ['balanced','experimental','wild','explosive'].includes(safeV7.creativeMode)
      ? safeV7.creativeMode : null);
    const v7Rhythm=safeV7?.rhythm;
    const safeRhythm=v7Result&&j.params?.v7RhythmControls&&
      v7Rhythm?.meter==='4/4' &&
      ['measured-kick-periodicity-not-verified-downbeat','analyzer-estimate-not-downbeat-verified'].includes(v7Rhythm.beatGridBasis) &&
      ['bar','half-bar'].includes(v7Rhythm.vocalGrid) &&
      [4,8,16].includes(v7Rhythm.phraseBars) &&
      v7Rhythm.vocalGrid===j.params.v7RhythmControls.vocalGrid &&
      v7Rhythm.phraseBars===j.params.v7RhythmControls.phraseBars &&
      ['sourceBpm','outputBpm','confidence','retimeRatio'].every(k=>
        typeof v7Rhythm[k]==='number'&&Number.isFinite(v7Rhythm[k])) &&
      v7Rhythm.sourceBpm>=55&&v7Rhythm.sourceBpm<=200 &&
      v7Rhythm.outputBpm>=55&&v7Rhythm.outputBpm<=200 &&
      v7Rhythm.confidence>=0&&v7Rhythm.confidence<=1 &&
      v7Rhythm.retimeRatio>=1/1.12&&v7Rhythm.retimeRatio<=1.12
      ? {sourceBpm:v7Rhythm.sourceBpm,outputBpm:v7Rhythm.outputBpm,
         confidence:v7Rhythm.confidence,retimeRatio:v7Rhythm.retimeRatio,
         beatGridBasis:v7Rhythm.beatGridBasis,meter:'4/4',
         phraseBars:v7Rhythm.phraseBars,vocalGrid:v7Rhythm.vocalGrid} : null;
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
    // The GPU lease-renewer can update this same R2 object while the final
    // HTTP request is in flight. Re-read and CAS-retry: a single collision
    // must never turn a valid rendered master into REMIX_COMPLETION_FAILED.
    // We never accept a stolen, expired or already terminal lease.
    const lease=String(req.headers.get('X-Sonara-Pro-Lease')||'');
    const proof=action==='complete'?await leaseReceiptHash(lease):null;
    for(let attempt=0;attempt<8;attempt++){
      const currentObj=await b.get(jobKey(id));
      const current=await readJson(currentObj);
      if(!current||current.status!=='LEASED'||current.leaseId!==lease||
         current.leaseUntil<Date.now())
        return fail('Terminal lease changed or expired',409);
      if(action==='complete'&&(!current.audio||!await b.head(current.audio)))
        return fail('Final WAV required',409);
      // Terminal write happens BEFORE settlement/refund and cannot be
      // overwritten by a late failure or an older worker.
      const next={...current,status:action==='complete'?'COMPLETE':'FAILED',
        stage:action==='complete'?'completed':'failed',leaseUntil:0,
        leaseId:null,updatedAt:Date.now(),params:null,sourceA:null,sourceB:null,
        ...(action==='complete'&&reported?.actualDurationSeconds!==undefined
           ? {actualDurationSeconds:claimedDuration} : {}),
        ...(action==='complete'?{completionLeaseHash:proof}:{}),
        ...(action==='fail'?{failureCode,failurePhase}:{}),
        ...(v5Result?{v5Result}:{}),
        ...(v6Result?{v6Result}:{}),
        ...(v7Result?{v7Result:{...v7Result,
          ...(safeRhythm?{rhythm:safeRhythm}:{}),
          ...(v7CreativeMode?{creativeMode:v7CreativeMode}:{})}}:{})};
      if(!(await save(b,next,currentObj.etag)))continue;
      if(action==='complete')await saveLibraryIndex(b,next).catch(()=>{});
      // Quota settlement failures must not reverse a confirmed R2 master.
      // They are handled by the idempotent account-ledger settlement alarm.
      const settled=await proQuota(env,action==='complete'?'commit':'refund',id,current.ownerUid)
        .catch(()=>false);
      await Promise.allSettled([current.sourceA,current.sourceB].map(async src=>{
        if(!src?.objectKey)return;
        await Promise.all([b.delete(src.objectKey),b.delete(referenceKey(src.id))]);
      }));
      return json({ok:true,settlementPending:!settled},settled?200:202);
    }
    return fail('Concurrent heartbeat: retry final confirmation',503);
  }
  return fail('Method not supported',405);
}
