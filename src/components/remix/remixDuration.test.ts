import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseRandomRemixDuration,isValidRemixDuration,buildRemixProGenerationRequest } from './remixDuration';

test('automatic Remix duration always remains in supported range',()=>{
  for(const n of [0,1,2,3,4,5,6,7,8,255,65535,0xffffffff]){
    const seconds=chooseRandomRemixDuration(()=>n);
    assert.equal(isValidRemixDuration(seconds),true);
  }
});
test('automatic duration is allowed to vary between jobs',()=>{
  assert.equal(chooseRandomRemixDuration(()=>0),120);
  assert.equal(chooseRandomRemixDuration(()=>1),150);
  assert.equal(chooseRandomRemixDuration(()=>6),300);
  assert.equal(chooseRandomRemixDuration(()=>7),120);
});
test('invalid random generator input fails before any request',()=>{
  for(const value of [-1,1.25,Infinity,NaN,0x100000000])
    assert.throws(()=>chooseRandomRemixDuration(()=>value));
});

test('V3 job Request keeps one duration in JSON and header, including stale values',async()=>{
  for(const seconds of [120,150,180,210,240,270,300]){
    const request=buildRemixProGenerationRequest('https://sonaraenterprise.com/remix',{
      sonaraRemixPro:true,sonaraRemixProSourceA:'sref_A',
      sonaraRemixProSourceB:'sref_B',durationSec:30,expectedDurationSec:480
    },seconds);
    assert.equal(request.url,'https://sonaraenterprise.com/api/billing/generate');
    assert.equal(request.method,'POST');
    assert.equal(request.credentials,'include');
    assert.equal(request.headers.get('X-Sonara-Remix-Expected-Duration'),String(seconds));
    const payload=await request.json();
    assert.equal(payload.durationSec,seconds);
    assert.equal(payload.expectedDurationSec,seconds);
    assert.equal(payload.sonaraRemixProSourceA,'sref_A');
    assert.equal(payload.sonaraRemixProSourceB,'sref_B');
  }
});
test('V3 job Request refuses invalid or legacy durations before network',()=>{
  for(const seconds of [0,30,60,119,121,301,330,480])
    assert.throws(()=>buildRemixProGenerationRequest('https://sonaraenterprise.com',{},seconds));
});
