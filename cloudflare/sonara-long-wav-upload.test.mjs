import test from 'node:test';
import assert from 'node:assert/strict';
import {handleLongWavUpload,inspectWavHeader,LONG_SOURCE_PART_BYTES} from './sonara-long-wav-upload.mjs';
import {audioFormatForName,audioSignatureMatches,audioContentType} from './sonara-remix-pro-audio-formats.mjs';

function wavHeader(dataBytes,rate=44100,channels=2){
  const raw=new Uint8Array(44),v=new DataView(raw.buffer);
  const put=(p,s)=>{for(let i=0;i<s.length;i++)raw[p+i]=s.charCodeAt(i);};
  put(0,'RIFF');v.setUint32(4,36+dataBytes,true);put(8,'WAVE');
  put(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);
  v.setUint16(22,channels,true);v.setUint32(24,rate,true);
  v.setUint32(28,rate*channels*2,true);v.setUint16(32,channels*2,true);
  v.setUint16(34,16,true);put(36,'data');v.setUint32(40,dataBytes,true);
  return raw;
}
function fakeBucket(){
  const objects=new Map(),uploads=new Map();
  let serial=0;
  const bucket={
    async put(k,body){
      const bytes=typeof body==='string'?new TextEncoder().encode(body):new Uint8Array(body);
      objects.set(k,bytes);
      return {etag:'etag-'+(++serial)};
    },
    async get(k,opts){
      let bytes=objects.get(k);if(!bytes)return null;
      if(opts?.range)bytes=bytes.slice(opts.range.offset,opts.range.offset+opts.range.length);
      return {
        async json(){return JSON.parse(new TextDecoder().decode(bytes));},
        async arrayBuffer(){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}
      };
    },
    async head(k){const bytes=objects.get(k);return bytes?{size:bytes.byteLength}:null},
    async delete(k){objects.delete(k)},
    async createMultipartUpload(key){
      const uploadId='upload-'+(++serial);
      uploads.set(uploadId,{key,parts:new Map()});
      return {uploadId};
    },
    resumeMultipartUpload(key,uploadId){
      const state=uploads.get(uploadId);
      assert.equal(state?.key,key);
      return {
        async uploadPart(number,raw){
          const bytes=new Uint8Array(raw);
          state.parts.set(number,bytes);
          return {etag:'part-'+number};
        },
        async complete(parts){
          const chunks=parts.map(({partNumber})=>state.parts.get(partNumber));
          const data=new Uint8Array(chunks.reduce((sum,x)=>sum+x.length,0));
          let offset=0;
          for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
          objects.set(key,data);
          return {key,size:data.length};
        }
      };
    }
  };
  return {bucket,objects};
}
function setup(){
  const {bucket,objects}=fakeBucket();
  const env={SONARA_AUDIO_BUCKET:bucket,SONARA_R2_RELAY_ENABLED:'true',
    SONARA_REMIX_PRO_ENABLED:'true',SONARA_REMIX_PRO_BILLING_READY:'true'};
  env.SONARA_AUTH={
    idFromName:name=>name,
    get:()=>({fetch:async req=>Response.json({
      billing:{planId:req.headers.get('Cookie')==='sonara_session=test'?env.__plan:'free'}
    })})
  };
  env.__plan='studio';
  const user=async req=>req.headers.get('x-test-user')==='owner'?{uid:'owner'}:null;
  const call=(method,path,body,who='owner')=>{
    const request=new Request('https://api.sonaraenterprise.com'+path,{
      method,headers:{'x-test-user':who,'content-type':'application/json',Cookie:'sonara_session=test'},
      ...(body==null?{}:{body:body instanceof Uint8Array?body:JSON.stringify(body)})
    });
    return handleLongWavUpload(request,env,user);
  };
  return {call,objects,env};
}
test('header validator accepts 9-minute genuine WAV and refuses 16-minute source',()=>{
  const minute9=44100*2*2*540;
  assert.equal(inspectWavHeader(wavHeader(minute9),minute9+44)?.durationSec,540);
  const minute16=44100*2*2*960;
  assert.equal(inspectWavHeader(wavHeader(minute16),minute16+44),null);
  assert.equal(inspectWavHeader(new Uint8Array(44),100000),null);
});
test('private multipart upload enforces owner, parts, and commits original WAV metadata',async()=>{
  const {call,objects}=setup();
  const size=LONG_SOURCE_PART_BYTES+1024;
  assert.equal((await call('POST','/api/sonara-relay/reference-multipart/start',
    {name:'owner.wav',bytes:size},'intruder')).status,401);
  const start=await call('POST','/api/sonara-relay/reference-multipart/start',
    {name:'owner.wav',bytes:size});
  assert.equal(start.status,201);
  const {referenceId,parts}=await start.json();
  assert.equal(parts,2);
  const first=new Uint8Array(LONG_SOURCE_PART_BYTES);
  first.set(wavHeader(size-44));
  const a=await call('PUT','/api/sonara-relay/reference-multipart/part/'+referenceId+'/1',first);
  assert.equal(a.status,200);
  const second=new Uint8Array(1024);
  const b=await call('PUT','/api/sonara-relay/reference-multipart/part/'+referenceId+'/2',second);
  assert.equal(b.status,200);
  assert.equal((await call('POST','/api/sonara-relay/reference-multipart/finish/'+referenceId,
    {parts:[{partNumber:1,etag:(await a.json()).etag}]})).status,400);
  const completed=await call('POST','/api/sonara-relay/reference-multipart/finish/'+referenceId,{
    parts:[{partNumber:1,etag:'part-1'},{partNumber:2,etag:'part-2'}]
  });
  assert.equal(completed.status,201);
  const meta=JSON.parse(new TextDecoder().decode(objects.get('relay-v1/references/'+referenceId+'.json')));
  assert.equal(meta.ownerUid,'owner');
  assert.equal(meta.size,size);
  assert.ok(meta.durationSec>30);
  assert.equal(objects.has('relay-v1/references/'+referenceId+'.multipart.json'),false);
});
test('source upload rejects size above 512 MiB',async()=>{
  const {call}=setup();
  assert.equal((await call('POST','/api/sonara-relay/reference-multipart/start',{
    name:'too-big.wav',bytes:512*1024*1024+1
  })).status,413);
});

test('multipart source endpoint is disabled when billing has not approved Pro',async()=>{
  const {call,env}=setup();
  env.SONARA_REMIX_PRO_BILLING_READY='false';
  const result=await call('POST','/api/sonara-relay/reference-multipart/start',{
    name:'licensed.wav',bytes:9*1024*1024
  });
  assert.equal(result.status,503);
});

test('DAW WAVE_FORMAT_EXTENSIBLE PCM24 long sources remain supported',()=>{
  const bytes=48000*2*3*540;
  const header=new Uint8Array(68),v=new DataView(header.buffer);
  const put=(p,t)=>{for(let i=0;i<t.length;i++)header[p+i]=t.charCodeAt(i);};
  put(0,'RIFF');v.setUint32(4,60+bytes,true);put(8,'WAVE');
  put(12,'fmt ');v.setUint32(16,40,true);v.setUint16(20,65534,true);
  v.setUint16(22,2,true);v.setUint32(24,48000,true);
  v.setUint32(28,48000*2*3,true);v.setUint16(32,6,true);
  v.setUint16(34,24,true);v.setUint16(36,22,true);
  v.setUint16(38,24,true);v.setUint32(40,3,true);
  const guid=[1,0,0,0,0,0,16,0,128,0,0,170,0,56,155,113];
  header.set(guid,44);
  put(60,'data');v.setUint32(64,bytes,true);
  assert.equal(inspectWavHeader(header,bytes+68)?.durationSec,540);
});

test('authenticated Free accounts can upload Remix Pro sources without Studio plan',async()=>{
  const {call,env}=setup();
  env.__plan='free';
  const response=await call('POST','/api/sonara-relay/reference-multipart/start',{
    name:'free.wav',bytes:9*1024*1024
  });
  assert.equal(response.status,201);
  assert.match((await response.json()).referenceId,/^sref_/);
});

test('audio format allowlist rejects arbitrary files and mislabeled content',()=>{
  assert.equal(audioFormatForName('track.MP3'),'mp3');
  assert.equal(audioFormatForName('track.m4a'),'m4a');
  assert.equal(audioFormatForName('track.mov'),'mov');
  assert.equal(audioFormatForName('track.m4v'),'m4v');
  assert.equal(audioContentType('mp4'),'video/mp4');
  assert.equal(audioContentType('mov'),'video/quicktime');
  assert.equal(audioContentType('m4v'),'video/x-m4v');
  assert.equal(audioFormatForName('track.mid'),null);
  assert.equal(audioFormatForName('movie.exe'),null);
  assert.equal(audioContentType('flac'),'audio/flac');
  assert.equal(audioSignatureMatches(new Uint8Array([102,76,97,67,...new Array(16).fill(0)]),'flac'),true);
  assert.equal(audioSignatureMatches(new Uint8Array(16),'mp3'),false);
  assert.equal(audioSignatureMatches(new Uint8Array([73,68,51,...new Array(16).fill(0)]),'mp3'),true);
  assert.equal(audioSignatureMatches(new Uint8Array([0,0,0,24,102,116,121,112,...new Array(12).fill(0)]),'m4a'),true);
  assert.equal(audioSignatureMatches(new Uint8Array([0,0,0,24,102,116,121,112,...new Array(12).fill(0)]),'mp4'),true);
  assert.equal(audioSignatureMatches(new Uint8Array([0,0,0,24,102,116,121,112,...new Array(12).fill(0)]),'mov'),true);
  assert.equal(audioSignatureMatches(new Uint8Array([0,0,0,24,102,116,121,112,...new Array(12).fill(0)]),'m4v'),true);
  assert.equal(audioSignatureMatches(new Uint8Array([79,103,103,83,...new Array(12).fill(0)]),'opus'),true);
});
test('authenticated multipart MP3 is privately recorded with true format for GPU decode',async()=>{
  const {call,objects}=setup();
  const size=LONG_SOURCE_PART_BYTES+512;
  const start=await call('POST','/api/sonara-relay/reference-multipart/start',
    {name:'song.mp3',bytes:size});
  assert.equal(start.status,201);
  const {referenceId}=await start.json();
  const first=new Uint8Array(LONG_SOURCE_PART_BYTES);
  first.set([73,68,51]);
  const part1=await call('PUT','/api/sonara-relay/reference-multipart/part/'+referenceId+'/1',first);
  assert.equal(part1.status,200);
  const part2=await call('PUT','/api/sonara-relay/reference-multipart/part/'+referenceId+'/2',
    new Uint8Array(512));
  assert.equal(part2.status,200);
  const complete=await call('POST','/api/sonara-relay/reference-multipart/finish/'+referenceId,
    {parts:[{partNumber:1,etag:'part-1'},{partNumber:2,etag:'part-2'}]});
  assert.equal(complete.status,201);
  const meta=JSON.parse(new TextDecoder().decode(objects.get('relay-v1/references/'+referenceId+'.json')));
  assert.equal(meta.format,'mp3');
  assert.equal(meta.contentType,'audio/mpeg');
  assert.equal(meta.ownerUid,'owner');
  assert.equal(meta.durationSec,null);
});
test('multipart MP3 rejects false file signature on first part',async()=>{
  const {call}=setup();
  const start=await call('POST','/api/sonara-relay/reference-multipart/start',{
    name:'fake.mp3',bytes:LONG_SOURCE_PART_BYTES+512
  });
  const {referenceId}=await start.json();
  const wrong=new Uint8Array(LONG_SOURCE_PART_BYTES);
  wrong.set([82,73,70,70]);
  const response=await call('PUT','/api/sonara-relay/reference-multipart/part/'+referenceId+'/1',wrong);
  assert.equal(response.status,415);
});
