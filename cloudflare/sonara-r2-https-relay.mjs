// SONARA R2 HTTPS relay: all MoLab traffic is outbound on TCP/443.
// Deployed inside the existing sonara-enterprise Worker; gated by SONARA_R2_RELAY_ENABLED.
// R2 objects remain private. Do not place credentials in code or notebook cells.
const PREFIX = 'relay-v1/';
const REQUIRED_AGENT_REVISION = 'sonara-https-agent-guard-v4';
const json = (body, status=200) => new Response(JSON.stringify(body), {status,headers:{'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':'https://sonaraenterprise.com'}});
const bearer = (r) => r.headers.get('X-Sonara-Relay-Token') || (r.headers.get('Authorization')||'').replace(/^Bearer /i,'');
// Authorize the notebook's high-entropy machine token by its public fingerprint.
// The original Worker-only relay secret remains valid and is left untouched:
// the gateway wrapper also uses it as its private audio-signing root.
const hasWorkerAuth = async (r,e) => {
  const supplied=bearer(r);
  if(supplied.length<32||supplied.length>512||/[^\x21-\x7e]/.test(supplied))return false;
  if(Boolean(e.SONARA_RELAY_TOKEN)&&supplied===e.SONARA_RELAY_TOKEN)return true;
  const expected=String(e.SONARA_RELAY_TOKEN_SHA256||'').trim().toLowerCase();
  if(!/^[0-9a-f]{64}$/.test(expected))return false;
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(supplied)));
  const actual=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  let mismatch=0;
  for(let i=0;i<64;i++)mismatch|=actual.charCodeAt(i)^expected.charCodeAt(i);
  return mismatch===0;
};
const hasSubmitAuth = (r,e) => Boolean(e.SONARA_INTERNAL_PROXY_SECRET) && r.headers.get('X-Sonara-Internal-Secret')===e.SONARA_INTERNAL_PROXY_SECRET;
// This metadata is accepted only with the server-side gateway credential.
const ownerUid = r => {
  const uid=(r.headers.get('X-Sonara-User-Uid')||'').trim();
  return uid&&uid.length<=128?uid:'';
};
const ownsJob = (r,j) => Boolean(j?.ownerUid) && ownerUid(r)===j.ownerUid;
const key = id => PREFIX+'jobs/'+id+'.json';
const valid = id => /^sr2_[0-9a-f-]{36}$/.test(id||'');
const getRecord = async (b,id) => { const o=await b.get(key(id));return o?o.json():null; };
const saveRecord = (b,id,record,options={}) => b.put(key(id), JSON.stringify(record), {httpMetadata:{contentType:'application/json'},...options});
const audioKey=(id,index)=>PREFIX+'audio/'+id+'/'+index+'.wav';
const isService = path => path.startsWith('/api/sonara-relay/');
// Browsers seek within WAV files using a single byte range. Ignore unsupported
// range syntax; return false only when a valid single range cannot be satisfied.
const audioRange = (value,size) => {
  const match=/^bytes=(\d*)-(\d*)$/i.exec((value||'').trim());
  if(!match||(!match[1]&&!match[2]))return null;
  if(size===0)return false;
  if(!match[1]) {
    const length=Math.min(Number(match[2]),size);
    return length>0?{offset:size-length,length}:false;
  }
  const offset=Number(match[1]);
  const end=match[2]?Math.min(Number(match[2]),size-1):size-1;
  return offset<size&&end>=offset?{offset,length:end-offset+1}:false;
};
const signAudio = async (id,i,env) => {
  const exp=Date.now()+30*60*1000;
  const data=id+':'+i+':'+exp;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.SONARA_INTERNAL_PROXY_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const digest=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(data)));
  const sig=Array.from(digest).map(x=>x.toString(16).padStart(2,'0')).join('');
  return 'https://api.sonaraenterprise.com/api/sonara-relay/job/'+id+'/audio/'+i+'?exp='+exp+'&sig='+sig;
};
const verifyAudio = async (id,i,url,env) => {
  if(!env.SONARA_INTERNAL_PROXY_SECRET)return false;
  const exp=Number(url.searchParams.get('exp'));
  if(!Number.isSafeInteger(exp)||exp<Date.now()||exp>Date.now()+60*60*1000)return false;
  const expected=await signAudioAt(id,i,exp,env);
  return expected===url.searchParams.get('sig');
};
const signAudioAt=async(id,i,exp,env)=>{
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.SONARA_INTERNAL_PROXY_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(id+':'+i+':'+exp)));
  return Array.from(bytes).map(x=>x.toString(16).padStart(2,'0')).join('');
};
const MAX_REQ = 150000;
export default {
 async fetch(request,env,ctx) {
  const url=new URL(request.url),p=url.pathname,b=env.SONARA_AUDIO_BUCKET;
  if(!isService(p)) return null;
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:{'access-control-allow-origin':'https://sonaraenterprise.com','access-control-allow-methods':'GET,HEAD,POST,PUT,OPTIONS','access-control-allow-headers':'Content-Type,Range,If-Range,X-Sonara-Internal-Secret,X-Sonara-Relay-Token,Authorization'}});
  // Read-only authentication probe. No queue claims, storage writes or generation.
  // It works while the public relay switch is off, permitting safe provisioning.
  if(p==='/api/sonara-relay/auth'&&request.method==='GET') {
    if(!(await hasWorkerAuth(request,env)))return json({error:'Unauthorized'},401);
    return json({
      service:'sonara-r2-relay',
      authenticated:true,
      requiredAgentRevision:REQUIRED_AGENT_REVISION,
      relayEnabled:env.SONARA_R2_RELAY_ENABLED==='true',
      storageConfigured:Boolean(b),
      gatewayConfigured:Boolean(env.SONARA_INTERNAL_PROXY_SECRET)
    });
  }
  // Bounded, read-only queue diagnostics for the already authorized machine.
  // Never expose payloads, owners, job IDs, lease IDs, tokens or signed URLs.
  if(p==='/api/sonara-relay/queue-status'&&request.method==='GET') {
    if(!(await hasWorkerAuth(request,env)))return json({error:'Unauthorized'},401);
    if(!b)return json({error:'SONARA relay storage not configured'},503);
    const list=await b.list({prefix:PREFIX+'jobs/',limit:100}),now=Date.now();
    const counts={queued:0,leased:0,expiredLeases:0,complete:0,failed:0,unreadable:0,other:0,claimable:0,attemptsExhausted:0};
    for(let offset=0;offset<list.objects.length;offset+=4) {
      const records=await Promise.all(list.objects.slice(offset,offset+4).map(async item=>{
        try {const obj=await b.get(item.key);return obj?await obj.json():null;}catch{return null;}
      }));
      for(const j of records) {
        if(!j||typeof j!=='object'||Array.isArray(j)){counts.unreadable++;continue;}
        if(j.status==='QUEUED')counts.queued++;
        else if(j.status==='LEASED')counts.leased++;
        else if(j.status==='COMPLETE')counts.complete++;
        else if(j.status==='FAILED')counts.failed++;
        else counts.other++;
        const expired=j.status==='LEASED'&&j.leaseUntil<now;
        if(expired)counts.expiredLeases++;
        if(j.attempts>=3)counts.attemptsExhausted++;
        else if(j.status==='QUEUED'||expired)counts.claimable++;
      }
    }
    return json({service:'sonara-relay-queue-status',sampled:list.objects.length,limit:100,truncated:Boolean(list.truncated),counts});
  }
  if(env.SONARA_R2_RELAY_ENABLED!=='true'||!b) return json({error:'SONARA relay not configured'},503);
  // Enqueue only from the Vercel billing/auth gateway using shared secret.
  if(p==='/api/sonara-relay/enqueue'&&request.method==='POST') {
    if(!hasSubmitAuth(request,env))return json({error:'Unauthorized'},401);
    const owner=ownerUid(request);
    if(!owner)return json({error:'Authenticated job owner required'},400);
    const raw=await request.text();
    if(raw.length>MAX_REQ)return json({error:'Request too large'},413);
    let payload;try{payload=JSON.parse(raw);}catch{return json({error:'Invalid JSON'},400);}
    if(!payload||typeof payload!=='object'||Array.isArray(payload))return json({error:'Invalid payload'},400);
    const id='sr2_'+crypto.randomUUID(),now=Date.now();
    const record={id,ownerUid:owner,status:'QUEUED',createdAt:now,updatedAt:now,leaseUntil:0,attempts:0,payload,files:[],error:null};
    await saveRecord(b,id,record);
    return json({jobId:id,status:'PROCESSING',progress:0,provider:'molab',model:'acestep-v15-xl-turbo'},202);
  }
  // MoLab polls through HTTPS/443, authenticates with a Worker secret.
  if(p==='/api/sonara-relay/claim'&&request.method==='POST') {
    if(!(await hasWorkerAuth(request,env)))return json({error:'Unauthorized'},401);
    // Stop only new claims from older agents; existing leases can finish normally.
    if(request.headers.get('X-Sonara-Agent-Revision')!==REQUIRED_AGENT_REVISION)
      return json({jobId:null,agentUpdateRequired:true,requiredAgentRevision:REQUIRED_AGENT_REVISION});
    const list=await b.list({prefix:PREFIX+'jobs/',limit:100});
    const now=Date.now();
    for(const item of list.objects) {
      const obj=await b.get(item.key);if(!obj)continue;
      let j;try{j=await obj.json();}catch{continue;}
      if(j.status!=='QUEUED'&&!(j.status==='LEASED'&&j.leaseUntil<now))continue;
      if(j.attempts>=3)continue;
      const lease=crypto.randomUUID();
      const next={...j,status:'LEASED',leaseUntil:now+15*60*1000,leaseId:lease,attempts:j.attempts+1,updatedAt:now};
      try {
        const saved=await b.put(item.key,JSON.stringify(next),{onlyIf:{etagMatches:obj.etag},httpMetadata:{contentType:'application/json'}});
        if(!saved)continue;
        return json({jobId:j.id,payload:j.payload,leaseId:lease});
      }catch{return json({error:'Unable to claim relay job'},503);}
    }
    return json({jobId:null},200);
  }
  const root='/api/sonara-relay/job/';
  if(p.startsWith(root)) {
    const parts=p.slice(root.length).split('/'),id=parts[0],action=parts[1]||'';
    if(!valid(id))return json({error:'Invalid job ID'},400);
    if(!action&&request.method==='GET') {
      if(!hasSubmitAuth(request,env))return json({error:'Unauthorized'},401);
      const j=await getRecord(b,id);
      if(!j||!ownsJob(request,j))return json({error:'Not found'},404);
      // Only public, non-sensitive progress metadata. Never return user prompt, lease or token.
      const urls=await Promise.all(j.files.map((_,i)=>signAudio(id,i,env)));
      return json({jobId:id,status:j.status==='COMPLETE'?'COMPLETED':j.status==='FAILED'?'FAILED':'PROCESSING',progress:j.status==='COMPLETE'?100:j.status==='LEASED'?50:0,error:j.error,provider:'molab',model:'acestep-v15-xl-turbo',metadata:{audioFormat:'wav'},audioUrl:urls[0]||null,audioUrls:urls,candidates:urls.map((u,i)=>({id:i===0?'A':'B',audioUrl:u,audioFormat:'wav',provider:'molab',model:'acestep-v15-xl-turbo'}))});
    }
    if(action==='audio'&&(request.method==='GET'||request.method==='HEAD')) {
      const idx=Number(parts[2]);
      const signed=Number.isInteger(idx)&&await verifyAudio(id,idx,url,env);
      if(!hasSubmitAuth(request,env)&&!signed)return json({error:'Unauthorized'},401);
      const j=await getRecord(b,id);
      if(!signed&&(!j||!ownsJob(request,j)))return json({error:'Not found'},404);
      if(!j||j.status!=='COMPLETE')return json({error:'Audio not ready'},404);
      const i=Number(parts[2]);if(!Number.isInteger(i)||i<0||i>=j.files.length)return json({error:'Not found'},404);
      const objectKey=audioKey(id,i);
      const rangeHeader=request.method==='GET'?request.headers.get('range'):null;
      let obj=await (request.method==='HEAD'||rangeHeader?b.head(objectKey):b.get(objectKey));
      if(!obj)return json({error:'Not found'},404);
      const headers=new Headers({
        'content-type':'audio/wav','cache-control':'private, max-age=300',
        'accept-ranges':'bytes','content-length':String(obj.size),
        'etag':obj.httpEtag,'last-modified':obj.uploaded.toUTCString(),
        'access-control-allow-origin':'https://sonaraenterprise.com',
        'access-control-expose-headers':'Accept-Ranges,Content-Length,Content-Range,ETag,Last-Modified'
      });
      if(request.method==='HEAD')return new Response(null,{headers});
      const ifRange=request.headers.get('if-range');
      const range=(!ifRange||ifRange===obj.httpEtag||ifRange===headers.get('last-modified'))
        ?audioRange(rangeHeader,obj.size):null;
      if(range===false) {
        headers.set('content-range','bytes */'+obj.size);
        headers.set('content-length','0');
        return new Response(null,{status:416,headers});
      }
      if(range) {
        headers.set('content-range',`bytes ${range.offset}-${range.offset+range.length-1}/${obj.size}`);
        headers.set('content-length',String(range.length));
      }
      // Completed audio is immutable. Fetch only the requested bytes, keeping
      // ordinary full-file downloads on their existing single R2 read path.
      if(rangeHeader) {
        obj=await b.get(objectKey,range?{range}:undefined);
        if(!obj)return json({error:'Not found'},404);
      }
      return new Response(obj.body,{status:range?206:200,headers});
    }
    if(!(await hasWorkerAuth(request,env)))return json({error:'Unauthorized'},401);
    const j=await getRecord(b,id);if(!j)return json({error:'Not found'},404);
    const lease=request.headers.get('X-Sonara-Lease');
    if(j.status!=='LEASED'||!lease||lease!==j.leaseId)return json({error:'Lease mismatch'},409);
    if(action==='renew'&&request.method==='POST') {
      j.leaseUntil=Date.now()+15*60*1000;j.updatedAt=Date.now();
      await saveRecord(b,id,j);return json({ok:true});
    }
    if(action==='audio'&&request.method==='PUT') {
      const i=Number(parts[2]);if(!Number.isInteger(i)||i<0||i>1)return json({error:'Invalid audio index'},400);
      const len=Number(request.headers.get('content-length')||0);
      if(len>80*1024*1024)return json({error:'Audio exceeds 80 MiB'},413);
      if(!request.body)return json({error:'Empty audio'},400);
      await b.put(audioKey(id,i),request.body,{httpMetadata:{contentType:'audio/wav'}});
      j.files[i]=audioKey(id,i);j.updatedAt=Date.now();await saveRecord(b,id,j);
      return json({ok:true});
    }
    if(action==='complete'&&request.method==='POST') {
      if(!j.files.length)return json({error:'No audio uploaded'},409);
      j.status='COMPLETE';j.leaseUntil=0;j.updatedAt=Date.now();delete j.payload;delete j.leaseId;
      await saveRecord(b,id,j);return json({ok:true});
    }
    if(action==='fail'&&request.method==='POST') {
      j.status='FAILED';j.error='Generazione MoLab non riuscita';j.leaseUntil=0;j.updatedAt=Date.now();delete j.payload;delete j.leaseId;
      await saveRecord(b,id,j);return json({ok:true});
    }
  }
  return json({error:'Not found'},404);
 }
};
