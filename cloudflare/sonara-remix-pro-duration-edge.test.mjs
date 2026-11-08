import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { REMIX_PRO_DURATION_EDGE_SCRIPT } from './sonara-remix-pro-duration-edge.mjs';

const script=REMIX_PRO_DURATION_EDGE_SCRIPT.replace(/^<script[^>]*>/,'').replace(/<\/script>$/,'');
function page({modern=false}={}) {
  const listeners=new Map();
  const note={textContent:'',style:{},setAttribute(){}};
  const option={value:'120'};
  const slider={
    value:'120',
    hasAttribute(name){return modern&&name==='data-testid';},
    closest(name){return name==='label'?label:null;}
  };
  const label={
    textContent:'Durata Remix AI (30 secondi - 8 minuti)',
    querySelector(name){return name==='select'?option:name==='[data-sonara-pro-duration-hotfix]'?this.note:null;},
    appendChild(item){this.note=item;}
  };
  const document={
    addEventListener(name,fn){listeners.set(name,fn);},
    querySelectorAll(sel){return sel==='input[type="range"][min="30"][max="480"]'?[slider]:[];},
    createElement(){return {...note,style:{}};}
  };
  const calls=[];
  const window={
    fetch:async(input,init)=>{
      calls.push({input,init});
      const duration=JSON.parse(init.body).durationSec;
      return new Response(JSON.stringify({
        jobId:'srpro_12345678-1234-1234-8234-123456789abc',
        requestedDurationSeconds:duration
      }),{status:202,headers:{'content-type':'application/json'}});
    }
  };
  vm.runInNewContext(script,{
    window,document,location:{href:'https://sonaraenterprise.com/remix',origin:'https://sonaraenterprise.com'},
    URL,Response,Date,Number,String,JSON,Math
  });
  return {window,document,slider,option,label,listeners,calls};
}
function select(p,seconds){
  p.slider.value=String(seconds);
  p.option.value=String(seconds);
  p.listeners.get('change')({target:p.slider});
  p.listeners.get('click')({
    target:{closest(name){return name==='button'?{textContent:'Crea Remix Pro reale'}:null;}}
  });
}
test('old Vercel UI must send exact 480s after user selects 8:00, even if stale React state sends 30',async()=>{
  const p=page();
  select(p,480);
  const response=await p.window.fetch('/api/billing/generate',{
    method:'POST',body:JSON.stringify({sonaraRemixPro:true,durationSec:30,
      sonaraRemixProSourceA:'ref-a',sonaraRemixProSourceB:'ref-b',sonaraRemixProRightsConfirmed:true})
  });
  assert.equal(response.status,202);
  const payload=JSON.parse(p.calls[0].init.body);
  assert.equal(payload.durationSec,480);
  assert.equal(payload.sonaraRemixProSourceB,'ref-b');
  assert.match(p.label.note.textContent,/8:00/);
});
test('modern React slider preserves the explicit selection over stale 30s state',async()=>{
  const p=page({modern:true});
  select(p,480);
  const response=await p.window.fetch('/api/billing/generate',{
    method:'POST',body:JSON.stringify({sonaraRemixPro:true,durationSec:30})
  });
  assert.equal(response.status,202);
  assert.equal(JSON.parse(p.calls[0].init.body).durationSec,480);
  assert.match(p.label.note.textContent,/8:00/);
});
test('background Remix Pro POST without any explicit selection is not rewritten',async()=>{
  const p=page({modern:true});
  const response=await p.window.fetch('/api/billing/generate',{
    method:'POST',body:JSON.stringify({sonaraRemixPro:true,durationSec:300})
  });
  assert.equal(response.status,202);
  assert.equal(JSON.parse(p.calls[0].init.body).durationSec,300);
});
test('modern input event locks the chosen duration even before a Generate click',async()=>{
  const p=page({modern:true});
  p.slider.value='420';
  p.option.value='420';
  p.listeners.get('input')({target:p.slider});
  const response=await p.window.fetch('/api/billing/generate',{
    method:'POST',body:JSON.stringify({sonaraRemixPro:true,durationSec:30})
  });
  assert.equal(response.status,202);
  assert.equal(JSON.parse(p.calls[0].init.body).durationSec,420);
});
test('non-Pro generation remains untouched by 8-minute shim',async()=>{
  const p=page();
  select(p,480);
  await p.window.fetch('/api/billing/generate',{
    method:'POST',body:JSON.stringify({durationSec:30,sonaraRemixPro:false})
  });
  assert.equal(JSON.parse(p.calls[0].init.body).durationSec,30);
});
