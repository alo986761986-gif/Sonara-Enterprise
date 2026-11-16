import test from 'node:test';
import assert from 'node:assert/strict';
import {handleNativeOpenModelCreator} from './sonara-native-open-model-entry.mjs';
import {handleSonaraMultiEngine} from './sonara-multi-engine-r2.mjs';

const root='https://sonaraenterprise.com';
const context={waitUntil(){}};
const token='a'.repeat(60);
function bucket() {
  const data=new Map();
  return {
    data,
    get:async key=>data.has(key)?{json:async()=>JSON.parse(data.get(key))}:null,
    head:async key=>data.has(key)?{size:data.get(key).length}:null,
    put:async(key,val)=>{data.set(key,String(val));return {}},
    delete:async key=>{data.delete(key)},
    list:async({prefix})=>({objects:[...data.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key}))})
  };
}
function environment() {
  return {SONARA_AUDIO_BUCKET:bucket(),SONARA_MULTI_ENGINE_ENABLED:'true',SONARA_RELAY_TOKEN:token};
}
function nativeAuth(valid=true,limit=60) {
  return async request=>{
    const pathname=new URL(request.url).pathname;
    if(pathname==='/api/sonara-auth/session') {
      if(!valid || request.headers.get('cookie')!=='sonara_session=valid')
        return new Response(JSON.stringify({authenticated:false}),{status:401});
      return new Response(JSON.stringify({authenticated:true,user:{uid:'owner-abc'}}),{status:200});
    }
    if(pathname==='/api/billing/status') {
      if(!valid || request.headers.get('cookie')!=='sonara_session=valid')
        return new Response(JSON.stringify({error:'Unauthorized'}),{status:401});
      return new Response(JSON.stringify({billing:{planId:'free',maxTrackSeconds:limit,remainingSeconds:600}}),{status:200});
    }
    throw new Error('Unexpected auth call');
  };
}
function req(path,body,authorized=true) {
  return new Request(root+path,{
    method:body?'POST':'GET',
    headers:body?{'content-type':'application/json',cookie:authorized?'sonara_session=valid':''}:{cookie:authorized?'sonara_session=valid':''},
    ...(body?{body:JSON.stringify(body)}:{})
  });
}
const modelBody={sonaraMultiEngineCreatorRequest:true,sonaraModelId:'heartmula-3b',prompt:'House groove',durationSec:30};
async function heartbeat(e) {
  const result=await handleSonaraMultiEngine(new Request(root+'/api/sonara-multi/agent/heartbeat',{
    method:'POST',headers:{'X-Sonara-Relay-Token':token},
    body:JSON.stringify({models:{'heartmula-3b':true},stableLicenseAccepted:false})
  }),e,context);
  assert.equal(result.status,200);
}
test('new native gateway bypasses old ACE-Step relay without weakening billing and ownership',async()=>{
  const e=environment();
  await heartbeat(e);
  const result=await handleNativeOpenModelCreator(req('/api/billing/generate',modelBody),e,context,nativeAuth());
  assert.equal(result.status,202);
  assert.equal(result.headers.get('content-type').includes('application/json'),true);
  assert.equal(result.headers.get('x-sonara-open-model-stage'),'native-open-model-enqueue');
  const created=await result.json();
  assert.match(created.jobId,/^sr2_[0-9a-f-]{36}$/);
  assert.equal(await e.SONARA_AUDIO_BUCKET.head('multi-engine-v1/jobs/'+created.jobId+'.json')!==null,true);
  const polled=await handleNativeOpenModelCreator(req('/api/billing/job?jobId='+created.jobId),e,context,nativeAuth());
  assert.equal(polled.status,200);
  assert.equal((await polled.json()).model,'heartmula-3b');
  const unauthorized=await handleNativeOpenModelCreator(req('/api/billing/job?jobId='+created.jobId,null,false),e,context,nativeAuth());
  assert.equal(unauthorized.status,401);
  assert.equal(unauthorized.headers.get('content-type').includes('application/json'),true);
});
test('invalid session and plan limit never create an R2 job',async()=>{
  const e=environment(); await heartbeat(e);
  const denied=await handleNativeOpenModelCreator(req('/api/billing/generate',modelBody,false),e,context,nativeAuth());
  assert.equal(denied.status,401);
  const plan=await handleNativeOpenModelCreator(req('/api/billing/generate',{...modelBody,durationSec:120}),e,context,nativeAuth());
  assert.equal(plan.status,403);
  assert.equal([...e.SONARA_AUDIO_BUCKET.data.keys()].filter(k=>k.startsWith('multi-engine-v1/jobs/')).length,0);
});
test('legacy, Remix Pro and ACE-Step requests remain untouched',async()=>{
  const e=environment();
  assert.equal(await handleNativeOpenModelCreator(req('/api/billing/generate',{prompt:'House',durationSec:30}),e,context,nativeAuth()),null);
  assert.equal(await handleNativeOpenModelCreator(req('/api/billing/generate',{...modelBody,sonaraRemixPro:true}),e,context,nativeAuth()),null);
  assert.equal(await handleNativeOpenModelCreator(req('/api/billing/job?jobId=sr2_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),e,context,nativeAuth()),null);
  assert.equal(await handleNativeOpenModelCreator(new Request('https://api.sonaraenterprise.com/api/sonara-multi/capabilities'),e,context,nativeAuth()),null);
});
test('new model unavailable returns valid 503 JSON instead of legacy relay offline HTML',async()=>{
  const e=environment();
  const response=await handleNativeOpenModelCreator(req('/api/billing/generate',modelBody),e,context,nativeAuth());
  assert.equal(response.status,503);
  assert.equal(response.headers.get('content-type').includes('application/json'),true);
  assert.equal(typeof (await response.json()).error,'string');
});
test('internal failures return diagnostic-safe JSON rather than HTML 500',async()=>{
  const e=environment(); await heartbeat(e);
  const auth=async()=>{throw new Error('private secret DO NOT expose');};
  const response=await handleNativeOpenModelCreator(req('/api/billing/generate',modelBody),e,context,auth);
  assert.equal(response.status,503);
  assert.equal(response.headers.get('content-type').includes('application/json'),true);
  assert.equal(response.headers.get('x-sonara-open-model-stage'),'plan');
  assert.equal(JSON.stringify(await response.json()).includes('private secret'),false);
});

test('native gateway preserves worldwide style hierarchy and curated sonic DNA in worker job',async()=>{
  const choices=[
    {genreFamily:'Electronic / Dance',genre:'House',subgenre:'Deep House',mood:'Warm',phrase:'rounded deep bass'},
    {genreFamily:'Jazz',genre:'Jazz Fusion',subgenre:'Jazz Fusion',mood:'Electric',phrase:'electric'},
    {genreFamily:'Hip-Hop / Rap',genre:'Hip-Hop',subgenre:'Boom Bap',mood:'Gritty',phrase:'kick'},
    {genreFamily:'Latin America',genre:'Latin Brazilian',subgenre:'Bossa Nova',mood:'Intimate',phrase:'nylon'},
    {genreFamily:'Rock',genre:'Rock',subgenre:'Progressive Rock',mood:'Energetic',phrase:'guitar'},
  ];
  for(const input of choices){
    const e=environment(); await heartbeat(e);
    const body={...modelBody,genreFamily:input.genreFamily,genre:input.genre,
      subgenre:input.subgenre,mood:input.mood,rawPrompt:'an original song'};
    const result=await handleNativeOpenModelCreator(req('/api/billing/generate',body),e,context,nativeAuth());
    assert.equal(result.status,202,input.subgenre);
    const id=(await result.json()).jobId;
    const saved=JSON.parse(e.SONARA_AUDIO_BUCKET.data.get('multi-engine-v1/jobs/'+id+'.json'));
    const job=saved.request;
    assert.ok(job.genreFamily,input.subgenre);
    assert.ok(job.genre,input.subgenre);
    assert.ok(job.subgenre,input.subgenre);
    assert.ok(job.mood,input.subgenre);
    assert.ok(job.sonaraStyleDNA?.instrumentation,input.subgenre);
    assert.ok(job.sonaraStyleDNA?.rhythm,input.subgenre);
    assert.ok(job.sonaraStyleDNA?.atmosphere,input.subgenre);
    assert.equal(job.rawPrompt,'an original song');
    assert.ok(job.sonaraStyleDNA.instrumentation.toLowerCase().includes(input.phrase),input.subgenre);
    assert.notEqual(job.prompt.length,0);
  }
});
