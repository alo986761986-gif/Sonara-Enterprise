import assert from 'node:assert/strict';
import { test } from 'node:test';
import {buildMashupPlan, encodeWav16, tempoRatio, waveformPeaks} from './mashupEngine';

function source(duration: number, bpm: number) {
  return {bpm,offset:0,buffer:{duration}} as Parameters<typeof buildMashupPlan>[0];
}
const settings = {
  mode:'club' as const,targetBpm:124,durationSec:120,blend:80,
  crossfadeSec:2,bassB:-6,midB:0,trebleB:0
};
test('tempo ratios lock compatible recordings and compensate half-time',()=>{
  assert.ok(Math.abs(tempoRatio(124,124)-1)<1e-9);
  assert.ok(Math.abs(tempoRatio(124,62)-1)<1e-9);
  assert.throws(()=>tempoRatio(124,95),/compatibili/);
});
test('mashup plan has 8-bar transitions and reports stereo limitations',()=>{
  const plan=buildMashupPlan(source(200,124),source(220,126),settings);
  assert.equal(plan.durationSec,120);
  assert.ok(plan.phraseSec>15);
  assert.ok(plan.warnings.some(w=>w.includes('NON sono separate')));
});
test('PCM writer creates valid WAV RIFF stereo and avoids clipping',async()=>{
  const left=new Float32Array([0,0.5,-0.5,1.2]);
  const right=new Float32Array([0,-0.5,0.5,-1.2]);
  const wav=encodeWav16({sampleRate:44100,numberOfChannels:2,length:4,getChannelData:i=>i?right:left});
  const data=new DataView(await wav.arrayBuffer());
  assert.equal(wav.size,60);
  assert.equal(data.getUint32(24,true),44100);
  assert.equal(data.getUint16(22,true),2);
  assert.equal(data.getInt16(58,true),Math.round(-.98*32768));
});
test('peaks include isolated amplitude events',()=>{
  const values=new Float32Array(800);
  values[120]=1;
  const peaks=waveformPeaks({length:800,getChannelData:()=>values},8);
  assert.equal(peaks.length,8);
  assert.ok(peaks[1]>0.9);
});
