import test from 'node:test';
import assert from 'node:assert/strict';
import gateway,{normalizeRemixDuration} from './sonara-remix-duration-gateway-v5.mjs';

const URL='https://sonaraenterprise.com/api/billing/generate';
const pro={sonaraRemixPro:true,sonaraRemixProSourceA:'ref-a',sonaraRemixProSourceB:'ref-b'};
function fake(body,header,options={}){
  const calls=[];
  const env={SONARA_MAIN:{async fetch(r){
    calls.push({r,body:await r.clone().json()});
    if(options.fails)throw Error('uncertain');
    if(options.status)return Response.json({error:{code:'AUTH_TOKEN_INVALID'}},{status:options.status});
    return Response.json({ok:true,requestedDurationSeconds:calls.at(-1).body.durationSec,jobId:'srpro_mock'},{status:202});
  }}};
  const headers={'content-type':'application/json','cookie':'user_session=test'};
  if(header!==undefined)headers['X-Sonara-Remix-Expected-Duration']=String(header);
  return {calls,env,request:new Request(URL,{method:'POST',headers,
    body:JSON.stringify({...pro,...body})})};
}
test('all seven auto durations match in body, header and acknowledgement',async()=>{
  for(let seconds=120;seconds<=300;seconds+=30){
    const x=fake({durationSec:seconds,expectedDurationSec:seconds},seconds);
    const response=await gateway.fetch(x.request,x.env);
    assert.equal(response.status,202);
    assert.equal(x.calls.length,1);
    assert.equal(x.calls[0].body.durationSec,seconds);
    assert.equal(x.calls[0].body.expectedDurationSec,seconds);
    assert.equal(x.calls[0].r.headers.get('X-Sonara-Remix-Expected-Duration'),String(seconds));
    assert.equal(x.calls[0].r.headers.get('cookie'),'user_session=test');
    assert.equal(response.headers.get('x-sonara-remix-duration-repaired'),'0');
  }
});
test('stale 0:30 from client shim gets synchronized to actual 4-minute intent',async()=>{
  const x=fake({durationSec:30,expectedDurationSec:240},240);
  assert.equal((await gateway.fetch(x.request,x.env)).status,202);
  assert.equal(x.calls.length,1);
  assert.equal(x.calls[0].body.durationSec,240);
  assert.equal(x.calls[0].body.expectedDurationSec,240);
});
test('header disagreement repaired without duplicate jobs',async()=>{
  const x=fake({durationSec:150,expectedDurationSec:210},180);
  const response=await gateway.fetch(x.request,x.env);
  assert.equal(response.status,202);
  assert.equal(x.calls.length,1);
  assert.equal(x.calls[0].body.durationSec,210);
  assert.equal(response.headers.get('x-sonara-remix-duration-repaired'),'1');
});
test('legacy triple 0:30 auto-selects a bounded valid duration',async()=>{
  const x=fake({durationSec:30,expectedDurationSec:30},30);
  assert.equal((await gateway.fetch(x.request,x.env)).status,202);
  const seconds=x.calls[0].body.durationSec;
  assert.ok(seconds>=120&&seconds<=300&&seconds%30===0);
});
test('invalid duration fails before the trusted backend is called',async()=>{
  const x=fake({durationSec:-999,expectedDurationSec:30},30);
  assert.equal((await gateway.fetch(x.request,x.env)).status,400);
  assert.equal(x.calls.length,0);
});
test('authentication errors passed without changing status',async()=>{
  const x=fake({durationSec:30,expectedDurationSec:150},150,{status:401});
  assert.equal((await gateway.fetch(x.request,x.env)).status,401);
  assert.equal(x.calls.length,1);
});
test('one attempt only on an uncertain backend failure',async()=>{
  const x=fake({durationSec:30,expectedDurationSec:150},150,{fails:true});
  const response=await gateway.fetch(x.request,x.env);
  assert.equal(response.status,503);
  assert.equal(x.calls.length,1);
  assert.equal((await response.json()).error.code,'REMIX_PRO_GATEWAY_UNCONFIRMED');
});
test('non-Pro request does not change payload or duration',async()=>{
  let original,count=0;
  const env={SONARA_MAIN:{async fetch(r){original=await r.text();count++;return Response.json({ok:true});}}};
  const body={sonaraRemixPro:false,durationSec:30};
  const response=await gateway.fetch(new Request(URL,{method:'POST',body:JSON.stringify(body)}),env);
  assert.equal(response.status,200);
  assert.equal(count,1);
  assert.equal(original,JSON.stringify(body));
});
test('worker staging cannot access authenticated production API',async()=>{
  const env={SONARA_MAIN:{async fetch(){throw Error('must not forward workers.dev');}}};
  const url='https://sonara-remix-duration-gateway-v5.example.workers.dev';
  const response=await gateway.fetch(new Request(url+'/__sonara_remix_duration_health'),env);
  assert.equal(response.status,200);
  assert.equal((await response.json()).minSeconds,120);
  const denied=await gateway.fetch(new Request(url+'/api/billing/generate',{method:'POST',body:'{}'}),env);
  assert.equal(denied.status,404);
});
test('normalization preserves both source identity references',()=>{
  const result=normalizeRemixDuration({...pro,durationSec:30,expectedDurationSec:300},'300');
  assert.equal(result.payload.sonaraRemixProSourceA,'ref-a');
  assert.equal(result.payload.sonaraRemixProSourceB,'ref-b');
  assert.equal(result.seconds,300);
});
