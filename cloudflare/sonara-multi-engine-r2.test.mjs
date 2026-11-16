import assert from 'node:assert/strict';
import test from 'node:test';
import { handleSonaraMultiEngine } from './sonara-multi-engine-r2.mjs';

function makeBucket() {
  const data=new Map();
  return {
    data,
    get:async key=>data.has(key)?{json:async()=>JSON.parse(data.get(key)),etag:'test-'+key}:null,
    put:async(key,val)=>{data.set(key,String(val));return {}},
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
  assert.equal(payload.models['heartmula-3b'].ready,false);
  assert.equal(payload.models['stable-audio-3-medium'].ready,false);
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
