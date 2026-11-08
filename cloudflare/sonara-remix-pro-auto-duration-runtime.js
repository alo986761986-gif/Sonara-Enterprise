(()=>{
  'use strict';
  if(window.__sonaraRemixAutoDurationV1)return;
  window.__sonaraRemixAutoDurationV1=true;
  const valid=n=>Number.isInteger(n)&&n>=120&&n<=300&&(n-120)%30===0;
  const format=n=>Math.floor(n/60)+':'+String(n%60).padStart(2,'0');
  const randomDuration=()=>{
    const bytes=new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return 120+(bytes[0]%7)*30;
  };
  let current=null;
  let replaying=false;
  const labelNode=()=>{
    const slider=document.querySelector('[data-testid="sonara-remix-pro-duration-slider"]') ||
      document.querySelector('input[type="range"][min="30"][max="480"]');
    const label=slider&&slider.closest('label');
    if(!label||!/Durata Remix AI/i.test(label.textContent||''))return null;
    return {slider,label,select:label.querySelector('select')};
  };
  const message=(msg,warning=false)=>{
    const c=labelNode();
    if(!c)return;
    let note=c.label.querySelector('[data-sonara-remix-auto-note]');
    if(!note){
      note=document.createElement('small');
      note.setAttribute('data-sonara-remix-auto-note','v1');
      note.setAttribute('role','status');
      note.style.display='block';
      note.style.marginTop='8px';
      c.label.appendChild(note);
    }
    note.style.color=warning?'#ffb3b9':'#9ce6bb';
    note.textContent=msg;
  };
  const showAutomatic=()=>{
    const c=labelNode();
    if(!c)return;
    c.slider.style.display='none';
    c.slider.setAttribute('aria-hidden','true');
    c.slider.tabIndex=-1;
    if(c.select){
      c.select.style.display='none';
      c.select.setAttribute('aria-hidden','true');
      c.select.tabIndex=-1;
    }
    message(current?'Durata scelta da SONARA: '+format(current.seconds):
      'Durata automatica SONARA: ogni nuovo remix dura casualmente da 2 a 5 minuti.');
  };
  const setReactValue=(el,value,eventName)=>{
    if(!el)return;
    const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
    const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
    if(setter)setter.call(el,String(value));else el.value=String(value);
    el.dispatchEvent(new Event(eventName,{bubbles:true}));
  };
  document.addEventListener('click',event=>{
    const button=event.target&&typeof event.target.closest==='function'?
      event.target.closest('button'):null;
    if(!button||!/Crea Remix Pro reale/i.test(button.textContent||''))return;
    if(button.disabled)return;
    if(replaying){replaying=false;return;}
    // Prevent the original React handler from reading its stale slider state.
    event.preventDefault();
    event.stopImmediatePropagation();
    const seconds=randomDuration();
    current={seconds,at:Date.now()};
    const c=labelNode();
    if(c){
      setReactValue(c.slider,seconds,'input');
      setReactValue(c.slider,seconds,'change');
      setReactValue(c.select,seconds,'change');
    }
    showAutomatic();
    message('SONARA ha assegnato '+format(seconds)+'. Caricamento dei brani A+B.');
    // The next browser task lets React process the new value before the click.
    setTimeout(()=>{
      if(!button.isConnected||button.disabled)return;
      replaying=true;
      button.click();
      if(replaying)replaying=false;
    },0);
  },true);
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',showAutomatic,{once:true});
  }else showAutomatic();
  const startObserver=()=>{
    if(!document.body)return;
    const obs=new MutationObserver(()=>{
      const c=labelNode();
      if(c&&c.slider.style.display!=='none')showAutomatic();
    });
    obs.observe(document.body,{childList:true,subtree:true});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startObserver,{once:true});
  else startObserver();
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async function(input,init){
    let path='';
    try{
      const value=typeof input==='string'?input:input&&input.url;
      if(value){
        const url=new URL(value,location.href);
        if(url.origin===location.origin)path=url.pathname;
      }
    }catch{}
    const method=String(init?.method||input?.method||'GET').toUpperCase();
    if(path!=='/api/billing/generate'||method!=='POST'||typeof init?.body!=='string')
      return nativeFetch(input,init);
    let body;
    try{body=JSON.parse(init.body);}catch{return nativeFetch(input,init);}
    if(body?.sonaraRemixPro!==true)return nativeFetch(input,init);
    const selected=current&&Date.now()-current.at<45*60*1000?current.seconds:null;
    if(!valid(selected)){
      message('Durata automatica non disponibile. Nessun nuovo job inviato.',true);
      return new Response(JSON.stringify({error:{
        code:'REMIX_PRO_AUTO_DURATION_NOT_ASSIGNED',
        message:'SONARA non ha assegnato la durata automatica. Riprova senza duplicare job precedenti.'
      }}),{status:409,headers:{'content-type':'application/json'}});
    }
    const headers=new Headers(init.headers||input?.headers||undefined);
    body.durationSec=selected;
    body.expectedDurationSec=selected;
    headers.set('X-Sonara-Remix-Expected-Duration',String(selected));
    const response=await nativeFetch(input,{...init,headers,body:JSON.stringify(body)});
    if(response.ok){
      try{
        const result=await response.clone().json();
        if(result.jobId&&Number(result.requestedDurationSeconds)!==selected){
          message('Durata server diversa da '+format(selected)+
            '. Conserva il job esistente e non inviare duplicati.',true);
        }else if(result.jobId){
          message('Remix A+B inviato: durata '+format(selected)+'.');
        }
      }catch{}
    }
    return response;
  };
})();