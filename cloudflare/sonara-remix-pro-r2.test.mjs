import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRemixPro, proCapabilities, PRO_AGENT_REVISION } from './sonara-remix-pro-r2.mjs';
import { deriveRelayGatewayInternalKey } from './sonara-gateway-verifier.mjs';

const END='https://api.sonaraenterprise.com';
const USER='owner-123';
const OTHER='other-user';
const TOKEN='private-relay-test-token-001';
const SECRET='private-billing-gateway-test-secret';
const A='sref_11111111-1111-4111-8111-111111111111';
const B='sref_22222222-2222-4222-8222-222222222222';
const JOB='srpro_33333333-3333-4333-8333-333333333333';
let serial=0;
const wav=()=>{const data=new Uint8Array(300);data.set([82,73,70,70],0);data.set([87,65,86,69],8);return data;};
function bucket(){
  const store=new Map();
  const persist=(k,body)=>{const bytes=typeof body==='string'?new TextEncoder().encode(body):body instanceof Uint8Array?body:new Uint8Array(body);const etag='"etag-'+(++serial)+'"';store.set(k,{bytes,etag});return {etag};};
  for(const id of [A,B]){
    persist('relay-v1/references/'+id+'/source',wav());
    persist('relay-v1/references/'+id+'.json',JSON.stringify({
      id,ownerUid:USER,objectKey:'relay-v1/references/'+id+'/source',
      filename:id+'.wav',contentType:'audio/wav',expiresAt:Date.now()+3600_000
    }));
  }
  const uploads=new Map();
  return {
    store,
    async createMultipartUpload(key){
      const uploadId='upload-'+(++serial);
      uploads.set(uploadId,{key,parts:new Map()});
      return {uploadId};
    },
    resumeMultipartUpload(key,uploadId){
      const entry=uploads.get(uploadId);
      assert.equal(entry?.key,key);
      return {
        async uploadPart(n,raw){
          entry.parts.set(n,new Uint8Array(raw));
          return {etag:'part-'+n};
        },
        async complete(parts){
          const chunks=parts.map(x=>entry.parts.get(x.partNumber));
          const length=chunks.reduce((sum,x)=>sum+x.length,0);
          const data=new Uint8Array(length);
          let offset=0;
          for(const piece of chunks){data.set(piece,offset);offset+=piece.length;}
          persist(key,data);
          return {size:length};
        }
      };
    },
    async get(k,opts){
      const found=store.get(k);if(!found)return null;
      let bytes=found.bytes;
      if(opts?.range)bytes=bytes.slice(opts.range.offset,opts.range.offset+opts.range.length);
      return {etag:found.etag,size:found.bytes.length,
        async json(){return JSON.parse(new TextDecoder().decode(bytes));},
        body:new Blob([bytes]).stream()};
    },
    async head(k){const d=store.get(k);return d?{size:d.bytes.length,etag:d.etag}:null},
    async put(k,body,options){
      if(options?.onlyIf?.etagMatches&&store.get(k)?.etag!==options.onlyIf.etagMatches)return null;
      let bytes;
      if(body instanceof ReadableStream)bytes=new Uint8Array(await new Response(body).arrayBuffer());
      else bytes=body;
      return persist(k,bytes);
    },
    async delete(k){store.delete(k)},
    async list({prefix,limit=100}){
      const objects=[...store.keys()].filter(k=>k.startsWith(prefix)).slice(0,limit).map(k=>({key:k}));
      return {objects,truncated:false};
    }
  };
}
function env(flags=true) {
  const reservations=new Map([[JOB,{ownerUid:USER,seconds:30,status:'reserved'}]]);
  const environment={
    SONARA_AUDIO_BUCKET:bucket(),SONARA_R2_RELAY_ENABLED:'true',
    SONARA_REMIX_PRO_ENABLED:flags?'true':'false',
    SONARA_REMIX_PRO_BILLING_READY:flags?'true':'false',
    SONARA_RELAY_TOKEN:'test-only-remix-pro-relay-root-12345678901234567890'
  };
  environment.SONARA_AUTH={
    idFromName:name=>name,
    get:()=>({fetch:async request=>{
      const expected=await deriveRelayGatewayInternalKey(environment);
      if(request.headers.get('X-Sonara-Internal-Secret')!==expected)
        return Response.json({ok:false},{status:401});
      const {action,jobId,ownerUid,seconds}=await request.json();
      const reservation=reservations.get(jobId);
      if(!reservation)return Response.json({ok:false},{status:404});
      if(action==='verify'&&(
        reservation.status!=='reserved'||ownerUid!==reservation.ownerUid||
        seconds!==reservation.seconds))return Response.json({ok:false},{status:409});
      if(action==='commit'||action==='refund'){
        if(environment.__failSettlement)return Response.json({ok:false},{status:503});
        if(reservation.status!=='reserved')return Response.json({ok:false},{status:409});
        reservation.status=action==='commit'?'committed':'refunded';
      }
      return Response.json({ok:true});
    }})
  };
  environment.__reservations=reservations;
  environment.__failSettlement=false;
  return environment;
}
const req=(method,path,body,headers={})=>new Request(END+path,{method,
  headers:{...headers,...(body&&!(body instanceof Uint8Array)?{'content-type':'application/json'}:{})},
  ...((body===undefined)?{}:{body:body instanceof Uint8Array?body:JSON.stringify(body)})
});
const auth={
  gateway:r=>r.headers.get('x-sonara-internal-secret')===SECRET,
  gatewayOwner:r=>r.headers.get('x-sonara-user-uid')||'',
  agent:r=>r.headers.get('x-sonara-relay-token')===TOKEN,
  user:async r=>({uid:r.headers.get('x-mock-user')||OTHER})
};
const call=(environment,method,path,body,headers={})=>
  handleRemixPro(req(method,path,body,headers),environment,{waitUntil:x=>x},auth);
const agent={'x-sonara-relay-token':TOKEN,'x-sonara-pro-agent-revision':PRO_AGENT_REVISION};
const owner={'x-mock-user':USER};
const gate={'x-sonara-internal-secret':SECRET,'x-sonara-user-uid':USER};
const spec={jobId:JOB,sourceA:A,sourceB:B,rightsConfirmed:true,prompt:'Compose a coherent genre-true remix',
  durationSec:30,bpmA:120,bpmB:122,bassFrom:'a'};

test('Remix Pro fails closed until both billing approval and GPU heartbeat',async()=>{
  const environment=env();
  let caps=await proCapabilities(environment);
  assert.equal(caps.available,false);
  const before=await call(environment,'POST','/api/sonara-relay/pro-enqueue',spec,gate);
  assert.equal(before.status,503);
  const bad=await call(environment,'POST','/api/sonara-relay/pro-heartbeat',{gpuReady:true},
    {'x-sonara-relay-token':TOKEN,'x-sonara-pro-agent-revision':'untrusted'});
  assert.equal(bad.status,401);
  const heartbeat=await call(environment,'POST','/api/sonara-relay/pro-heartbeat',{gpuReady:true},agent);
  assert.equal(heartbeat.status,200);
  caps=await proCapabilities(environment);
  assert.equal(caps.available,true);
  const disabled=env(false);
  assert.equal((await proCapabilities(disabled)).available,false);
  const denied=await call(disabled,'POST','/api/sonara-relay/pro-enqueue',spec,gate);
  assert.equal(denied.status,503);
});

test('Enqueue accepts unlimited Pro jobs without any Studio usage consent',async()=>{
  const e=env();
  await call(e,'POST','/api/sonara-relay/pro-heartbeat',{gpuReady:true},agent);
  assert.equal((await call(e,'POST','/api/sonara-relay/pro-enqueue',spec,gate)).status,202);
});

test('Enqueue rejects unowned audio, missing rights and anonymous gateway',async()=>{
  const e=env();
  await call(e,'POST','/api/sonara-relay/pro-heartbeat',{gpuReady:true},agent);
  assert.equal((await call(e,'POST','/api/sonara-relay/pro-enqueue',spec)).status,401);
  assert.equal((await call(e,'POST','/api/sonara-relay/pro-enqueue',{...spec,rightsConfirmed:false},gate)).status,400);
  assert.equal((await call(e,'POST','/api/sonara-relay/pro-enqueue',{...spec,sourceB:A},gate)).status,400);
  assert.equal((await call(e,'POST','/api/sonara-relay/pro-enqueue',{...spec,sourceB:'sref_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'},gate)).status,404);
  assert.equal((await call(e,'POST','/api/sonara-relay/pro-enqueue',spec,{...gate,'x-sonara-user-uid':OTHER})).status,404);
});

test('Two-source pro job stays private through lease, stem, output and completion',async()=>{
  const e=env();
  await call(e,'POST','/api/sonara-relay/pro-heartbeat',{gpuReady:true},agent);
  const answer=await call(e,'POST','/api/sonara-relay/pro-enqueue',spec,gate);
  assert.equal(answer.status,202);
  const initial=await answer.json();
  assert.match(initial.jobId,/^srpro_/);
  assert.equal((await call(e,'POST','/api/sonara-relay/pro-enqueue',spec,gate)).status,409);
  const id=initial.jobId,job='/api/sonara-relay/pro-job/'+id;
  assert.equal((await call(e,'GET',job,undefined,{'x-mock-user':OTHER})).status,404);
  const previous=await call(e,'GET',job,undefined,owner);
  assert.equal((await previous.json()).status,'PROCESSING');
  const claimed=await call(e,'POST','/api/sonara-relay/pro-claim',{},agent);
  const {leaseId,jobId,params}=await claimed.json();
  assert.equal(jobId,id);
  assert.equal(params.bpmA,120);
  assert.equal((await call(e,'POST','/api/sonara-relay/pro-claim',{},agent).then(r=>r.json())).jobId,null);
  assert.equal((await call(e,'GET',job+'/source/a',undefined,{...agent,'x-sonara-pro-lease':'invalid'})).status,409);
  const binary=await call(e,'GET',job+'/source/a',undefined,{...agent,'x-sonara-pro-lease':leaseId});
  assert.equal(binary.status,200);
  assert.equal((await binary.arrayBuffer()).byteLength,300);
  const leaseHeaders={...agent,'x-sonara-pro-lease':leaseId};
  assert.equal((await call(e,'POST',job+'/progress',{stage:'separating'},leaseHeaders)).status,200);
  assert.equal((await call(e,'POST',job+'/renew',{},leaseHeaders)).status,200);
  for(const role of ['vocals-a','drums-b','bass-a','other-a']){
    assert.equal((await call(e,'PUT',job+'/stem/'+role,wav(),leaseHeaders)).status,200);
  }
  assert.equal((await call(e,'PUT',job+'/audio',wav(),leaseHeaders)).status,200);
  assert.equal((await call(e,'POST',job+'/complete',{},leaseHeaders)).status,200);
  const done=await call(e,'GET',job,undefined,owner);
  const state=await done.json();
  assert.equal(state.status,'COMPLETED');
  assert.equal(state.stems.length,4);
  assert.ok(state.audioUrl.includes(id));
  const master=await call(e,'GET',job+'/audio',undefined,owner);
  assert.equal(master.status,200);
  assert.equal((await master.arrayBuffer()).byteLength,300);
  const range=await call(e,'GET',job+'/audio',undefined,{'x-mock-user':USER,range:'bytes=10-19'});
  assert.equal(range.status,206);
  assert.equal((await range.arrayBuffer()).byteLength,10);
  assert.equal((await call(e,'GET',job+'/stem/drums-b',undefined,{'x-mock-user':OTHER})).status,404);
  assert.equal((await call(e,'GET',job+'/source/a',undefined,leaseHeaders)).status,409);
  assert.equal(e.SONARA_AUDIO_BUCKET.store.has('relay-v1/references/'+A+'/source'),false);
  assert.equal(e.SONARA_AUDIO_BUCKET.store.has('relay-v1/references/'+B+'/source'),false);
  assert.equal(e.__reservations.get(JOB).status,'committed');
});

test('Remix Pro refuses jobs without a matching authenticated private reservation',async()=>{
  const e=env();
  await call(e,'POST','/api/sonara-relay/pro-heartbeat',{gpuReady:true},agent);
  const missing='srpro_44444444-4444-4444-8444-444444444444';
  assert.equal((await call(e,'POST','/api/sonara-relay/pro-enqueue',
    {...spec,jobId:missing},gate)).status,409);
  assert.equal((await call(e,'POST','/api/sonara-relay/pro-enqueue',
    {...spec,durationSec:120},gate)).status,409);
  assert.equal((await call(e,'POST','/api/sonara-relay/pro-enqueue',
    {...spec,jobId:'bad-id'},gate)).status,400);
});

test('Terminal R2 job stays COMPLETE when private quota settlement is unavailable',async()=>{
  const e=env();
  await call(e,'POST','/api/sonara-relay/pro-heartbeat',{gpuReady:true},agent);
  const answer=await call(e,'POST','/api/sonara-relay/pro-enqueue',spec,gate);
  assert.equal(answer.status,202);
  const claimed=await call(e,'POST','/api/sonara-relay/pro-claim',{},agent);
  const {leaseId,jobId}=await claimed.json();
  const leaseHeaders={...agent,'x-sonara-pro-lease':leaseId};
  const endpoint='/api/sonara-relay/pro-job/'+jobId;
  assert.equal((await call(e,'PUT',endpoint+'/audio',wav(),leaseHeaders)).status,200);
  e.__failSettlement=true;
  const completed=await call(e,'POST',endpoint+'/complete',{},leaseHeaders);
  assert.equal(completed.status,202);
  const body=await completed.json();
  assert.equal(body.ok,true);
  assert.equal(body.settlementPending,true);
  const ownerStatus=await call(e,'GET',endpoint,undefined,owner);
  assert.equal((await ownerStatus.json()).status,'COMPLETED');
  assert.equal(e.__reservations.get(JOB).status,'reserved');
  // A follow-up failure report cannot overwrite the completed master.
  assert.equal((await call(e,'POST',endpoint+'/fail',{},leaseHeaders)).status,409);
});

test('Remix Pro supports 8-minute duration and long master via multipart',async()=>{
  const e=env();
  e.__reservations.set(JOB,{ownerUid:USER,seconds:480,status:'reserved'});
  await call(e,'POST','/api/sonara-relay/pro-heartbeat',{gpuReady:true},agent);
  assert.equal((await call(e,'POST','/api/sonara-relay/pro-enqueue',
    {...spec,durationSec:480},gate)).status,202);
  const claimed=await call(e,'POST','/api/sonara-relay/pro-claim',{},agent);
  assert.equal(claimed.status,200);
  const {jobId,leaseId,params}=await claimed.json();
  assert.equal(params.durationSec,480);
  const path='/api/sonara-relay/pro-job/'+jobId+'/audio';
  const signed={...agent,'x-sonara-pro-lease':leaseId};
  const size=8*1024*1024+2048;
  const begin=await call(e,'POST',path+'/start',{bytes:size},signed);
  assert.equal(begin.status,200);
  const first=new Uint8Array(8*1024*1024);
  first.set([82,73,70,70],0);first.set([87,65,86,69],8);
  const part1=await call(e,'PUT',path+'/part/1',first,signed);
  assert.equal(part1.status,200);
  const part2=await call(e,'PUT',path+'/part/2',new Uint8Array(2048),signed);
  assert.equal(part2.status,200);
  const finish=await call(e,'POST',path+'/finish',{
    parts:[{partNumber:1,etag:'part-1'},{partNumber:2,etag:'part-2'}]
  },signed);
  assert.equal(finish.status,200);
  const complete=await call(e,'POST','/api/sonara-relay/pro-job/'+jobId+'/complete',{},signed);
  assert.equal(complete.status,200);
  const ownerStatus=await call(e,'GET','/api/sonara-relay/pro-job/'+jobId,undefined,owner);
  assert.equal((await ownerStatus.json()).status,'COMPLETED');
});

test('compressed sources require verified decoder-ready GPU heartbeat',async()=>{
  const e=env();
  const metaKey='relay-v1/references/'+A+'.json';
  e.SONARA_AUDIO_BUCKET.store.set(metaKey,{
    bytes:new TextEncoder().encode(JSON.stringify({
      id:A,ownerUid:USER,objectKey:'relay-v1/references/'+A+'/source',
      format:'mp3',filename:'licensed.mp3',contentType:'audio/mpeg',
      expiresAt:Date.now()+3600_000
    })),etag:'"mp3-meta"'
  });
  await call(e,'POST','/api/sonara-relay/pro-heartbeat',{gpuReady:true},agent);
  const rejected=await call(e,'POST','/api/sonara-relay/pro-enqueue',spec,gate);
  assert.equal(rejected.status,503);
  assert.equal((await proCapabilities(e)).multiformatAvailable,false);
  await call(e,'POST','/api/sonara-relay/pro-heartbeat',{gpuReady:true,formatsReady:true},agent);
  assert.equal((await proCapabilities(e)).multiformatAvailable,true);
  const accepted=await call(e,'POST','/api/sonara-relay/pro-enqueue',spec,gate);
  assert.equal(accepted.status,202);
  const claim=await call(e,'POST','/api/sonara-relay/pro-claim',{},agent);
  assert.equal((await claim.json()).sourceFormatA,'mp3');
});
