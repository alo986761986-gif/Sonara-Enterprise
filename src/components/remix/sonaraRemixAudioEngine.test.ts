import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  resolveRemixSelection,encodeWav24,waveformBins,renderRemixSelection,
} from './sonaraRemixAudioEngine';

test('precise trim boundaries and independent fade budgets',()=>{
  const plan=resolveRemixSelection(480,{
    start:62.135,end:133.685,fadeIn:12.25,fadeOut:8.5,
    bass:6,mid:-3,treble:2,loop:false,
  });
  assert.equal(plan.start,62.135);
  assert.equal(plan.end,133.685);
  assert.equal(plan.seconds,71.55);
  assert.equal(plan.fadeIn,12.25);
  assert.equal(plan.fadeOut,8.5);
  assert.equal(plan.bass,6);
});
test('loop edits and constrained fades never overlap or overrun',()=>{
  const plan=resolveRemixSelection(30,{
    start:29.9,end:100,fadeIn:120,fadeOut:120,
    bass:50,mid:-50,treble:0,loop:true,
  });
  assert.ok(plan.start<=29.75);
  assert.ok(plan.end<=30);
  assert.ok(plan.seconds>=.25);
  assert.ok(plan.fadeIn+plan.fadeOut<=plan.seconds);
  assert.equal(plan.bass,12);
  assert.equal(plan.mid,-12);
  assert.equal(plan.loop,true);
});
test('export writes actual 24-bit RIFF PCM with correct sample rate and channels', async()=>{
  const left=new Float32Array([0,.25,-.25,1,-1]);
  const right=new Float32Array([0,-.25,.25,.4,-.4]);
  const {blob,peak,attenuationDb}=encodeWav24({
    length:left.length,numberOfChannels:2,sampleRate:44100,
    getChannelData:i=>i===0?left:right,
  });
  assert.equal(peak,1);
  assert.ok(attenuationDb<0);
  const bytes=new Uint8Array(await blob.arrayBuffer());
  const header=new DataView(bytes.buffer);
  assert.equal(new TextDecoder().decode(bytes.slice(0,4)),'RIFF');
  assert.equal(new TextDecoder().decode(bytes.slice(8,12)),'WAVE');
  assert.equal(new TextDecoder().decode(bytes.slice(12,16)),'fmt ');
  assert.equal(new TextDecoder().decode(bytes.slice(36,40)),'data');
  assert.equal(header.getUint16(20,true),1);
  assert.equal(header.getUint16(22,true),2);
  assert.equal(header.getUint32(24,true),44100);
  assert.equal(header.getUint16(34,true),24);
  assert.equal(header.getUint32(40,true),30);
  assert.equal(bytes.byteLength,74);
  assert.equal(header.getUint32(4,true),66);
});
test('non-finite PCM is refused rather than exported silently',()=>{
  assert.throws(()=>encodeWav24({
    length:2,numberOfChannels:1,sampleRate:44100,
    getChannelData:()=>new Float32Array([.5,NaN]),
  }),/non validi/);
});
test('waveform bins expose source peaks with bounded memory',()=>{
  const audio={
    length:10000,numberOfChannels:1,
    getChannelData:()=>Float32Array.from({length:10000},(_,i)=>i===5000?.8:0),
  };
  const bins=waveformBins(audio as any,20);
  assert.equal(bins.length,20);
  assert.ok(bins.some(v=>v>.7));
});
test('offline render rejects missing browser audio worklet explicitly',async()=>{
  const b={
    duration:2,sampleRate:44100,length:88200,numberOfChannels:2,
    getChannelData:()=>new Float32Array(88200),
  } as any;
  await assert.rejects(renderRemixSelection(b,{
    start:0,end:2,fadeIn:0,fadeOut:0,bass:0,mid:0,treble:0,loop:false,
  }),/non supporta/);
});
