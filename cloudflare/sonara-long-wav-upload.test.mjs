import test from 'node:test';
import assert from 'node:assert/strict';
import {handleLongWavUpload,inspectWavHeader,LONG_SOURCE_PART_BYTES} from './sonara-long-wav-upload.mjs';

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
  const user=async req=>req.headers.get('x-test-user')==='owner'?{uid:'owner'}:null;
  const call=(method,path,body,who='owner')=>{
    const request=new Request('https://api.sonaraenterprise.com'+path,{
      method,headers:{'x-test-user':who,'content-type':'application/json'},
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
