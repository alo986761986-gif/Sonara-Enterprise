import assert from 'node:assert/strict';
import test from 'node:test';
import { handleSonaraMultiEngine } from './sonara-multi-engine-r2.mjs';

function makeBucket() {
  const data=new Map();
  return {
    data,
    get:async key=>data.has(key)?{json:async()=>JSON.parse(data.get(key)),etag:'test-'+key}:null,
    put:async(key,val)=>{data.set(key,String(val));return {}},
    delete:async key=>{data.delete(key)},
    head:async key=>data.has(key)?{size:1000}:null,
    list:async ({prefix})=>({objects:[...data.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})).slice(0,30)})
  };
}
const context={waitUntil(){}};
test('capabilities fail closed until GPU heartbeat and explicit activation',async()=>{
  const env={SONARA_AUDIO_BUCKET:makeBucket(),SONARA_MULTI_ENGINE_ENABLED:'false'};
  const resp=await handleSonaraMultiEngine(new Request('https://api.sonaraenterprise.com/api/sonara-multi/capabilities'),env,context);
  assert.equal(resp.status,200);
  const payload=await resp.json();
  assert.deepEqual(payload.models, {});
  assert.equal(payload.version, 'sonara-ace-step-only');
});

test('retired models cannot enqueue even with old cached Creator requests',async()=>{
  const bucket=makeBucket();
  const env={SONARA_AUDIO_BUCKET:bucket,SONARA_MULTI_ENGINE_ENABLED:'false'};
  const response=await handleSonaraMultiEngine(new Request('https://api.sonaraenterprise.com/api/engine/generate',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({sonaraModelId:'heartmula-3b',prompt:'House',durationSec:30})
  }),env,context);
  assert.equal(response.status,410);
  assert.equal(bucket.data.size,0);
});
test('an unauthenticated generation request cannot enqueue a model job',async()=>{
  const bucket=makeBucket();
  const env={SONARA_AUDIO_BUCKET:bucket,SONARA_MULTI_ENGINE_ENABLED:'true',SONARA_INTERNAL_PROXY_SECRET:'private'};
  const response=await handleSonaraMultiEngine(new Request('https://api.sonaraenterprise.com/api/engine/generate',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({sonaraModelId:'heartmula-3b',prompt:'House',durationSec:30})
  }),env,context);
  assert.equal(response.status,401);
  assert.equal(bucket.data.size,0);
});
test('legacy requests remain completely untouched',async()=>{
  const env={SONARA_AUDIO_BUCKET:makeBucket(),SONARA_MULTI_ENGINE_ENABLED:'true'};
  const response=await handleSonaraMultiEngine(new Request('https://api.sonaraenterprise.com/api/engine/generate',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({prompt:'House',durationSec:30})
  }),env,context);
  assert.equal(response,null);
});
test('stale GPU heartbeat cannot allow generation or licensing',async()=>{
  const bucket=makeBucket();
  await bucket.put('multi-engine-v1/agent/heartbeat.json',JSON.stringify({
    timestamp:Date.now()-120000,models:{'heartmula-3b':true,'stable-audio-3-medium':true},
    stableLicenseAccepted:true
  }));
  const env={SONARA_AUDIO_BUCKET:bucket,SONARA_MULTI_ENGINE_ENABLED:'true',SONARA_STABLE_AUDIO_LICENSE_OK:'false',
    SONARA_INTERNAL_PROXY_SECRET:'private'};
  const response=await handleSonaraMultiEngine(new Request('https://api.sonaraenterprise.com/api/sonara-multi/capabilities'),env,context);
  const data=await response.json();
  assert.equal(data.models['heartmula-3b'].ready,false);
  assert.equal(data.models['stable-audio-3-medium'].ready,false);
});

test('multi-engine server keeps an expired lease in the queue for recovery',async()=>{
  const bucket=makeBucket();
  const id='sr2_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const t=Date.now()-60000;
  const key='multi-engine-v1/jobs/'+id+'.json';
  await bucket.put(key, JSON.stringify({
    id,modelId:'heartmula-3b',ownerUid:'test-user',status:'LEASED',
    createdAt:t,updatedAt:t,leaseUntil:t,leaseId:'old-lease',
    attempts:1,audioReady:false,request:{prompt:'house',durationSec:30}
  }));
  await bucket.put('multi-engine-v1/queue/'+String(t).padStart(13,'0')+'/'+id,id);
  await bucket.put('multi-engine-v1/agent/heartbeat.json',JSON.stringify({
    timestamp:Date.now(),models:{'heartmula-3b':true,'stable-audio-3-medium':false},
    stableLicenseAccepted:false
  }));
  const env={SONARA_AUDIO_BUCKET:bucket,SONARA_MULTI_ENGINE_ENABLED:'true',
    SONARA_RELAY_TOKEN:'x'.repeat(50)};
  const request=new Request('https://api.sonaraenterprise.com/api/sonara-multi/agent/claim',{
    method:'POST',headers:{'X-Sonara-Relay-Token':'x'.repeat(50)}
  });
  const response=await handleSonaraMultiEngine(request,env,context);
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.jobId,id);
  assert.equal(result.modelId,'heartmula-3b');
  assert.equal(bucket.data.has('multi-engine-v1/queue/'+String(t).padStart(13,'0')+'/'+id),true);
  const record=JSON.parse(bucket.data.get(key));
  assert.equal(record.status,'LEASED');
  assert.equal(record.attempts,2);
});

test('authorized HeartMuLa job can be claimed, completed and polled by its owner',async()=>{
  const bucket=makeBucket();
  const secret='internal-gateway-test-key';
  const agentToken='z'.repeat(56);
  const user='user-for-music-test';
  const env={
    SONARA_AUDIO_BUCKET:bucket,SONARA_MULTI_ENGINE_ENABLED:'true',
    SONARA_INTERNAL_PROXY_SECRET:secret,SONARA_RELAY_TOKEN:agentToken
  };
  const service='https://api.sonaraenterprise.com';
  const machineHeaders={'X-Sonara-Relay-Token':agentToken};
  const gatewayHeaders={'X-Sonara-Internal-Secret':secret,'X-Sonara-User-Uid':user};
  const heartbeat=await handleSonaraMultiEngine(
    new Request(service+'/api/sonara-multi/agent/heartbeat',{
      method:'POST',headers:machineHeaders,
      body:JSON.stringify({models:{'heartmula-3b':true},stableLicenseAccepted:false})
    }),env,context);
  assert.equal(heartbeat.status,200);
  assert.equal((await heartbeat.json()).available.models['heartmula-3b'].ready,true);

  const enqueue=await handleSonaraMultiEngine(
    new Request(service+'/api/engine/generate',{
      method:'POST',headers:{...gatewayHeaders,'content-type':'application/json'},
      body:JSON.stringify({sonaraModelId:'heartmula-3b',prompt:'Deep house at 124 bpm',durationSec:30})
    }),env,context);
  assert.equal(enqueue.status,202);
  const job=await enqueue.json();
  assert.match(job.jobId,/^sr2_[0-9a-f-]{36}$/);

  const claim=await handleSonaraMultiEngine(
    new Request(service+'/api/sonara-multi/agent/claim',{
      method:'POST',headers:machineHeaders,body:'{}'
    }),env,context);
  assert.equal(claim.status,200);
  const lease=await claim.json();
  assert.equal(lease.jobId,job.jobId);
  assert.equal(lease.modelId,'heartmula-3b');
  assert.equal(lease.request.durationSec,30);

  const unauthorized=await handleSonaraMultiEngine(
    new Request(service+'/api/music/job/'+job.jobId,{
      headers:{'X-Sonara-Internal-Secret':secret,'X-Sonara-User-Uid':'other-user'}
    }),env,context);
  assert.equal(unauthorized.status,404);

  const data=new Uint8Array(64);
  for(const [pos,word] of [[0,'RIFF'],[8,'WAVE']])for(let i=0;i<word.length;i++)data[pos+i]=word.charCodeAt(i);
  const upload=await handleSonaraMultiEngine(
    new Request(service+'/api/sonara-multi/job/'+job.jobId+'/audio',{
      method:'PUT',headers:{...machineHeaders,'X-Sonara-Lease':lease.leaseId,'content-type':'audio/wav'},
      body:data
    }),env,context);
  assert.equal(upload.status,200);
  const complete=await handleSonaraMultiEngine(
    new Request(service+'/api/sonara-multi/job/'+job.jobId+'/complete',{
      method:'POST',headers:{...machineHeaders,'X-Sonara-Lease':lease.leaseId},body:'{}'
    }),env,context);
  assert.equal(complete.status,200);
  const poll=await handleSonaraMultiEngine(
    new Request(service+'/api/music/job/'+job.jobId,{headers:gatewayHeaders}),env,context);
  assert.equal(poll.status,200);
  const result=await poll.json();
  assert.equal(result.status,'COMPLETED');
  assert.equal(result.model,'heartmula-3b');
  assert.equal(result.candidates.length,1);
  assert.equal(result.candidates[0].audioFormat,'wav');
  assert.match(result.audioUrl,/^https:\/\/api\.sonaraenterprise\.com\/api\/sonara-multi\/audio\//);
});

test('new HeartMuLa notebook fingerprint is accepted alongside older relay tokens',async()=>{
  const bucket=makeBucket();
  const token='a-new-private-token-with-at-least-32-chars';
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const env={SONARA_AUDIO_BUCKET:bucket,SONARA_MULTI_ENGINE_ENABLED:'true',
    SONARA_RELAY_TOKEN_SHA256_NONARY:digest};
  const response=await handleSonaraMultiEngine(new Request(
    'https://api.sonaraenterprise.com/api/sonara-multi/agent/heartbeat',
    {method:'POST',headers:{'X-Sonara-Relay-Token':token},
     body:JSON.stringify({models:{'heartmula-3b':true,'stable-audio-3-medium':false},stableLicenseAccepted:false})}
  ),env,context);
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.available.models['heartmula-3b'].ready,true);
  assert.equal(data.available.models['stable-audio-3-medium'].ready,false);
  const wrong=await handleSonaraMultiEngine(new Request(
    'https://api.sonaraenterprise.com/api/sonara-multi/agent/heartbeat',
    {method:'POST',headers:{'X-Sonara-Relay-Token':'other-private-token-with-32-characters'},body:'{}'}
  ),env,context);
  assert.equal(wrong.status,401);
});
