import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { SonaraAuthStore } from './sonara-native-auth.mjs';
import { deriveRelayGatewayInternalKey } from './sonara-gateway-verifier.mjs';

const email='remix-pro-owner@example.invalid';
const uid='remix-pro-owner';
const token='private-session-token';
const digest=x=>createHash('sha256').update(x).digest('hex');
const userKey='user:'+digest(email);
const sessionKey='session:'+digest(token);
const prefix='https://sonara.internal/__sonara_internal/remix-pro-usage';
const job=n=>'srpro_'+String(n).padStart(8,'0')+'-1111-4111-8111-111111111111';

function setup({used=0,studio=true}={}){
  const now=Date.now();
  const start=Date.UTC(new Date(now).getUTCFullYear(),new Date(now).getUTCMonth(),1);
  const end=Date.UTC(new Date(now).getUTCFullYear(),new Date(now).getUTCMonth()+1,1);
  const values=new Map([
    [userKey,{uid,email,status:'active',usagePeriodStart:start,usagePeriodEnd:end,
      usageSeconds:used,videoCreditsUsed:0,
      ...(studio?{entitlement:{planId:'studio',cadence:'monthly',status:'active',expiresAt:now+86_400_000}}:{})}],
    [sessionKey,{uid,userKey,expiresAt:now+86_400_000}]
  ]);
  let nextAlarm=null;
  const storage={
    async get(k){return structuredClone(values.get(k))},
    async put(k,v){values.set(k,structuredClone(v))},
    async delete(k){values.delete(k)},
    async list({prefix='',limit=100}={}) {
      return new Map([...values].filter(([k])=>String(k).startsWith(prefix)).slice(0,limit));
    },
    async getAlarm(){return nextAlarm},
    async setAlarm(t){nextAlarm=t},
    async transaction(fn){return fn(this)}
  };
  const objects=new Map();
  const env={
    SONARA_RELAY_TOKEN:'test-only-private-relay-signing-root-12345678901234567890',
    SONARA_AUDIO_BUCKET:{
      async get(k){const data=objects.get(k);if(!data)return null;return {
        etag:data.etag,async json(){return structuredClone(data.value)}
      }},
      async put(k,json,{onlyIf}={}){
        if(!objects.has(k)||objects.get(k).etag!==onlyIf?.etagMatches)return null;
        const value=JSON.parse(json);
        objects.set(k,{value,etag:'etag-updated'});
        return {etag:'etag-updated'};
      }
    }
  };
  const store=new SonaraAuthStore({storage},env);
  async function op(action,id,seconds=25,ownerUid=uid,authenticated=true){
    const secret=await deriveRelayGatewayInternalKey(env);
    const headers={'content-type':'application/json','X-Sonara-Internal-Secret':secret};
    if(authenticated)headers.Cookie='sonara_session='+token;
    const response=await store.fetch(new Request(prefix,{method:'POST',headers,
      body:JSON.stringify({action,jobId:id,seconds,ownerUid})}));
    return {http:response.status,body:await response.json()};
  }
  return {op,values,store,objects,storage};
}

test('Pro requires active Studio and exact quota, including zero',async()=>{
  const free=setup({studio:false});
  assert.equal((await free.op('reserve',job(1))).http,403);
  const noQuota=setup({used:500*60});
  assert.equal((await noQuota.op('reserve',job(1))).http,402);
  assert.equal(noQuota.values.get(userKey).usageSeconds,500*60);
  const near=setup({used:500*60-74});
  assert.equal((await near.op('reserve',job(1))).http,402);
  assert.equal(near.values.get(userKey).usageSeconds,500*60-74);
});

test('Pro reservation is idempotent; one active job and triple-pass metering',async()=>{
  const s=setup();
  const first=await s.op('reserve',job(1));
  assert.equal(first.http,200);
  assert.equal(first.body.chargedSeconds,75);
  assert.equal((await s.op('reserve',job(1))).body.reused,true);
  assert.equal(s.values.get(userKey).usageSeconds,75);
  assert.equal((await s.op('reserve',job(2))).http,409);
  assert.equal((await s.op('verify',job(1))).http,200);
  assert.equal((await s.op('verify',job(1),26)).http,409);
  assert.equal((await s.op('commit',job(1),0,uid,false)).http,200);
  assert.equal((await s.op('commit',job(1),0,uid,false)).body.changed,false);
  assert.equal(s.values.get(userKey).usageSeconds,75);
  assert.equal((await s.op('refund',job(1),0,uid,false)).http,409);
  assert.equal((await s.op('reserve',job(2))).http,200);
});

test('Refund only once, rejects late commit and prevents cross-user claims',async()=>{
  const s=setup();
  assert.equal((await s.op('reserve',job(1),25,'other-user')).http,401);
  assert.equal((await s.op('reserve',job(1))).http,200);
  assert.equal((await s.op('verify',job(1),25,'other-user',false)).http,409);
  assert.equal((await s.op('refund',job(1),0,uid,false)).http,200);
  assert.equal((await s.op('refund',job(1),0,uid,false)).body.changed,false);
  assert.equal(s.values.get(userKey).usageSeconds,0);
  assert.equal((await s.op('commit',job(1),0,uid,false)).http,409);
  assert.equal((await s.op('reserve',job(2))).http,200);
});

test('Internal key cannot be replaced with just a user cookie',async()=>{
  const s=setup();
  const result=await s.store.fetch(new Request(prefix,{method:'POST',
    headers:{'content-type':'application/json',Cookie:'sonara_session='+token},
    body:JSON.stringify({action:'reserve',jobId:job(3),seconds:25,ownerUid:uid})}));
  assert.equal(result.status,401);
  assert.equal(s.values.get(userKey).usageSeconds,0);
});

test('Alarm refunds an orphan reservation after grace period only',async()=>{
  const s=setup();
  const id=job(4);
  assert.equal((await s.op('reserve',id)).http,200);
  assert.equal(s.values.get(userKey).usageSeconds,75);
  await s.store.alarm();
  assert.equal(s.values.get(userKey).usageSeconds,75);
  const ledger=s.values.get('remix-pro:quota:'+id);
  ledger.createdAt=Date.now()-11*60*1000;
  s.values.set('remix-pro:quota:'+id,ledger);
  await s.store.alarm();
  assert.equal(s.values.get(userKey).usageSeconds,0);
  assert.equal(s.values.get('remix-pro:quota:'+id).status,'refunded');
  assert.equal(s.values.has('remix-pro:active:'+id),false);
});

test('Alarm finalizes completed job exactly once',async()=>{
  const s=setup();
  const id=job(5);
  await s.op('reserve',id);
  s.objects.set('relay-v1/pro/jobs/'+id+'.json',{
    etag:'etag-start',
    value:{id,ownerUid:uid,kind:'sonara-remix-pro',status:'COMPLETE'}
  });
  await s.store.alarm();
  assert.equal(s.values.get('remix-pro:quota:'+id).status,'committed');
  assert.equal(s.values.get(userKey).usageSeconds,75);
  await s.store.alarm();
  assert.equal(s.values.get(userKey).usageSeconds,75);
});

test('Alarm terminalizes expired lease before refund',async()=>{
  const s=setup();
  const id=job(6);
  await s.op('reserve',id);
  s.objects.set('relay-v1/pro/jobs/'+id+'.json',{
    etag:'etag-start',
    value:{id,ownerUid:uid,kind:'sonara-remix-pro',status:'LEASED',
      leaseUntil:Date.now()-10000,attempts:3,createdAt:Date.now()-3600000}
  });
  await s.store.alarm();
  assert.equal(s.objects.get('relay-v1/pro/jobs/'+id+'.json').value.status,'FAILED');
  assert.equal(s.values.get('remix-pro:quota:'+id).status,'refunded');
  assert.equal(s.values.get(userKey).usageSeconds,0);
});

test('Alarm keeps reservation when R2 is unreadable or owns other users job',async()=>{
  const s=setup();
  const id=job(7);
  await s.op('reserve',id);
  s.objects.set('relay-v1/pro/jobs/'+id+'.json',{
    etag:'etag-start',
    value:{id,ownerUid:'other-user',kind:'sonara-remix-pro',status:'FAILED'}
  });
  await s.store.alarm();
  assert.equal(s.values.get('remix-pro:quota:'+id).status,'reserved');
});
