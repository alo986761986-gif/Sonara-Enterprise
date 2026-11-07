import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { fetchAllowedAudio } from './sonara-studio-ai-router.mjs';

globalThis.crypto ||= webcrypto;

const id='sr2_12345678-1234-1234-1234-123456789abc';
const secret='internal-test-signing-key-not-a-production-secret';
const pcm=new Uint8Array(48);
pcm.set([82,73,70,70],0);
pcm.set([87,65,86,69],8);
pcm.set([100,97,116,97],36);

async function signedUrl(expires=Date.now()+300000) {
  const data=id+':0:'+expires;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(data)));
  const signature=Array.from(bytes).map(x=>x.toString(16).padStart(2,'0')).join('');
  return 'https://api.sonaraenterprise.com/api/sonara-relay/job/'+id+'/audio/0?exp='+expires+'&sig='+signature;
}
function bucket() {
  return {
    async get(key) {
      if (key==='relay-v1/jobs/'+id+'.json') return {json:async()=>({status:'COMPLETE',files:['relay-v1/audio/'+id+'/0.wav']})};
      if (key==='relay-v1/audio/'+id+'/0.wav') return {
        body:new Blob([pcm],{type:'audio/wav'}).stream(),
        size:pcm.byteLength,httpEtag:'"test-etag"',uploaded:new Date()
      };
      return null;
    },
    async head(key) {
      if(key==='relay-v1/audio/'+id+'/0.wav') return {
        size:pcm.byteLength,httpEtag:'"test-etag"',uploaded:new Date()
      };
      return null;
    }
  };
}

test('signed R2 audio resolves without external public hostname fetch',async()=>{
  const originalFetch=globalThis.fetch;
  let remoteCalls=0;
  globalThis.fetch=async()=>{remoteCalls++;throw new Error('external internet unavailable');};
  try{
    const result=await fetchAllowedAudio(await signedUrl(),{
      SONARA_INTERNAL_PROXY_SECRET:secret,SONARA_R2_RELAY_ENABLED:'true',
      SONARA_AUDIO_BUCKET:bucket()
    },{});
    assert.equal(result.filename,'sonara-source.wav');
    assert.equal(result.blob.size,pcm.byteLength);
    assert.equal(remoteCalls,0);
  }finally{globalThis.fetch=originalFetch;}
});

test('invalid signed R2 reference is rejected without public-origin fallback',async()=>{
  const url=(await signedUrl()).replace(/sig=[0-9a-f]+/,'sig=invalid');
  await assert.rejects(()=>fetchAllowedAudio(url,{
    SONARA_INTERNAL_PROXY_SECRET:secret,SONARA_R2_RELAY_ENABLED:'true',
    SONARA_AUDIO_BUCKET:bucket()
  },{}),/non disponibile|scaduto/);
});

test('523 from legacy audio URL produces actionable direct-upload error',async()=>{
  const before=globalThis.fetch;
  globalThis.fetch=async()=>new Response('Origin is unreachable',{status:523});
  try {
    await assert.rejects(
      ()=>fetchAllowedAudio('https://api.sonaraenterprise.com/v1/old-signed-file.wav',{},{}),
      /HTTP 523.*carica il file audio originale/
    );
  }finally{globalThis.fetch=before;}
});
