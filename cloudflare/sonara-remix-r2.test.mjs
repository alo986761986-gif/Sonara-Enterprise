import test from 'node:test';
import assert from 'node:assert/strict';
import runtime from './sonara-r2-https-relay.mjs';

const endpoint='https://api.sonaraenterprise.com/api/sonara-relay/';
const token='test-notebook-token-super-long-random-sample-private';
const secret='test-private-gateway-secret';
const owner='sonara-test-owner';
const id='sref_12345678-1234-1234-1234-123456789abc';
const binary=new Uint8Array(48).fill(7);

function bucket(){
  const data=new Map();
  const stamp=()=>new Date();
  data.set('relay-v1/references/'+id+'/source',{body:binary,at:stamp()});
  data.set('relay-v1/references/'+id+'.json',{body:JSON.stringify({
    id,ownerUid:owner,objectKey:'relay-v1/references/'+id+'/source',
    filename:'original.wav',contentType:'audio/wav',
    expiresAt:Date.now()+3600000
  }),at:stamp()});
  return {
    data,
    async get(key){
      const value=data.get(key);
      if(!value)return null;
      const bytes=typeof value.body==='string'?new TextEncoder().encode(value.body):value.body;
      return {json:async()=>JSON.parse(new TextDecoder().decode(bytes)),
        body:new Blob([bytes]).stream(),size:bytes.length,etag:'"fake-r2-etag"',httpEtag:'"fake-r2-etag"',uploaded:value.at};
    },
    async head(key){
      const value=data.get(key);if(!value)return null;
      const bytes=typeof value.body==='string'?new TextEncoder().encode(value.body):value.body;
      return {size:bytes.length,etag:'"fake-r2-etag"',httpEtag:'"fake-r2-etag"',uploaded:value.at};
    },
    async put(key,body){
      let bytes=body;
      if(body instanceof ReadableStream)bytes=new Uint8Array(await new Response(body).arrayBuffer());
      data.set(key,{body:bytes,at:stamp()});
      return {etag:'"fake-r2-etag"'};
    },
    async delete(key){data.delete(key)},
    async list({prefix}){
      const objects=[...data.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key,etag:'"fake-r2-etag"'}));
      return {objects,truncated:false};
    }
  };
}
function env(active=true){
  return {SONARA_AUDIO_BUCKET:bucket(),SONARA_RELAY_TOKEN:token,
    SONARA_INTERNAL_PROXY_SECRET:secret,SONARA_R2_RELAY_ENABLED:'true',
    SONARA_REMIX_R2_ENABLED:active?'true':'false'};
}
function request(method,path,options={}){return new Request(endpoint+path,{method,...options})}
async function auth(environment,revision='sonara-remix-r2-agent-v6'){
  return runtime.fetch(request('GET','auth',{headers:{
    'X-Sonara-Relay-Token':token,'X-Sonara-Agent-Revision':revision
  }}),environment,{});
}
async function capabilities(environment){
  const response=await runtime.fetch(request('GET','remix-capabilities'),environment,{});
  assert.equal(response.status,200);
  return response.json();
}
function enqueue(sourceId=id,user=owner){
  return request('POST','enqueue',{headers:{
    'X-Sonara-Internal-Secret':secret,'X-Sonara-User-Uid':user,
    'Content-Type':'application/json'
  },body:JSON.stringify({sonaraRemixSourceId:sourceId,prompt:'Original remix',
    audio_duration:45,batch_size:2,task_type:'text2music'})});
}

test('R2 Remix starts disabled with an old agent and becomes available on v6 heartbeat only',async()=>{
  const environment=env();
  assert.equal((await capabilities(environment)).available,false);
  assert.equal((await auth(environment,'sonara-https-agent-guard-v5')).status,200);
  assert.equal((await capabilities(environment)).available,false);
  assert.equal((await auth(environment)).status,200);
  const caps=await capabilities(environment);
  assert.equal(caps.available,true);
  assert.equal(caps.agentCompatible,true);
});

test('R2 Remix stays closed when the rollout flag is off',async()=>{
  const environment=env(false);
  await auth(environment);
  assert.equal((await capabilities(environment)).available,false);
  const response=await runtime.fetch(enqueue(),environment,{});
  assert.equal(response.status,503);
});

test('R2 Remix requires ownership and two-phase lease for source download',async()=>{
  const environment=env();
  await auth(environment);
  const unowned=await runtime.fetch(enqueue(id,'unowned'),environment,{});
  assert.equal(unowned.status,404);
  const accepted=await runtime.fetch(enqueue(),environment,{});
  assert.equal(accepted.status,202);
  const data=await accepted.json();
  assert.match(data.jobId,/^sr2_/);
  let old=await runtime.fetch(request('POST','claim',{headers:{
    'X-Sonara-Relay-Token':token,'X-Sonara-Agent-Revision':'sonara-https-agent-guard-v5'
  }}),environment,{});
  assert.equal((await old.json()).jobId,null);
  const claim=await runtime.fetch(request('POST','claim',{headers:{
    'X-Sonara-Relay-Token':token,'X-Sonara-Agent-Revision':'sonara-remix-r2-agent-v6'
  }}),environment,{});
  const got=await claim.json();
  assert.equal(got.jobId,data.jobId);
  assert.equal(got.payload.task_type,'cover');
  assert.equal(got.payload.batch_size,1);
  assert.equal(got.remixSource.available,true);
  assert.equal(got.payload.sonaraRemixSourceId,undefined);
  const source=await runtime.fetch(request('GET','job/'+data.jobId+'/remix-source',{
    headers:{'X-Sonara-Relay-Token':token,'X-Sonara-Lease':got.leaseId}
  }),environment,{});
  assert.equal(source.status,200);
  assert.equal((await source.arrayBuffer()).byteLength,48);
  const denied=await runtime.fetch(request('GET','job/'+data.jobId+'/remix-source',{
    headers:{'X-Sonara-Relay-Token':token,'X-Sonara-Lease':'wrong'}
  }),environment,{});
  assert.equal(denied.status,409);
});
