import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('./sonara-remix-pro-auto-duration-runtime.js',import.meta.url),'utf8');
test('runtime is valid JavaScript',()=>{new vm.Script(code)});
test('auto-duration has no old manual duration control policy',()=>{
  assert.match(code,/crypto\.getRandomValues/);
  assert.match(code,/120\+\(bytes\[0\]%7\)\*30/);
  assert.match(code,/stopImmediatePropagation/);
  assert.match(code,/expectedDurationSec=selected/);
  assert.match(code,/X-Sonara-Remix-Expected-Duration/);
  assert.match(code,/sonaraRemixPro!==true/);
  assert.doesNotMatch(code,/window\.__sonaraRemixProDurationSyncV4/);
});
test('non-Pro request remains byte-for-byte untouched',async()=>{
  const calls=[];
  const doc={readyState:'loading',addEventListener(){},querySelector(){return null}};
  const page={
    fetch:async(input,init)=>{calls.push({input,init});return new Response('{}',{status:200})}
  };
  vm.runInNewContext(code,{
    window:page,document:doc,URL,Response,Headers,crypto:{getRandomValues:()=>{throw Error('should not roll')}},
    location:{origin:'https://sonaraenterprise.com',href:'https://sonaraenterprise.com/'},
    Number,String,JSON,Math,Date,Uint32Array,Event:class {},setTimeout:()=>{},MutationObserver:class{},
    HTMLInputElement:class{},HTMLSelectElement:class{},Object
  });
  const original={method:'POST',body:JSON.stringify({sonaraRemixPro:false,durationSec:30})};
  await page.fetch('/api/billing/generate',original);
  assert.equal(calls.length,1);
  assert.equal(calls[0].init,original);
});
test('Pro request without an assigned automatic duration fails closed',async()=>{
  let called=0;
  const doc={readyState:'loading',addEventListener(){},querySelector(){return null}};
  const page={fetch:async()=>{called++;return new Response('{}',{status:200})}};
  vm.runInNewContext(code,{
    window:page,document:doc,URL,Response,Headers,
    location:{origin:'https://sonaraenterprise.com',href:'https://sonaraenterprise.com/'},
    Number,String,JSON,Math,Date,Uint32Array,Event:class {},setTimeout:()=>{},MutationObserver:class{},
    HTMLInputElement:class{},HTMLSelectElement:class{},Object
  });
  const result=await page.fetch('/api/billing/generate',{
    method:'POST',body:JSON.stringify({sonaraRemixPro:true,durationSec:30})
  });
  assert.equal(result.status,409);
  assert.equal(called,0);
});
