import assert from 'node:assert/strict';
import test from 'node:test';
import {
  selectedCreatorOpenModel, enqueueCreatorOpenModel,
  isCreatorOpenModelJob, pollCreatorOpenModelJob
} from './sonara-creator-open-model-route.mjs';
import { handleSonaraMultiEngine } from './sonara-multi-engine-r2.mjs';

const service = 'https://sonaraenterprise.com';
const ctx = {waitUntil(){}};
function makeBucket() {
  const data = new Map();
  return {
    data,
    get:async k=>data.has(k)?{json:async()=>JSON.parse(data.get(k))}:null,
    head:async k=>data.has(k)?{size:data.get(k).length}:null,
    put:async(k,v)=>{data.set(k,String(v));return {}},
    delete:async k=>{data.delete(k)},
    list:async ({prefix})=>({objects:[...data.keys()].filter(x=>x.startsWith(prefix)).map(key=>({key}))})
  };
}
const token = 's'.repeat(55);
const secret = 'sonara-private-derived-gateway-secret';
function env() {
  return {SONARA_AUDIO_BUCKET:makeBucket(),SONARA_MULTI_ENGINE_ENABLED:'true',SONARA_RELAY_TOKEN:token};
}
async function heartbeat(e) {
  const res = await handleSonaraMultiEngine(new Request(service+'/api/sonara-multi/agent/heartbeat',{
    method:'POST',headers:{'X-Sonara-Relay-Token':token},
    body:JSON.stringify({models:{'heartmula-3b':true,'stable-audio-3-medium':false},stableLicenseAccepted:false})
  }),e,ctx);
  assert.equal(res.status,200);
}
test('selects open models only from explicitly marked Creator jobs',()=>{
  assert.equal(selectedCreatorOpenModel({sonaraMultiEngineCreatorRequest:true,sonaraModelId:'heartmula-3b'}),'heartmula-3b');
  assert.equal(selectedCreatorOpenModel({sonaraMultiEngineCreatorRequest:true,sonaraModelId:'stable-audio-3-medium'}),'stable-audio-3-medium');
  assert.equal(selectedCreatorOpenModel({sonaraModelId:'heartmula-3b'}),'');
  assert.equal(selectedCreatorOpenModel({sonaraMultiEngineCreatorRequest:true,sonaraModelId:'ace-step'}),'');
  assert.equal(selectedCreatorOpenModel({sonaraMultiEngineCreatorRequest:true,sonaraModelId:'unknown'}),'');
  assert.equal(selectedCreatorOpenModel({sonaraMultiEngineCreatorRequest:true,sonaraModelId:'heartmula-3b',sonaraRemixPro:true}),'heartmula-3b');
});
test('creator routes to HeartMuLa R2 without the ACE-Step heartbeat, and enforces owner on polling',async()=>{
  const e=env();await heartbeat(e);
  const body={sonaraMultiEngineCreatorRequest:true,sonaraModelId:'heartmula-3b',prompt:'House',durationSec:30};
  const res=await enqueueCreatorOpenModel(body,e,ctx,'owner-123',secret,service);
  assert.equal(res.status,202);
  const created=await res.json();
  assert.match(created.jobId,/^sr2_[0-9a-f-]{36}$/);
  const pollReq=new Request(service+'/api/billing/job?jobId='+encodeURIComponent(created.jobId));
  assert.equal(await isCreatorOpenModelJob(pollReq,e),true);
  const wrong=await pollCreatorOpenModelJob(pollReq,e,ctx,'other-owner',secret);
  assert.equal(wrong.status,404);
  const good=await pollCreatorOpenModelJob(pollReq,e,ctx,'owner-123',secret);
  assert.equal(good.status,200);
  const status=await good.json();
  assert.equal(status.model,'heartmula-3b');
  assert.equal(status.status,'PROCESSING');
});
test('old ACE-Step jobs with shared sr2 IDs are never mistaken for open-model jobs',async()=>{
  const e=env();
  const old='sr2_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await e.SONARA_AUDIO_BUCKET.put('relay-v1/jobs/'+old+'.json',JSON.stringify({id:old,status:'QUEUED'}));
  const req=new Request(service+'/api/billing/job?jobId='+old);
  assert.equal(await isCreatorOpenModelJob(req,e),false);
  assert.equal(await isCreatorOpenModelJob(new Request(service+'/api/billing/job?jobId=d16pair_xyz'),e),false);
});
test('unavailable open model is rejected, never queued in legacy ACE-Step',async()=>{
  const e=env();
  const body={sonaraMultiEngineCreatorRequest:true,sonaraModelId:'heartmula-3b',prompt:'House',durationSec:30};
  const res=await enqueueCreatorOpenModel(body,e,ctx,'owner-123',secret,service);
  assert.equal(res.status,503);
  assert.equal([...e.SONARA_AUDIO_BUCKET.data.keys()].filter(x=>x.startsWith('multi-engine-v1/jobs/')).length,0);
});
test('open-model billing/polling refuses absent or malformed owner credentials',async()=>{
  const e=env();await heartbeat(e);
  const body={sonaraMultiEngineCreatorRequest:true,sonaraModelId:'heartmula-3b',prompt:'House',durationSec:30};
  const res=await enqueueCreatorOpenModel(body,e,ctx,'',secret,service);
  assert.equal(res.status,401);
  assert.equal([...e.SONARA_AUDIO_BUCKET.data.keys()].filter(x=>x.startsWith('multi-engine-v1/jobs/')).length,0);
  const req=new Request(service+'/api/billing/job?jobId=sr2_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  const denied=await pollCreatorOpenModelJob(req,e,ctx,'',secret);
  assert.equal(denied.status,401);
});
