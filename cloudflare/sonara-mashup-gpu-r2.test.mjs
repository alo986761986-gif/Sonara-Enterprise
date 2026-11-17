import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleMashupGpu } from './sonara-mashup-gpu-r2.mjs';
const BASE='https://sonaraenterprise.com/api/sonara-relay/';
function bucket(){
  const objects=new Map();
  return {
    objects,
    async get(k){const d=objects.get(k);return d?{
      async json(){return JSON.parse(typeof d==='string'?d:new TextDecoder().decode(d));},
      body:d instanceof Uint8Array?d:new TextEncoder().encode(d),
      etag:'etag-1'}:null;},
    async put(k,value){objects.set(k,typeof value==='string'?value:new Uint8Array(await new Response(value).arrayBuffer()));return {etag:'etag-1'};},
    async head(k){const d=objects.get(k);return d?{size:typeof d==='string'?new TextEncoder().encode(d).length:d.byteLength}:null;},
    async delete(k){objects.delete(k);},
    async list({prefix}){return {objects:[...objects.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))};}
  };
}
const env=()=>({SONARA_AUDIO_BUCKET:bucket(),SONARA_R2_RELAY_ENABLED:'true',SONARA_MASHUP_GPU_ENABLED:'true'});
const auth={user:async()=>({uid:'test-user'}),agent:async()=>true};
const get=(path)=>new Request(BASE+path);
test('Mashup capabilities are unavailable until REAL GPU worker heartbeat',async()=>{
  const e=env();
  const r=await handleMashupGpu(get('mashup-capabilities'),e,{},auth);
  assert.equal(r.status,200);
  const data=await r.json();
  assert.equal(data.available,false);
  assert.equal(data.aceStepUnmodified,true);
});
test('Mashup heartbeat requires authenticated agent with verified GPU and model',async()=>{
  const e=env();
  const blocked=await handleMashupGpu(new Request(BASE+'mashup-heartbeat',{
    method:'POST',body:JSON.stringify({revision:'sonara-mashup-htdemucs-v1',gpuReady:false,demucsReady:true})
  }),e,{},auth);
  assert.equal(blocked.status,409);
  assert.equal((await (await handleMashupGpu(get('mashup-capabilities'),e,{},auth)).json()).available,false);
  const online=await handleMashupGpu(new Request(BASE+'mashup-heartbeat',{
    method:'POST',body:JSON.stringify({revision:'sonara-mashup-htdemucs-v1',gpuReady:true,demucsReady:true})
  }),e,{},auth);
  assert.equal(online.status,200);
  assert.equal((await (await handleMashupGpu(get('mashup-capabilities'),e,{},auth)).json()).available,true);
});
test('browser source cannot upload from unrelated origin or without session',async()=>{
  const e=env();
  await handleMashupGpu(new Request(BASE+'mashup-heartbeat',{
    method:'POST',body:JSON.stringify({revision:'sonara-mashup-htdemucs-v1',gpuReady:true,demucsReady:true})
  }),e,{},auth);
  const data=new Uint8Array(400);
  const wrong=await handleMashupGpu(new Request(BASE+'mashup-source',{
    method:'POST',headers:{origin:'https://attacker.example','content-type':'audio/wav',
      'X-Sonara-Mashup-Name':'clip.wav'},body:data}),e,{},auth);
  assert.equal(wrong.status,403);
  const unauth=await handleMashupGpu(new Request(BASE+'mashup-source',{
    method:'POST',headers:{origin:'https://sonaraenterprise.com','content-type':'audio/wav',
      'X-Sonara-Mashup-Name':'clip.wav'},body:data}),e,{},{
    ...auth,user:async()=>null
  });
  assert.equal(unauth.status,401);
  assert.equal([...e.SONARA_AUDIO_BUCKET.objects.keys()].filter(x=>x.includes('/sources/')).length,0);
});
test('GPU masters never accessible to a different SONARA account',async()=>{
  const e=env();
  e.SONARA_AUDIO_BUCKET.objects.set('relay-v1/mashup/jobs/smash_12345678-1234-1234-1234-123456789abc.json',
    JSON.stringify({id:'smash_12345678-1234-1234-1234-123456789abc',kind:'mashup-gpu',
    ownerUid:'original-user',status:'COMPLETE',stage:'completed',createdAt:1,durationSec:30}));
  const r=await handleMashupGpu(get('mashup-job/smash_12345678-1234-1234-1234-123456789abc/audio'),e,{},auth);
  assert.equal(r.status,404);
});
