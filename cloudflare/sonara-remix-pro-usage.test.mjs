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
  const storage={
    async get(k){return structuredClone(values.get(k))},
    async put(k,v){values.set(k,structuredClone(v))},
    async delete(k){values.delete(k)},
    async transaction(fn){return fn(this)}
  };
  const env={SONARA_RELAY_TOKEN:'test-only-private-relay-signing-root-12345678901234567890'};
  const store=new SonaraAuthStore({storage},env);
  async function op(action,id,seconds=25,ownerUid=uid,authenticated=true){
    const secret=await deriveRelayGatewayInternalKey(env);
    const headers={'content-type':'application/json','X-Sonara-Internal-Secret':secret};
    if(authenticated)headers.Cookie='sonara_session='+token;
    const response=await store.fetch(new Request(prefix,{method:'POST',headers,
      body:JSON.stringify({action,jobId:id,seconds,ownerUid})}));
    return {http:response.status,body:await response.json()};
  }
  return {op,values,store};
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
