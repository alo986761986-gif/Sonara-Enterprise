// SONARA R2 HTTPS relay: all MoLab traffic is outbound on TCP/443.
// Deployed inside the existing sonara-enterprise Worker; gated by SONARA_R2_RELAY_ENABLED.
// R2 objects remain private. Do not place credentials in code or notebook cells.
const PREFIX = 'relay-v1/';
const json = (body, status=200) => new Response(JSON.stringify(body), {status,headers:{'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':'https://sonaraenterprise.com'}});
const bearer = (r) => r.headers.get('X-Sonara-Relay-Token') || (r.headers.get('Authorization')||'').replace(/^Bearer /i,'');
const hasWorkerAuth = (r,e) => Boolean(e.SONARA_RELAY_TOKEN) && bearer(r)===e.SONARA_RELAY_TOKEN;
const hasSubmitAuth = (r,e) => Boolean(e.SONARA_INTERNAL_PROXY_SECRET) && r.headers.get('X-Sonara-Internal-Secret')===e.SONARA_INTERNAL_PROXY_SECRET;
const key = id => PREFIX+'jobs/'+id+'.json';
const valid = id => /^sr2_[0-9a-f-]{36}$/.test(id||'');
const getRecord = async (b,id) => { const o=await b.get(key(id));return o?o.json():null; };
const saveRecord = (b,id,record,options={}) => b.put(key(id), JSON.stringify(record), {httpMetadata:{contentType:'application/json'},...options});
const audioKey=(id,index)=>PREFIX+'audio/'+id+'/'+index+'.wav';
const isService = path => path.startsWith('/api/sonara-relay/');
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
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:{'access-control-allow-origin':'https://sonaraenterprise.com','access-control-allow-methods':'GET,POST,PUT,OPTIONS','access-control-allow-headers':'Content-Type,X-Sonara-Internal-Secret,X-Sonara-Relay-Token,Authorization'}});
  if(env.SONARA_R2_RELAY_ENABLED!=='true'||!b) return json({error:'SONARA relay not configured'},503);
  // Enqueue only from the Vercel billing/auth gateway using shared secret.
  if(p==='/api/sonara-relay/enqueue'&&request.method==='POST') {
    if(!hasSubmitAuth(request,env))return json({error:'Unauthorized'},401);
    const raw=await request.text();
    if(raw.length>MAX_REQ)return json({error:'Request too large'},413);
    let payload;try{payload=JSON.parse(raw);}catch{return json({error:'Invalid JSON'},400);}
    if(!payload||typeof payload!=='object'||Array.isArray(payload))return json({error:'Invalid payload'},400);
    const id='sr2_'+crypto.randomUUID(),now=Date.now();
    const record={id,status:'QUEUED',createdAt:now,updatedAt:now,leaseUntil:0,attempts:0,payload,files:[],error:null};
    await saveRecord(b,id,record);
    return json({jobId:id,status:'PROCESSING',progress:0,provider:'molab',model:'acestep-v15-xl-turbo'},202);
  }
  // MoLab polls through HTTPS/443, authenticates with a Worker secret.
  if(p==='/api/sonara-relay/claim'&&request.method==='POST') {
    if(!hasWorkerAuth(request,env))return json({error:'Unauthorized'},401);
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
        const saved=await b.put(item.key,JSON.stringify(next),{onlyIf:{etagMatches:obj.httpEtag},httpMetadata:{contentType:'application/json'}});
        if(!saved)continue;
        return json({jobId:j.id,payload:j.payload,leaseId:lease});
      }catch{continue;}
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
      if(!j)return json({error:'Not found'},404);
      // Only public, non-sensitive progress metadata. Never return user prompt, lease or token.
      const urls=await Promise.all(j.files.map((_,i)=>signAudio(id,i,env)));
      return json({jobId:id,status:j.status==='COMPLETE'?'COMPLETED':j.status==='FAILED'?'FAILED':'PROCESSING',progress:j.status==='COMPLETE'?100:j.status==='LEASED'?50:0,error:j.error,provider:'molab',model:'acestep-v15-xl-turbo',audioUrl:urls[0]||null,audioUrls:urls,candidates:urls.map((u,i)=>({id:i===0?'A':'B',audioUrl:u,provider:'molab',model:'acestep-v15-xl-turbo'}))});
    }
    if(action==='audio'&&request.method==='GET') {
      const idx=Number(parts[2]);
      if(!hasSubmitAuth(request,env)&&!(Number.isInteger(idx)&&await verifyAudio(id,idx,url,env)))return json({error:'Unauthorized'},401);
      const j=await getRecord(b,id);
      if(!j||j.status!=='COMPLETE')return json({error:'Audio not ready'},404);
      const i=Number(parts[2]);if(!Number.isInteger(i)||i<0||i>=j.files.length)return json({error:'Not found'},404);
      const obj=await b.get(audioKey(id,i));
      if(!obj)return json({error:'Not found'},404);
      return new Response(obj.body,{headers:{'content-type':'audio/wav','cache-control':'private, max-age=300','accept-ranges':'none','access-control-allow-origin':'https://sonaraenterprise.com'}});
    }
    if(!hasWorkerAuth(request,env))return json({error:'Unauthorized'},401);
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
