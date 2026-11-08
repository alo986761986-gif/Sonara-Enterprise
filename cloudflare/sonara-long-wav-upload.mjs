/**
 * Authenticated R2 multipart WAV uploads for long SONARA Remix Pro sources.
 * Never merges user bytes in Worker memory; R2 handles 8 MiB upload parts.
 * The original reference endpoint remains unchanged for short sources.
 */
export const LONG_SOURCE_MAX_BYTES = 512 * 1024 * 1024;
export const LONG_SOURCE_PART_BYTES = 8 * 1024 * 1024;
export const LONG_SOURCE_MAX_PARTS = 64;
const PREFIX = 'relay-v1/references/';
const ID = /^sref_[0-9a-f-]{36}$/;
const TTL = 2 * 60 * 60 * 1000;
const json = (value, status=200) => new Response(JSON.stringify(value), {
  status, headers:{'content-type':'application/json','cache-control':'private,no-store'}
});
const bad = (message,status=400) => json({error:message},status);
const markerKey = id => PREFIX+id+'.multipart.json';
const objectKey = id => PREFIX+id+'/source';
const metaKey = id => PREFIX+id+'.json';
const safeName = x => String(x||'source.wav').replace(/[\r\n\x00]/g,' ').slice(0,120);

export function inspectWavHeader(raw,totalBytes) {
  const x=new Uint8Array(raw),v=new DataView(x.buffer,x.byteOffset,x.byteLength);
  const tag=i=>String.fromCharCode(...x.subarray(i,i+4));
  if(x.byteLength<44||tag(0)!=='RIFF'||tag(8)!=='WAVE')return null;
  let offset=12,fmt=null,data=null;
  while(offset+8<=x.length) {
    const name=tag(offset),sz=v.getUint32(offset+4,true),begin=offset+8;
    if(name==='fmt '&&sz>=16&&begin+16<=x.length){
      let format=v.getUint16(begin,true);
      // A professional DAW may write WAVE_FORMAT_EXTENSIBLE for PCM24/float.
      // Accept only its PCM (1) or IEEE float (3) subformat, not arbitrary codecs.
      if(format===65534&&sz>=40&&begin+40<=x.length &&
         v.getUint16(begin+16,true)>=22){
        const sub=v.getUint32(begin+24,true);
        const guid=Array.from(x.subarray(begin+28,begin+40));
        const known=[0,0,16,0,128,0,0,170,0,56,155,113];
        if((sub===1||sub===3)&&guid.every((value,i)=>value===known[i]))format=sub;
      }
      fmt={format,channels:v.getUint16(begin+2,true),
        sampleRate:v.getUint32(begin+4,true),byteRate:v.getUint32(begin+8,true),
        blockAlign:v.getUint16(begin+12,true)};
    }
    if(name==='data'){data={start:begin,bytes:sz};break;}
    offset=begin+sz+(sz%2);
  }
  if(!fmt||!data||![1,3].includes(fmt.format)||
     fmt.channels<1||fmt.channels>2||fmt.sampleRate<8000||fmt.sampleRate>96000||
     fmt.byteRate<=0||fmt.blockAlign<=0||data.bytes<=0||
     data.start+data.bytes>totalBytes)return null;
  const duration=data.bytes/fmt.byteRate;
  if(!Number.isFinite(duration)||duration<10||duration>900)return null;
  return {durationSec:Math.round(duration*100)/100,channels:fmt.channels,sampleRate:fmt.sampleRate};
}


async function manifest(bucket,id) {
  const file=await bucket.get(markerKey(id));
  if(!file)return null;
  try{return await file.json();}catch{return null;}
}
async function authorized(request,env,nativeUser) {
  const result=await nativeUser(request,env);
  return result?.uid && result.uid.length<=128 ? result : null;
}
export async function handleLongWavUpload(request, env, nativeUser) {
  const url=new URL(request.url),p=url.pathname;
  if(!p.startsWith('/api/sonara-relay/reference-multipart/'))return null;
  if(request.method==='OPTIONS')return new Response(null,{status:204});
  // Large uploads are available only when the separately billed Remix Pro
  // feature is deliberately approved. Never expose an expensive 512 MiB
  // unauthorised storage endpoint while Remix Pro is switched off.
  if(env.SONARA_REMIX_PRO_ENABLED!=='true'||
     env.SONARA_REMIX_PRO_BILLING_READY!=='true')
    return bad('Remix Pro large uploads not yet enabled',503);
  const bucket=env.SONARA_AUDIO_BUCKET;
  if(!bucket||env.SONARA_R2_RELAY_ENABLED!=='true')
    return bad('Private R2 relay unavailable',503);
  const user=await authorized(request,env,nativeUser);
  if(!user)return bad('SONARA session required',401);
  if(p==='/api/sonara-relay/reference-multipart/start'&&request.method==='POST'){
    // Uploading hundreds of MiB is available only to eligible Studio users,
    // not merely to any logged-in SONARA session.
    if(!env.SONARA_AUTH)return bad('Plan verification unavailable',503);
    let billing;
    try {
      const stub=env.SONARA_AUTH.get(env.SONARA_AUTH.idFromName('sonara-auth-global-v1'));
      const response=await stub.fetch(new Request(
        'https://sonara.internal/api/billing/status',{
          method:'GET',headers:{Cookie:request.headers.get('Cookie')||''}
        }
      ));
      if(!response.ok)return bad('Studio authorization required',403);
      billing=(await response.json()).billing;
    } catch {return bad('Studio authorization unavailable',503);}
    if(billing?.planId!=='studio')return bad('Studio plan required for long WAV upload',403);
    const data=await request.json().catch(()=>null);
    const size=Number(data?.bytes);
    const name=safeName(data?.name);
    if(!Number.isSafeInteger(size)||size<44||size>LONG_SOURCE_MAX_BYTES||!name.toLowerCase().endsWith('.wav'))
      return bad('Invalid WAV upload size or name',413);
    const parts=Math.ceil(size/LONG_SOURCE_PART_BYTES);
    if(parts>LONG_SOURCE_MAX_PARTS)return bad('Too many WAV parts',413);
    const id='sref_'+crypto.randomUUID();
    const upload=await bucket.createMultipartUpload(objectKey(id),{
      httpMetadata:{contentType:'audio/wav'}
    });
    const now=Date.now();
    await bucket.put(markerKey(id),JSON.stringify({
      id,ownerUid:user.uid,uploadId:upload.uploadId,size,parts,
      name,createdAt:now,expiresAt:now+TTL,
    }),{httpMetadata:{contentType:'application/json'}});
    return json({referenceId:id,parts,partBytes:LONG_SOURCE_PART_BYTES},201);
  }
  const part=p.match(/^\/api\/sonara-relay\/reference-multipart\/part\/(sref_[0-9a-f-]{36})\/(\d{1,3})$/);
  const finish=p.match(/^\/api\/sonara-relay\/reference-multipart\/finish\/(sref_[0-9a-f-]{36})$/);
  if(!part&&!finish)return bad('Not found',404);
  const id=part?.[1]||finish?.[1];
  if(!ID.test(id))return bad('Invalid upload ID',400);
  const state=await manifest(bucket,id);
  if(!state||state.id!==id||state.ownerUid!==user.uid||state.expiresAt<Date.now())
    return bad('WAV upload not found or expired',404);
  const upload=bucket.resumeMultipartUpload(objectKey(id),state.uploadId);
  if(part&&request.method==='PUT'){
    const n=Number(part[2]);
    if(!Number.isInteger(n)||n<1||n>state.parts)return bad('Invalid part',400);
    const expected=n===state.parts?state.size-(n-1)*LONG_SOURCE_PART_BYTES:LONG_SOURCE_PART_BYTES;
    const data=await request.arrayBuffer();
    if(data.byteLength!==expected)return bad('WAV part size mismatch',400);
    if(n===1){
      const header=new Uint8Array(data.slice(0,12));
      const valid=String.fromCharCode(...header.slice(0,4))==='RIFF' &&
        String.fromCharCode(...header.slice(8,12))==='WAVE';
      if(!valid)return bad('Actual RIFF/WAVE audio required',415);
    }
    const result=await upload.uploadPart(n,data);
    return json({partNumber:n,etag:result.etag});
  }
  if(finish&&request.method==='POST'){
    const d=await request.json().catch(()=>null);
    const parts=d?.parts;
    if(!Array.isArray(parts)||parts.length!==state.parts)return bad('Incomplete WAV parts',400);
    if(!parts.every((v,i)=>v?.partNumber===i+1 && typeof v?.etag==='string' &&
        v.etag.length>0 && v.etag.length<200))return bad('Invalid WAV parts',400);
    let stored;
    try {stored=await upload.complete(parts);} catch {return bad('R2 upload finalization failed',503);}
    const head=await bucket.head(objectKey(id));
    if(!head||head.size!==state.size){
      await bucket.delete(objectKey(id)).catch(()=>{});
      return bad('Final WAV size mismatch',503);
    }
    const first=await bucket.get(objectKey(id),{range:{offset:0,length:65536}});
    const prefix=first?await first.arrayBuffer():new ArrayBuffer(0);
    const audio=inspectWavHeader(prefix,state.size);
    if(!audio) {
      await bucket.delete(objectKey(id)).catch(()=>{});
      return bad('Invalid PCM/float WAV or source duration exceeds 15 minutes',415);
    }
    await bucket.put(metaKey(id),JSON.stringify({
      id,ownerUid:user.uid,objectKey:objectKey(id),contentType:'audio/wav',
      filename:state.name,size:state.size,durationSec:audio.durationSec,createdAt:state.createdAt,expiresAt:state.expiresAt
    }),{httpMetadata:{contentType:'application/json'}});
    await bucket.delete(markerKey(id));
    return json({referenceId:id,size:state.size,expiresAt:new Date(state.expiresAt).toISOString()},201);
  }
  return bad('Method not supported',405);
}
