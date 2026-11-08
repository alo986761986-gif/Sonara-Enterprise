import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { REMIX_PRO_DURATION_SYNC_V4_SCRIPT } from './sonara-remix-pro-duration-sync-v4.mjs';
const script=REMIX_PRO_DURATION_SYNC_V4_SCRIPT.replace(/^<script[^>]*>/,'').replace(/<\/script>$/,'');
const jobId='srpro_12345678-1234-1234-8234-123456789abc';
function setup(){
 const handlers=new Map(),calls=[];
 const slider={value:'120',closest(name){return name==='label'?label:null;}};
 const select={value:'120'};
 const label={textContent:'Durata Remix AI (30 secondi - 8 minuti)',note:null,
   querySelector(name){if(name==='select'||name.includes('duration-select'))return select;
     if(name==='[data-sonara-pro-duration-sync-v4]')return this.note;return null;},
   appendChild(n){this.note=n;}};
 const document={querySelector(selector){
   if(selector.includes('duration-slider'))return slider;return null;
 },addEventListener(name,fn){handlers.set(name,fn);},
 createElement(){return {style:{},setAttribute(){},textContent:''};}};
 const window={fetch:async (url,init)=>{
   calls.push({url,init});
   const body=JSON.parse(init.body),headers=new Headers(init.headers);
   return new Response(JSON.stringify({jobId,requestedDurationSeconds:body.durationSec}),{status:202});
 }};
 const context={window,document,location:{href:'https://sonaraenterprise.com/',origin:'https://sonaraenterprise.com'},Headers,Response,URL,Number,JSON,Date,String,Math};
 vm.runInNewContext(script,context);
 return {window,handlers,calls,slider,select,label};
}
function req(sec,expected,header,pro=true){return {method:'POST',headers:{'X-Sonara-Remix-Expected-Duration':String(header)},
 body:JSON.stringify({sonaraRemixPro:pro,durationSec:sec,expectedDurationSec:expected,
 sonaraRemixProSourceA:'sref-a',sonaraRemixProSourceB:'sref-b',sonaraRemixProRightsConfirmed:true})};}
test('selected 8:00 updates all 3 fields, keeps original sources and creates one request',async()=>{
 const p=setup();
 p.slider.value='480';p.select.value='480';
 p.handlers.get('change')({target:p.slider});
 p.handlers.get('click')({target:{closest(name){return name==='button'?{textContent:'Crea Remix Pro reale'}:null;}}});
 const response=await p.window.fetch('/api/billing/generate',req(30,30,30));
 assert.equal(response.status,202);assert.equal(p.calls.length,1);
 const call=p.calls[0],body=JSON.parse(call.init.body);
 assert.equal(body.durationSec,480);assert.equal(body.expectedDurationSec,480);
 assert.equal(new Headers(call.init.headers).get('X-Sonara-Remix-Expected-Duration'),'480');
 assert.equal(body.sonaraRemixProSourceA,'sref-a');
 assert.equal(body.sonaraRemixProSourceB,'sref-b');
});
test('without authenticated explicit choice and mismatched fields, fails locally without posting',async()=>{
 const p=setup();
 const response=await p.window.fetch('/api/billing/generate',req(30,480,30));
 assert.equal(response.status,409);
 assert.equal((await response.json()).error.code,'REMIX_PRO_DURATION_UNCONFIRMED');
 assert.equal(p.calls.length,0);
});
test('matching input fields untouched for valid 120s',async()=>{
 const p=setup();
 await p.window.fetch('/api/billing/generate',req(120,120,120));
 assert.equal(JSON.parse(p.calls[0].init.body).durationSec,120);
});
test('normal non-Pro generation not affected by previous Remix selection',async()=>{
 const p=setup();p.slider.value='480';p.select.value='480';
 p.handlers.get('change')({target:p.slider});
 await p.window.fetch('/api/billing/generate',req(30,30,30,false));
 assert.equal(JSON.parse(p.calls[0].init.body).durationSec,30);
});
