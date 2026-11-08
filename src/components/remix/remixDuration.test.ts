import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseRandomRemixDuration,isValidRemixDuration } from './remixDuration';

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
