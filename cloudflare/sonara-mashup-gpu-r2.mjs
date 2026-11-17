/**
 * SONARA Mashup GPU: private, separate R2 queue for Demucs recomposition.
 * Never calls ACE-Step or consumes Remix Pro jobs. No public audio URLs.
 */
const BASE='/api/sonara-relay/';
const ROOT='relay-v1/mashup/';
const REV='sonara-mashup-htdemucs-v1';
const SIZE=64*1024*1024, FRESH=35000, LEASE=20*60*1000;
const JOB=/^smash_[a-f0-9-]{36}$/, REF=/^smref_[a-f0-9-]{36}$/;
const STAGES=new Set(['downloading','analyzing','separating','arranging','mastering','uploading']);
const MODES=new Set(['club','dialogue','instrumental']);
const json=(o,status=200)=>new Response(JSON.stringify(o),{status,headers:{'content-type':'application/json','cache-control':'private,no-store'}});
const fail=(m,s=400)=>json({error:m},s);
const jobKey=id=>ROOT+'jobs/'+id+'.json';
const metaKey=id=>ROOT+'sources/'+id+'.json';
const audioKey=id=>ROOT+'outputs/'+id+'/master.wav';
const sourceKey=id=>ROOT+'sources/'+id+'/original';
const lockKey=id=>ROOT+'active/'+id+'.json';
const read=async o=>{try{return o?await o.json():null}catch{return null}};
const safeName=s=>String(s||'SONARA audio.wav').replace(/[\x00-\x1f\x7f\\/]/g,' ').trim().slice(0,100);
const enabled=e=>e.SONARA_MASHUP_GPU_ENABLED==='true'&&e.SONARA_R2_RELAY_ENABLED==='true'&&Boolean(e.SONARA_AUDIO_BUCKET);
const validOrigin=r=>['https://sonaraenterprise.com','https://www.sonaraenterprise.com'].includes(r.headers.get('origin'));
async function ownerHash(uid){
  const sha=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(uid)));
  return Array.from(sha.slice(0,16),x=>x.toString(16).padStart(2,'0')).join('');
}
async function beat(b){
  const v=await read(b?await b.get(ROOT+'agent/heartbeat.json'):null);
  const age=v?.lastSeen?Math.max(0,Date.now()-v.lastSeen):null;
  return {online:age!==null&&age<FRESH&&v.revision===REV&&v.gpuReady===true&&v.demucsReady===true,age};
}
async function capabilities(e){
  const h=await beat(e.SONARA_AUDIO_BUCKET);
  return {mode:'gpu-demucs-stems',model:'htdemucs',available:enabled(e)&&h.online,
    agentOnline:h.online,heartbeatAgeMs:h.age,expectedAgentRevision:REV,aceStepUnmodified:true,
    maxSourceMiB:64,maxDurationSec:300};
}
async function save(b,j,etag=null){
  const opt={httpMetadata:{contentType:'application/json'}};
  if(etag)opt.onlyIf={etagMatches:etag};
  return await b.put(jobKey(j.id),JSON.stringify(j),opt)!==null;
}
function publicJob(j){
  return {jobId:j.id,title:j.title,status:j.status==='COMPLETE'?'COMPLETED':j.status==='FAILED'?'FAILED':'PROCESSING',
    stage:j.stage||'queued',progress:j.status==='COMPLETE'?100:j.status==='FAILED'?0:
    ({queued:1,downloading:10,analyzing:18,separating:30,arranging:68,mastering:82,uploading:93}[j.stage]||1),
    error:j.status==='FAILED'?j.error:null,createdAt:j.createdAt,durationSec:j.durationSec,
    audioUrl:j.status==='COMPLETE'?BASE+'mashup-job/'+j.id+'/audio':null,
    stemsVerified:j.status==='COMPLETE'&&j.stemsVerified===true,
    audit:j.status==='COMPLETE'?j.audit:null};
}
async function release(b,j){
  const k=lockKey(j.ownerHash);
  const value=await read(await b.get(k));
  if(value?.jobId===j.id)await b.delete(k);
}
async function owned(b,id,uid){
  if(!REF.test(id))return null;
  const m=await read(await b.get(metaKey(id)));
  if(!m||m.ownerUid!==uid||m.expiresAt<Date.now()||m.objectKey!==sourceKey(id))return null;
  const head=await b.head(m.objectKey);
  return head&&head.size>=44&&head.size<=SIZE?m:null;
}
function leaseOk(j,req){return j?.status==='LEASED'&&j.leaseUntil>Date.now()&&j.leaseId===req.headers.get('X-Sonara-Mashup-Lease');}
async function audio(req,b,key){
  const head=await b.head(key);if(!head)return fail('Master non trovato',404);
  const value=req.headers.get('range')||'';
  if(value){
    const m=/^bytes=(\d*)-(\d*)$/.exec(value);
    if(!m||(!m[1]&&!m[2]))return fail('Range invalido',416);
    const start=m[1]?Number(m[1]):Math.max(0,head.size-Number(m[2]));
    const end=m[1]&&m[2]?Math.min(head.size-1,Number(m[2])):head.size-1;
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||start>=head.size)return fail('Range invalido',416);
    const o=await b.get(key,{range:{offset:start,length:end-start+1}});
    return o?new Response(o.body,{status:206,headers:{'content-type':'audio/wav','accept-ranges':'bytes',
      'content-range':'bytes '+start+'-'+end+'/'+head.size,'content-length':String(end-start+1),
      'cache-control':'private,no-store'}}):fail('Master mancante',404);
  }
  const o=await b.get(key);
  return o?new Response(o.body,{headers:{'content-type':'audio/wav','content-length':String(head.size),
    'accept-ranges':'bytes','cache-control':'private,no-store'}}):fail('Master mancante',404);
}
export async function handleMashupGpu(req,env,ctx,auth){
  const path=new URL(req.url).pathname;
  if(path!==BASE+'mashup-capabilities'&&!path.startsWith(BASE+'mashup-'))return null;
  const b=env.SONARA_AUDIO_BUCKET;
  if(path===BASE+'mashup-capabilities'&&req.method==='GET')return json(await capabilities(env));
  if(!b||env.SONARA_R2_RELAY_ENABLED!=='true')return fail('Storage Mashup non disponibile',503);
  const match=path.match(/^\/api\/sonara-relay\/mashup-job\/(smash_[a-f0-9-]{36})(?:\/(.+))?$/);
  const agentPath=path===BASE+'mashup-heartbeat'||path===BASE+'mashup-claim'||(match&&req.method!=='GET');
  if(agentPath){
    if(!await auth.agent(req,env))return fail('Agente non autorizzato',401);
    if(path===BASE+'mashup-heartbeat'&&req.method==='POST'){
      const d=await req.json().catch(()=>({}));
      if(d.revision!==REV||d.gpuReady!==true||d.demucsReady!==true)return fail('CUDA e Demucs non verificati',409);
      await b.put(ROOT+'agent/heartbeat.json',JSON.stringify({revision:REV,gpuReady:true,demucsReady:true,lastSeen:Date.now()}),
        {httpMetadata:{contentType:'application/json'}});
      return json({authenticated:true,available:enabled(env)});
    }
    if(path===BASE+'mashup-claim'&&req.method==='POST'){
      if(!enabled(env)||!(await beat(b)).online)return fail('GPU non disponibile',503);
      const objects=await b.list({prefix:ROOT+'queue/',limit:100});
      for(const entry of objects.objects||[]){
        const id=entry.key.split('/').pop();if(!JOB.test(id))continue;
        const o=await b.get(jobKey(id)),j=await read(o);if(!j||['COMPLETE','FAILED'].includes(j.status))continue;
        const now=Date.now();
        if(j.attempts>=3||now-j.createdAt>2*60*60*1000){
          if(await save(b,{...j,status:'FAILED',stage:'failed',error:'Timeout lavoro GPU',updatedAt:now},o.etag))await release(b,j);
          continue;
        }
        if(j.status!=='QUEUED'&&!(j.status==='LEASED'&&j.leaseUntil<now))continue;
        const leaseId=crypto.randomUUID();
        const next={...j,status:'LEASED',stage:'downloading',attempts:j.attempts+1,leaseId,leaseUntil:now+LEASE,updatedAt:now};
        if(!await save(b,next,o.etag))continue;
        return json({jobId:id,leaseId,params:{mode:j.mode,durationSec:j.durationSec,
          bpmA:j.bpmA,bpmB:j.bpmB,formatA:j.sourceA.format,formatB:j.sourceB.format}});
      }
      return json({jobId:null});
    }
  }
  if(path===BASE+'mashup-source'&&req.method==='POST'){
    if(!validOrigin(req))return fail('Origine non autorizzata',403);
    const user=await auth.user(req,env);if(!user?.uid)return fail('Accedi a SONARA',401);
    if(!(await capabilities(env)).available)return fail('GPU Mashup non collegata',503);
    if(!req.body)return fail('Sorgente mancante');
    const name=safeName(req.headers.get('X-Sonara-Mashup-Name'));
    const format=(name.match(/\.(wav|mp3|flac|m4a|ogg|aac|aif|aiff)$/i)||[])[1];
    const type=(req.headers.get('content-type')||'').split(';')[0].toLowerCase();
    if(!format||!(/^(audio\/|application\/octet-stream)/.test(type)))return fail('Formato non ammesso',415);
    if(Number(req.headers.get('content-length')||0)>SIZE)return fail('Limite 64 MiB',413);
    const id='smref_'+crypto.randomUUID(),key=sourceKey(id);
    await b.put(key,req.body,{httpMetadata:{contentType:type}});
    const head=await b.head(key);
    if(!head||head.size<44||head.size>SIZE){await b.delete(key);return fail('Sorgente non valida (max 64 MiB)',413);}
    const now=Date.now();
    await b.put(metaKey(id),JSON.stringify({id,ownerUid:user.uid,objectKey:key,format:format.toLowerCase(),
      filename:name,bytes:head.size,expiresAt:now+2*60*60*1000,createdAt:now}),
      {httpMetadata:{contentType:'application/json'}});
    return json({sourceId:id,bytes:head.size},201);
  }
  if(path===BASE+'mashup-enqueue'&&req.method==='POST'){
    if(!validOrigin(req))return fail('Origine non autorizzata',403);
    const user=await auth.user(req,env);if(!user?.uid)return fail('Accedi a SONARA',401);
    if(!(await capabilities(env)).available)return fail('GPU Mashup non collegata',503);
    if(Number(req.headers.get('content-length')||0)>4000)return fail('Parametri troppo lunghi',413);
    const d=await req.json().catch(()=>null);
    if(!d||d.rightsConfirmed!==true)return fail('Conferma i diritti sui brani',400);
    if(!REF.test(d.sourceA)||!REF.test(d.sourceB)||d.sourceA===d.sourceB)return fail('Due brani differenti richiesti',400);
    const [a,c]=await Promise.all([owned(b,d.sourceA,user.uid),owned(b,d.sourceB,user.uid)]);
    if(!a||!c)return fail('Sorgenti non disponibili o non tue',404);
    const duration=Number(d.durationSec),bpmA=Number(d.bpmA),bpmB=Number(d.bpmB);
    if(!Number.isInteger(duration)||duration<30||duration>300||duration%30)return fail('Durata 30-300s in passi da 30',400);
    if(!Number.isFinite(bpmA)||!Number.isFinite(bpmB)||bpmA<60||bpmA>200||bpmB<60||bpmB>220||
       Math.abs(bpmA/bpmB-1)>0.12)return fail('Verifica BPM (massimo 12% di differenza)',400);
    if(!MODES.has(d.mode))return fail('Modalità non valida');
    const hash=await ownerHash(user.uid);
    const active=await read(await b.get(lockKey(hash)));
    if(active?.jobId&&JOB.test(active.jobId)){
      const prev=await read(await b.get(jobKey(active.jobId)));
      if(prev&&['QUEUED','LEASED'].includes(prev.status)&&Date.now()-prev.createdAt<2*60*60*1000)
        return fail('Hai già un mashup in lavorazione',409);
    }
    const id='smash_'+crypto.randomUUID(),now=Date.now();
    const j={id,kind:'mashup-gpu',ownerUid:user.uid,ownerHash:hash,title:safeName(d.title||'SONARA Mashup GPU'),
      status:'QUEUED',stage:'queued',createdAt:now,updatedAt:now,attempts:0,leaseId:null,leaseUntil:0,
      sourceA:a,sourceB:c,durationSec:duration,bpmA,bpmB,mode:d.mode,output:null,stemsVerified:false,error:null};
    if(!await save(b,j))return fail('Salvataggio job fallito',503);
    await b.put(ROOT+'queue/'+String(now).padStart(13,'0')+'/'+id,id);
    await b.put(lockKey(hash),JSON.stringify({jobId:id,createdAt:now}),{httpMetadata:{contentType:'application/json'}});
    return json(publicJob(j),202);
  }
  if(path===BASE+'mashup-library'&&req.method==='GET'){
    const user=await auth.user(req,env);if(!user?.uid)return fail('Accedi a SONARA',401);
    const hash=await ownerHash(user.uid);
    const list=await b.list({prefix:ROOT+'library/'+hash+'/',limit:50});
    const items=await Promise.all((list.objects||[]).map(async x=>read(await b.get(x.key))));
    return json({items:items.filter(j=>j&&j.ownerUid===user.uid&&j.status==='COMPLETE').map(publicJob).sort((a,c)=>c.createdAt-a.createdAt)});
  }
  if(match){
    const id=match[1],action=match[2]||'',obj=await b.get(jobKey(id)),j=await read(obj);
    if(!j||j.kind!=='mashup-gpu')return fail('Job non trovato',404);
    if(req.method==='GET'&&(action===''||action==='audio')){
      const user=await auth.user(req,env);
      if(!user?.uid||user.uid!==j.ownerUid)return fail('Job non trovato',404);
      if(!action)return json(publicJob(j));
      return j.status==='COMPLETE'?audio(req,b,audioKey(id)):fail('Master non pronto',409);
    }
    if(!leaseOk(j,req))return fail('Lease scaduta',409);
    if(req.method==='GET'&&(action==='source/a'||action==='source/b')){
      const s=action==='source/a'?j.sourceA:j.sourceB;
      const o=await b.get(s.objectKey);
      return o?new Response(o.body,{headers:{'content-type':'application/octet-stream','content-length':String(s.bytes),
        'cache-control':'private,no-store'}}):fail('Sorgente mancante',404);
    }
    if(action==='renew'&&req.method==='POST'){
      return await save(b,{...j,leaseUntil:Date.now()+LEASE,updatedAt:Date.now()},obj.etag)?
        json({ok:true}):fail('Lease modificata',409);
    }
    if(action==='progress'&&req.method==='POST'){
      const d=await req.json().catch(()=>({}));
      if(!STAGES.has(d.stage))return fail('Fase non valida');
      return await save(b,{...j,stage:d.stage,updatedAt:Date.now()},obj.etag)?json({ok:true}):fail('Conflitto aggiornamento',409);
    }
    if(action==='audio'&&req.method==='PUT'){
      if(!req.body)return fail('Master mancante');
      if(Number(req.headers.get('content-length')||0)>SIZE)return fail('Master troppo grande',413);
      await b.put(audioKey(id),req.body,{httpMetadata:{contentType:'audio/wav'}});
      const head=await b.head(audioKey(id));
      if(!head||head.size<1000||head.size>SIZE){await b.delete(audioKey(id));return fail('Master non valido',413);}
      for(let i=0;i<6;i++){
        const o=await b.get(jobKey(id)),c=await read(o);
        if(!leaseOk(c,req))return fail('Lease modificata',409);
        if(await save(b,{...c,output:audioKey(id),stage:'uploading',updatedAt:Date.now()},o.etag))
          return json({ok:true,bytes:head.size});
      }
      return fail('Conflitto conferma upload',409);
    }
    if(action==='complete'&&req.method==='POST'){
      const d=await req.json().catch(()=>({}));
      if(!j.output||!await b.head(audioKey(id)))return fail('Master non caricato',409);
      if(d.model!=='htdemucs'||d.stemsVerified!==true||Math.abs(Number(d.actualDurationSec)-j.durationSec)>0.15)
        return fail('Durata o stem non verificati',409);
      const audit={peakDbfs:Number.isFinite(d.audit?.peakDbfs)?d.audit.peakDbfs:null,
        renderBpm:j.bpmA,model:'htdemucs',requiresListening:true};
      const final={...j,status:'COMPLETE',stage:'completed',updatedAt:Date.now(),
        leaseId:null,leaseUntil:0,sourceA:null,sourceB:null,stemsVerified:true,audit};
      if(!await save(b,final,obj.etag))return fail('Conferma in conflitto',409);
      await b.put(ROOT+'library/'+j.ownerHash+'/'+String(j.createdAt).padStart(13,'0')+'-'+id+'.json',JSON.stringify(final),
        {httpMetadata:{contentType:'application/json'}});
      await release(b,j);
      return json({...publicJob(final),ok:true});
    }
    if(action==='fail'&&req.method==='POST'){
      const d=await req.json().catch(()=>({}));
      const code=String(d.code||'').replace(/[^A-Z_]/g,'').slice(0,50);
      const message={DEMUCS_FAILED:'Demucs GPU non è riuscito a separare gli stem.',
        SOURCES_INCOMPATIBLE:'I brani non sono armonicamente compatibili.',
        AUDIO_INVALID:'Il master non ha superato i controlli tecnici.'}[code]||
        'Elaborazione GPU non riuscita.';
      const final={...j,status:'FAILED',stage:'failed',error:message,updatedAt:Date.now(),leaseId:null,leaseUntil:0};
      if(!await save(b,final,obj.etag))return fail('Conflitto errore',409);
      await release(b,j);
      return json({ok:true});
    }
    return fail('Metodo non valido',405);
  }
  return fail('Endpoint non trovato',404);
}
