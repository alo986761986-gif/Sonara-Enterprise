import test from 'node:test';
import assert from 'node:assert/strict';
import {createIntelligentRemixDirection} from './sonaraRemixIntelligentDirection';

const base={
  genre:'tech-house',mode:'explosive' as const,bInfluence:60,
  bassFrom:'b' as const,master:'club' as const,
  bpmA:'124',bpmB:'130',
  dna:{melody:80,harmony:70,groove:85,timbre:75,humanize:90},
};
test('new shuffle produces actionable bounded musical direction for chosen A+B controls',()=>{
  const value=createIntelligentRemixDirection(base,1,120000);
  assert.match(value,/EXPLOSIVE FUSION/);
  assert.match(value,/CONTINUOUS RHYTHM LOCK/);
  assert.doesNotMatch(value,/a short silence and a hard-impact drop|deceptive half-time breakdown|rhythmic stop-start accents|an emotional break and an even stronger/);
  assert.match(value,/130 BPM/);
  assert.match(value,/124 BPM/);
  assert.match(value,/reference B/);
  assert.match(value,/club/);
  assert.match(value,/SONARA ORIGINAL A\+B MUSIC DIRECTION/);
  assert.ok(value.length<5000);
});
test('shuffle has thousands of available context-aware variants without a hard usage cap',()=>{
  const unique=new Set<string>();
  for(let i=0;i<300;i++)unique.add(createIntelligentRemixDirection(base,i,i*79+101));
  assert.ok(unique.size>=290, 'unexpectedly repetitive prompt combinations');
  const last=createIntelligentRemixDirection(base,1500000,237);
  assert.ok(last.length>200);
});
test('genre and mode context affect output and no BPM is invented',()=>{
  const quiet=createIntelligentRemixDirection({...base,genre:'jazz-fusion',mode:'balanced',bpmA:'',bpmB:'',bassFrom:'a',bInfluence:30,master:'streaming'},5,555);
  assert.match(quiet,/jazz fusion/i);
  assert.match(quiet,/streaming/);
  assert.match(quiet,/reference A/);
  assert.match(quiet,/never fabricate a BPM/);
  assert.doesNotMatch(quiet,/EXPLOSIVE FUSION/);
  assert.notEqual(quiet,createIntelligentRemixDirection(base,5,555));
});
test('directions are deterministic for given explicit seed and counter',()=>{
  assert.equal(createIntelligentRemixDirection(base,38,73),createIntelligentRemixDirection(base,38,73));
});
