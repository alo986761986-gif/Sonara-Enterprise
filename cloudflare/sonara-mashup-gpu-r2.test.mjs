import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleMashupGpu } from './sonara-mashup-gpu-r2.mjs';
const BASE='https://sonaraenterprise.com/api/sonara-relay/';
function bucket(){
  const objects=new Map();
  return {
    objects,
    async get(k){const d=objects.get(k);return d?{
      async json(){return JSON.parse(typeof d==='string'?d:new TextDecoder().decode(d));},
      body:d instanceof Uint8Array?d:new TextEncoder().encode(d),
      etag:'etag-1'}:null;},
    async put(k,value){objects.set(k,typeof value==='string'?value:new Uint8Array(await new Response(value).arrayBuffer()));return {etag:'etag-1'};},
    async head(k){const d=objects.get(k);return d?{size:typeof d==='string'?new TextEncoder().encode(d).length:d.byteLength}:null;},
    async delete(k){objects.delete(k);},
    async list({prefix}){return {objects:[...objects.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))};}
  };
}
const env=()=>({SONARA_AUDIO_BUCKET:bucket(),SONARA_R2_RELAY_ENABLED:'true',SONARA_MASHUP_GPU_ENABLED:'true'});
const auth={user:async()=>({uid:'test-user'}),agent:async()=>true};
const get=(path)=>new Request(BASE+path);
test('Mashup capabilities are unavailable until REAL GPU worker heartbeat',async()=>{
  const e=env();
  const r=await handleMashupGpu(get('mashup-capabilities'),e,{},auth);
  assert.equal(r.status,200);
  const data=await r.json();
  assert.equal(data.available,false);
  assert.equal(data.aceStepUnmodified,true);
});
test('Mashup heartbeat requires authenticated agent with verified GPU and model',async()=>{
  const e=env();
  const blocked=await handleMashupGpu(new Request(BASE+'mashup-heartbeat',{
    method:'POST',body:JSON.stringify({revision:'sonara-mashup-htdemucs-v1',gpuReady:false,demucsReady:true})
  }),e,{},auth);
  assert.equal(blocked.status,409);
  assert.equal((await (await handleMashupGpu(get('mashup-capabilities'),e,{},auth)).json()).available,false);
  const online=await handleMashupGpu(new Request(BASE+'mashup-heartbeat',{
    method:'POST',body:JSON.stringify({revision:'sonara-mashup-htdemucs-v1',gpuReady:true,demucsReady:true})
  }),e,{},auth);
  assert.equal(online.status,200);
  assert.equal((await (await handleMashupGpu(get('mashup-capabilities'),e,{},auth)).json()).available,true);
});
test('browser source cannot upload from unrelated origin or without session',async()=>{
  const e=env();
  await handleMashupGpu(new Request(BASE+'mashup-heartbeat',{
    method:'POST',body:JSON.stringify({revision:'sonara-mashup-htdemucs-v1',gpuReady:true,demucsReady:true})
  }),e,{},auth);
  const data=new Uint8Array(400);
  const wrong=await handleMashupGpu(new Request(BASE+'mashup-source',{
    method:'POST',headers:{origin:'https://attacker.example','content-type':'audio/wav',
      'X-Sonara-Mashup-Name':'clip.wav'},body:data}),e,{},auth);
  assert.equal(wrong.status,403);
  const unauth=await handleMashupGpu(new Request(BASE+'mashup-source',{
    method:'POST',headers:{origin:'https://sonaraenterprise.com','content-type':'audio/wav',
      'X-Sonara-Mashup-Name':'clip.wav'},body:data}),e,{},{
    ...auth,user:async()=>null
  });
  assert.equal(unauth.status,401);
  assert.equal([...e.SONARA_AUDIO_BUCKET.objects.keys()].filter(x=>x.includes('/sources/')).length,0);
});
test('GPU masters never accessible to a different SONARA account',async()=>{
  const e=env();
  e.SONARA_AUDIO_BUCKET.objects.set('relay-v1/mashup/jobs/smash_12345678-1234-1234-1234-123456789abc.json',
    JSON.stringify({id:'smash_12345678-1234-1234-1234-123456789abc',kind:'mashup-gpu',
    ownerUid:'original-user',status:'COMPLETE',stage:'completed',createdAt:1,durationSec:30}));
  const r=await handleMashupGpu(get('mashup-job/smash_12345678-1234-1234-1234-123456789abc/audio'),e,{},auth);
  assert.equal(r.status,404);
});

test('browser audio formats upload with explicit extension even when MIME varies',async()=>{
  const valid=[
    ['house.m4a','video/mp4','m4a'],
    ['house.flac','application/x-flac','flac'],
    ['house.wav','application/octet-stream','wav'],
    ['house.mp3','audio/mpeg','mp3'],
    ['house.ogg','application/ogg','ogg']
  ];
  for(const [filename,mime,extension] of valid){
    const e=env();
    await handleMashupGpu(new Request(BASE+'mashup-heartbeat',{
      method:'POST',body:JSON.stringify({revision:'sonara-mashup-htdemucs-v1',gpuReady:true,demucsReady:true})
    }),e,{},auth);
    const r=await handleMashupGpu(new Request(BASE+'mashup-source',{
      method:'POST',
      headers:{origin:'https://sonaraenterprise.com','content-type':mime,
        'X-Sonara-Mashup-Name':filename,'X-Sonara-Mashup-Format':extension},
      body:new Uint8Array(400)
    }),e,{},auth);
    assert.equal(r.status,201,filename+' ('+mime+')');
    const value=await r.json();
    assert.match(value.sourceId,/^smref_/);
  }
});
test('browser unknown formats and conflicting extensions are rejected',async()=>{
  const e=env();
  await handleMashupGpu(new Request(BASE+'mashup-heartbeat',{
    method:'POST',body:JSON.stringify({revision:'sonara-mashup-htdemucs-v1',gpuReady:true,demucsReady:true})
  }),e,{},auth);
  for(const row of [
    ['song.mp4','mp4','video/mp4'],
    ['song.wav','mp3','audio/wav'],
    ['song.txt','txt','application/octet-stream']
  ]){
    const [filename,format,mime]=row;
    const r=await handleMashupGpu(new Request(BASE+'mashup-source',{
      method:'POST',
      headers:{origin:'https://sonaraenterprise.com','content-type':mime,
        'X-Sonara-Mashup-Name':filename,'X-Sonara-Mashup-Format':format},
      body:new Uint8Array(400)
    }),e,{},auth);
    assert.equal(r.status,415,filename);
  }
});

test('V2 controls are rejected until verified upgraded MoLab heartbeat',async()=>{
  const e=env();
  const signal=(v2)=>handleMashupGpu(new Request(BASE+'mashup-heartbeat',{
    method:'POST',body:JSON.stringify({revision:'sonara-mashup-htdemucs-v1',gpuReady:true,demucsReady:true,musicDirectorV2:v2})
  }),e,{},auth);
  const upload=async(name)=>{
    const r=await handleMashupGpu(new Request(BASE+'mashup-source',{
      method:'POST',headers:{origin:'https://sonaraenterprise.com','content-type':'audio/wav',
        'X-Sonara-Mashup-Name':name,'X-Sonara-Mashup-Format':'wav'},body:new Uint8Array(500)
    }),e,{},auth);
    assert.equal(r.status,201);
    return (await r.json()).sourceId;
  };
  await signal(false);
  const before=await handleMashupGpu(get('mashup-capabilities'),e,{},auth);
  assert.equal((await before.json()).professionalAvailable,false);
  const a=await upload('a.wav'),b=await upload('b.wav');
  const director={
    vocalPolicy:'dialogue',masterProfile:'studio',variation:0,
    vocalGainA:75,vocalGainB:75,instrumentGainB:75,
    sections:[{name:'verse',bars:8,voice:'a',energy:80}]
  };
  const job=()=>new Request(BASE+'mashup-enqueue',{
    method:'POST',headers:{origin:'https://sonaraenterprise.com','content-type':'application/json'},
    body:JSON.stringify({rightsConfirmed:true,sourceA:a,sourceB:b,
      bpmA:124,bpmB:126,durationSec:120,mode:'club',directorV2:director})
  });
  const denied=await handleMashupGpu(job(),e,{},auth);
  assert.equal(denied.status,503);
  await signal(true);
  const after=await handleMashupGpu(get('mashup-capabilities'),e,{},auth);
  assert.equal((await after.json()).professionalAvailable,true);
  const accepted=await handleMashupGpu(job(),e,{},auth);
  assert.equal(accepted.status,202);
  const acceptedPayload=await accepted.json();
  assert.match(acceptedPayload.jobId,/^smash_/);
  const invalid=await handleMashupGpu(new Request(BASE+'mashup-enqueue',{
    method:'POST',headers:{origin:'https://sonaraenterprise.com','content-type':'application/json'},
    body:JSON.stringify({rightsConfirmed:true,sourceA:a,sourceB:b,
      bpmA:124,bpmB:126,durationSec:120,mode:'club',
      directorV2:{...director,sections:[{name:'verse',bars:7,voice:'a',energy:80}]}})
  }),e,{},auth);
  assert.equal(invalid.status,400);
});

test('V2 preflight authenticates read-only, without forging a V2 heartbeat',async()=>{
  const e=env();
  const probe=await handleMashupGpu(new Request(BASE+'mashup-agent-check'),e,{},auth);
  assert.equal(probe.status,200);
  assert.equal((await probe.json()).authenticated,true);
  const cap=await handleMashupGpu(get('mashup-capabilities'),e,{},auth);
  const data=await cap.json();
  assert.equal(data.available,false);
  assert.equal(data.professionalAvailable,false);
  const rejected=await handleMashupGpu(new Request(BASE+'mashup-agent-check'),e,{},{
    ...auth,agent:async()=>false
  });
  assert.equal(rejected.status,401);
});
test('A legacy worker cannot lease a pending V2 job',async()=>{
  const e=env();
  await handleMashupGpu(new Request(BASE+'mashup-heartbeat',{
    method:'POST',body:JSON.stringify({revision:'sonara-mashup-htdemucs-v1',
      gpuReady:true,demucsReady:true,musicDirectorV2:true})
  }),e,{},auth);
  const id='smash_12345678-1234-1234-1234-123456789abc';
  const now=Date.now();
  const job={id,kind:'mashup-gpu',status:'QUEUED',stage:'queued',attempts:0,
    ownerUid:'owner',ownerHash:'hash',createdAt:now,updatedAt:now,
    directorV2:{vocalPolicy:'dialogue'},sourceA:{format:'wav'},sourceB:{format:'wav'},
    bpmA:124,bpmB:124,durationSec:120};
  e.SONARA_AUDIO_BUCKET.objects.set('relay-v1/mashup/jobs/'+id+'.json',JSON.stringify(job));
  e.SONARA_AUDIO_BUCKET.objects.set('relay-v1/mashup/queue/'+String(now).padStart(13,'0')+'/'+id,id);
  const legacy=await handleMashupGpu(new Request(BASE+'mashup-claim',{
    method:'POST',body:'{}'
  }),e,{},auth);
  assert.equal((await legacy.json()).jobId,null);
  const modern=await handleMashupGpu(new Request(BASE+'mashup-claim',{
    method:'POST',headers:{'X-Sonara-Mashup-Director-Revision':'music-director-v2'},
    body:'{}'
  }),e,{},auth);
  assert.equal((await modern.json()).jobId,id);
});
