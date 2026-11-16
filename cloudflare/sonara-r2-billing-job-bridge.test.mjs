import test from 'node:test';
import assert from 'node:assert/strict';
import { bridgeAceR2BillingJob } from './sonara-r2-billing-job-bridge.mjs';

const ID = 'sr2_841a73af-190e-4fd6-906c-62773a07ca35';
function context({record=true, session=true, owner='creator-owner', found=true}={}) {
  const seen = [];
  const env = {
    SONARA_R2_RELAY_ENABLED:'true',
    SONARA_AUDIO_BUCKET: { head:async key => {
      seen.push({kind:'head',key});
      return record ? {size:333} : null;
    } }
  };
  const deps = {
    sessionAuth:async request => {
      seen.push({kind:'session', cookie:request.headers.get('cookie'), path:new URL(request.url).pathname});
      return session ? Response.json({authenticated:true,user:{uid:owner}}) : Response.json({authenticated:false,user:null});
    },
    deriveKey:async () => 'secret-derived-from-worker-only-token',
    relayRuntime:{fetch:async (request, scoped) => {
      seen.push({
        kind:'relay',url:request.url,
        authorization:request.headers.get('X-Sonara-Internal-Secret'),
        uid:request.headers.get('X-Sonara-User-Uid'),
        scopedSecret:scoped.SONARA_INTERNAL_PROXY_SECRET
      });
      return found ? Response.json({jobId:ID,status:'COMPLETED',
        model:'acestep-v15-xl-sft',
        audioUrl:'https://api.sonaraenterprise.com/signed-audio'}) :
        Response.json({error:'Not found'}, {status:404});
    }}
  };
  const request = () => new Request('https://sonaraenterprise.com/api/billing/job?jobId='+ID,{
    headers:{
      cookie:'sonara_session=private-cookie',
      'X-Sonara-Internal-Secret':'client-spoofed-key',
      'X-Sonara-User-Uid':'malicious-user'
    }
  });
  return {request,env,deps,seen};
}

test('Successfully created ACE job is polled with native session and server-only gateway', async () => {
  const c=context();
  const reply=await bridgeAceR2BillingJob(c.request(),c.env,{},c.deps);
  assert.equal(reply.status,200);
  assert.equal(reply.headers.get('x-sonara-job-route'),'authenticated-ace-r2');
  const body=await reply.json();
  assert.equal(body.model,'acestep-v15-xl-sft');
  assert.equal(body.audioUrl,'https://api.sonaraenterprise.com/signed-audio');
  assert.equal(c.seen[0].key,'relay-v1/jobs/'+ID+'.json');
  assert.equal(c.seen[1].path,'/api/sonara-auth/session');
  assert.equal(c.seen[1].cookie,'sonara_session=private-cookie');
  assert.equal(c.seen[2].uid,'creator-owner');
  assert.equal(c.seen[2].authorization,'secret-derived-from-worker-only-token');
  assert.equal(c.seen[2].scopedSecret,'secret-derived-from-worker-only-token');
});

test('Unauthenticated owner never receives audio or internal relay credentials',async()=>{
  const c=context({session:false});
  const r=await bridgeAceR2BillingJob(c.request(),c.env,{},c.deps);
  assert.equal(r.status,401);
  assert.equal(c.seen.filter(x=>x.kind==='relay').length,0);
});

test('Other non-ACE sr2 work, unknown IDs and Remix Pro stay with their existing handlers',async()=>{
  const c=context({record:false});
  assert.equal(await bridgeAceR2BillingJob(c.request(),c.env,{},c.deps),null);
  assert.equal(c.seen.filter(x=>x.kind==='session').length,0);
  const other=new Request('https://sonaraenterprise.com/api/billing/job?jobId=srpro_841a73af-190e-4fd6-906c-62773a07ca35');
  assert.equal(await bridgeAceR2BillingJob(other,c.env,{},c.deps),null);
  const random=new Request('https://sonaraenterprise.com/api/billing/job?jobId=xyz');
  assert.equal(await bridgeAceR2BillingJob(random,c.env,{},c.deps),null);
});

test('Owned job errors remain errors; no hidden fallbacks to other music engines',async()=>{
  const c=context({found:false});
  const r=await bridgeAceR2BillingJob(c.request(),c.env,{},c.deps);
  assert.equal(r.status,404);
});
