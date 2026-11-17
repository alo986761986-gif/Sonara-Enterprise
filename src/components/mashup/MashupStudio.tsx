import { useEffect, useRef, useState } from 'react';
import { AudioLines, Download, Headphones, Library, Music2, SlidersHorizontal, Sparkles, UploadCloud, X } from 'lucide-react';
import { buildMashupPlan, estimateBpm, renderMashup, waveformPeaks, type MashupMode, type MashupTrack, type MashupSettings } from './mashupEngine';

type Loaded = MashupTrack & { name: string; peaks: number[]; confidence: number };
type Item = { id: string; name: string; url: string; bytes: number; createdAt: string };
type GpuJob = {jobId:string;title?:string;status:string;stage:string;progress:number;audioUrl?:string|null;error?:string|null;createdAt:number;durationSec:number;stemsVerified?:boolean;};
const GPU_JOB_KEY='sonara.mashup.gpu.active';
const fileAccept = '.wav,.mp3,.flac,.m4a,.aac,.aiff,.ogg';
const humanTime = (seconds:number) => Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0');
const selectedDefault: MashupSettings = {
  mode:'club',targetBpm:124,durationSec:120,blend:85,crossfadeSec:2,
  bassB:-6,midB:0,trebleB:0
};
function Waveform({values, tone}:{values:number[];tone:string}){
  return <div className="flex h-14 items-center gap-[2px] overflow-hidden rounded-lg bg-[#101321] px-2" aria-hidden="true">
    {values.map((value,i)=><span key={i} className={'min-w-0 flex-1 rounded-full '+tone} style={{height:Math.max(5,value*50)+'px'}} />)}
  </div>;
}
export default function MashupStudio(){
  const [open,setOpen]=useState(()=>window.location.pathname.replace(/\/$/,'')==='/mashup');
  const [tracks,setTracks]=useState<Array<Loaded|null>>([null,null]);
  const [files,setFiles]=useState<Array<File|null>>([null,null]);
  const [gpuEnabled,setGpuEnabled]=useState(false);
  const [gpuAvailable,setGpuAvailable]=useState(false);
  const [gpuJob,setGpuJob]=useState<GpuJob|null>(null);
  const [gpuLibrary,setGpuLibrary]=useState<GpuJob[]>([]);
  const [rights,setRights]=useState(false);
  const [settings,setSettings]=useState<MashupSettings>(selectedDefault);
  const [stage,setStage]=useState('Pronto per due sorgenti audio');
  const [error,setError]=useState('');
  const [working,setWorking]=useState(false);
  const [result,setResult]=useState<Item|null>(null);
  const [library,setLibrary]=useState<Item[]>([]);
  const resultUrls=useRef<string[]>([]);
  useEffect(()=>{
    const start=()=>setOpen(true);
    window.addEventListener('sonara:open-mashup',start);
    const install=()=>{
      const existing=document.querySelector('[data-sonara-mashup-entry="nav"]');
      const nav=document.querySelector('.sonara-violet-nav-links');
      if(nav&&!existing){
        const button=document.createElement('button');
        button.type='button';button.dataset.sonaraMashupEntry='nav';
        button.innerHTML='<span aria-hidden="true">♫</span><span>Mashup AI</span>';
        button.addEventListener('click',start);nav.appendChild(button);
      }
      const quick=document.querySelector('.sonara-violet-quick-actions');
      if(quick&&!quick.querySelector('[data-sonara-mashup-entry="quick"]')){
        const button=document.createElement('button');
        button.type='button';button.dataset.sonaraMashupEntry='quick';
        button.innerHTML='<span aria-hidden="true" style="font-size:22px">♫</span><span><strong>Mashup AI Pro</strong><small>Combina due brani</small></span>';
        button.addEventListener('click',start);quick.appendChild(button);
      }
    };
    install();const observer=new MutationObserver(install);
    observer.observe(document.body,{childList:true,subtree:true});
    return ()=>{observer.disconnect();window.removeEventListener('sonara:open-mashup',start);
      document.querySelectorAll('[data-sonara-mashup-entry]').forEach(node=>node.remove());};
  },[]);
  useEffect(()=>()=>{for(const u of resultUrls.current)URL.revokeObjectURL(u);},[]);
  useEffect(()=>{if(!open)return;let cancelled=false;
    const inspect=async()=>{
      try{
        const response=await fetch('/api/sonara-relay/mashup-capabilities',{credentials:'include',cache:'no-store'});
        const data=await response.json();
        if(!cancelled)setGpuAvailable(response.ok&&data.available===true);
      }catch{if(!cancelled)setGpuAvailable(false);}
    };
    const reloadLibrary=async()=>{
      try{
        const r=await fetch('/api/sonara-relay/mashup-library',{credentials:'include',cache:'no-store'});
        if(!r.ok)return;
        const data=await r.json();
        if(!cancelled)setGpuLibrary(Array.isArray(data.items)?data.items:[]);
      }catch{}
    };
    void inspect();void reloadLibrary();
    const interval=window.setInterval(()=>void inspect(),15000);
    return()=>{cancelled=true;window.clearInterval(interval);};
  },[open]);
  useEffect(()=>{if(!open)return;let cancelled=false;
    let id='';
    try{id=sessionStorage.getItem(GPU_JOB_KEY)||'';}catch{}
    if(!/^smash_[a-f0-9-]{36}$/.test(id))return;
    void (async()=>{
      const j=await fetch('/api/sonara-relay/mashup-job/'+id,{credentials:'include',cache:'no-store'});
      if(cancelled||!j.ok)return;
      const data:GpuJob=await j.json();
      setGpuJob(data);
      if(data.status==='PROCESSING'){setWorking(true);void pollGpu(data.jobId);}
    })();
    return()=>{cancelled=true;};
  },[open]);
  useEffect(()=>{if(!open)return;
    document.body.dataset.sonaraMashupOpen='true';
    const esc=(ev:KeyboardEvent)=>{if(ev.key==='Escape'&&!working)setOpen(false);};
    window.addEventListener('keydown',esc);
    return ()=>{delete document.body.dataset.sonaraMashupOpen;window.removeEventListener('keydown',esc);};
  },[open,working]);
  const update=(key:keyof MashupSettings,value:string|number)=>{
    setSettings(previous=>({...previous,[key]:value}));
    setResult(null);
  };
  async function loadFile(index:number,file?:File){
    if(!file)return;
    setError('');setResult(null);
    if(file.size>110*1024*1024){setError('File troppo grande: limite 110 MB per sorgente.');return;}
    if(!/\.(wav|mp3|flac|m4a|aac|aiff?|ogg)$/i.test(file.name)){setError('Formato non supportato.');return;}
    const ac=new AudioContext();
    try{
      setStage('Decodifica '+file.name);
      const buffer=await ac.decodeAudioData(await file.arrayBuffer());
      if(buffer.duration<10||buffer.duration>900)throw new Error('Il brano deve durare da 10 secondi a 15 minuti.');
      const detected=estimateBpm(buffer);
      const loaded:Loaded={name:file.name,buffer,bpm:detected.bpm||124,confidence:detected.confidence,offset:0,peaks:waveformPeaks(buffer)};
      setTracks(current=>current.map((entry,i)=>i===index?loaded:entry));
      setFiles(current=>current.map((entry,i)=>i===index?file:entry));
      setStage('Sorgente pronta. Controlla BPM e punto di partenza.');
    }catch(e){setError(e instanceof Error?e.message:'Impossibile decodificare il file.');}
    finally{void ac.close();}
  }
  const save=async(item:Item,blob:Blob)=>{
    try{
      const db=await new Promise<IDBDatabase>((resolve,reject)=>{
        const req=indexedDB.open('sonara-mashup-v1',1);
        req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('masters'))req.result.createObjectStore('masters',{keyPath:'id'});};
        req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
      });
      const tx=db.transaction('masters','readwrite');
      tx.objectStore('masters').put({id:item.id,name:item.name,createdAt:item.createdAt,blob});
      await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
      db.close();setStage('Master salvato nell’archivio locale del dispositivo.');
    }catch{setStage('Master esportabile; archivio locale non disponibile in questo browser.');}
  };
  async function refreshLibrary(){
    try{
      const db=await new Promise<IDBDatabase>((resolve,reject)=>{const req=indexedDB.open('sonara-mashup-v1',1);
        req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('masters'))req.result.createObjectStore('masters',{keyPath:'id'});};
        req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
      const tx=db.transaction('masters','readonly');
      const saved=await new Promise<Array<{id:string;name:string;createdAt:string;blob:Blob}>>((resolve,reject)=>{
        const q=tx.objectStore('masters').getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
      db.close();
      setLibrary(saved.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,40).map(entry=>{
        const url=URL.createObjectURL(entry.blob);resultUrls.current.push(url);
        return {id:entry.id,name:entry.name,url,createdAt:entry.createdAt,bytes:entry.blob.size};
      }));
    }catch{setLibrary([]);}
  }
  async function generate(){
    if(!tracks[0]||!tracks[1])return;
    setWorking(true);setError('');setResult(null);
    try{
      const plan=buildMashupPlan(tracks[0],tracks[1],settings);
      setStage('Analisi di compatibilità ritmica');
      const blob=await renderMashup(tracks[0],tracks[1],settings,setStage);
      const url=URL.createObjectURL(blob);resultUrls.current.push(url);
      const item:Item={id:crypto.randomUUID(),name:'SONARA Mashup '+new Date().toLocaleString('it-IT'),url,bytes:blob.size,createdAt:new Date().toISOString()};
      setResult(item);await save(item,blob);await refreshLibrary();
      setStage('Mashup WAV pronto. '+(plan.warnings.length?'Leggi le note tecniche.':''));
    }catch(e){setError(e instanceof Error?e.message:'Rendering audio non riuscito.');setStage('Operazione interrotta');}
    finally{setWorking(false);}
  }
  async function gpuRequest(endpoint:string,options:RequestInit={}){
    const response=await fetch('/api/sonara-relay/'+endpoint,{
      credentials:'include',cache:'no-store',...options
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(typeof payload.error==='string'?payload.error:'Gateway Mashup HTTP '+response.status);
    return payload;
  }
  async function pollGpu(id:string){
    for(let i=0;i<360;i++){
      try{
        const job:GpuJob=await gpuRequest('mashup-job/'+id);
        setGpuJob(job);setStage('GPU: '+job.stage+' · '+job.progress+'%');
        if(job.status==='COMPLETED'){
          setStage('Mashup GPU con stem reali completato.');
          try{sessionStorage.removeItem(GPU_JOB_KEY);}catch{}
          const lib=await gpuRequest('mashup-library');
          setGpuLibrary(Array.isArray(lib.items)?lib.items:[]);
          setWorking(false);return;
        }
        if(job.status==='FAILED'){
          setError(job.error||'Mashup GPU non riuscito.');
          setWorking(false);return;
        }
      }catch(e){
        setError(e instanceof Error?e.message:'Connessione GPU temporaneamente interrotta.');
      }
      await new Promise(resolve=>window.setTimeout(resolve,5000));
    }
    setWorking(false);setError('Il controllo ha superato il tempo previsto. Il job rimane consultabile nell’archivio.');
  }
  async function generateGpu(){
    if(!gpuAvailable||!files[0]||!files[1]||!tracks[0]||!tracks[1]||!rights)return;
    if(files.some(f=>!f||f.size>64*1024*1024||!/\.(wav|mp3|flac|m4a|ogg)$/i.test(f.name))){
      setError('Per la GPU sono supportati WAV, MP3, FLAC, M4A, OGG fino a 64 MiB per file.');return;
    }
    if(Math.abs(tracks[0].bpm/tracks[1].bpm-1)>0.12){
      setError('I BPM sono incompatibili oltre il 12%. Correggi il valore rilevato.');return;
    }
    setWorking(true);setError('');setGpuJob(null);
    try{
      const refs:string[]=[];
      for(const [i,file] of files.entries()){
        if(!file)throw new Error('File mancante.');
        setStage('Upload privato sorgente '+(i?'B':'A'));
        const data=await gpuRequest('mashup-source',{
          method:'POST',headers:{'Content-Type':'application/octet-stream','X-Sonara-Mashup-Name':file.name,'X-Sonara-Mashup-Format':file.name.split('.').pop()?.toLowerCase()||''},body:file
        });
        refs.push(data.sourceId);
      }
      setStage('Prenotazione GPU');
      const mode=settings.mode==='club'?'club':'dialogue';
      const job:GpuJob=await gpuRequest('mashup-enqueue',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({sourceA:refs[0],sourceB:refs[1],bpmA:tracks[0].bpm,bpmB:tracks[1].bpm,
          durationSec:settings.durationSec,mode,title:'SONARA Mashup GPU',rightsConfirmed:true})
      });
      setGpuJob(job);
      try{sessionStorage.setItem(GPU_JOB_KEY,job.jobId);}catch{}
      void pollGpu(job.jobId);
    }catch(e){
      setError(e instanceof Error?e.message:'Invio GPU non riuscito.');
      setWorking(false);
    }
  }
  const plan=tracks[0]&&tracks[1]?(()=>{try{return buildMashupPlan(tracks[0],tracks[1],settings);}catch{return null;}})():null;
  if(!open)return null;
  return <div className="fixed inset-0 z-[100000] overflow-y-auto bg-[#070911]/98 text-slate-100" data-sonara-mashup-studio="true" role="dialog" aria-modal="true" aria-label="SONARA Mashup AI Pro">
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-8">
      <header className="flex items-start justify-between gap-4">
        <div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-300">SONARA ENTERPRISE · DJ WORKSPACE</p>
          <h1 className="mt-2 flex items-center gap-3 text-2xl font-black sm:text-3xl"><AudioLines className="text-violet-400"/> MASHUP AI PRO</h1>
          <p className="mt-2 text-sm text-slate-400">Mashup stereo offline o separazione reale Demucs su RTX PRO 6000 quando connessa.</p></div>
        <button aria-label="Chiudi Mashup" disabled={working} onClick={()=>{setOpen(false);if(window.location.pathname==='/mashup')history.replaceState({},'','/');}}
          className="rounded-xl border border-slate-700 p-3 hover:bg-slate-800 disabled:opacity-40"><X size={19}/></button>
      </header>
      <section className="rounded-2xl border border-slate-800 bg-[#151927] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={working} onClick={()=>{setGpuEnabled(false);setError('');}}
            className={'rounded-xl px-4 py-2 text-xs font-bold '+(!gpuEnabled?'bg-violet-600 text-white':'border border-slate-700 text-slate-300')}>Stereo locale</button>
          <button disabled={!gpuAvailable||working} onClick={()=>{setGpuEnabled(true);setError('');}}
            className={'rounded-xl px-4 py-2 text-xs font-bold '+(gpuEnabled?'bg-violet-600 text-white':'border border-slate-700 text-slate-300')+' disabled:opacity-40'}>
            GPU · Stem Demucs</button>
          <span className={'text-xs '+(gpuAvailable?'text-emerald-300':'text-amber-300')}>
            {gpuAvailable?'MoLab GPU collegata e verificata':'MoLab GPU non disponibile: rimane utilizzabile il mix stereo'}
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-500">In modalità GPU le voci e gli strumenti vengono separati davvero. Richiede due WAV/MP3/FLAC/M4A/OGG fino a 64 MiB. La GPU non utilizza ACE-Step.</p>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        {tracks.map((track,index)=><section key={index} className="rounded-2xl border border-slate-800 bg-[#151927] p-5">
          <div className="mb-4 flex items-center gap-2 font-bold"><Music2 className={index===0?'text-violet-400':'text-cyan-400'}/> BRANO {index===0?'A':'B'}</div>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 bg-[#0c1020] p-5 text-sm hover:border-violet-400">
            <UploadCloud size={18}/> {track?'Sostituisci file audio':'Carica file audio'}
            <input type="file" accept={fileAccept} disabled={working} className="sr-only" onChange={e=>void loadFile(index,e.target.files?.[0])}/>
          </label>
          {track?<div className="mt-4 space-y-3">
            <div className="truncate text-sm text-slate-200" title={track.name}>{track.name} · {humanTime(track.buffer.duration)}</div>
            <Waveform values={track.peaks} tone={index===0?'bg-violet-400':'bg-cyan-400'}/>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-slate-400">BPM {track.confidence<0.4?'(verifica manuale)':'(stimato)'}
                <input type="number" min="60" max="220" value={track.bpm} disabled={working}
                  onChange={e=>setTracks(old=>old.map((x,i)=>i===index&&x?{...x,bpm:Number(e.target.value)}:x))}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-[#0b1020] p-2 text-white"/></label>
              <label className="text-xs text-slate-400">Punto iniziale (secondi)
                <input type="number" min="0" max={Math.floor(track.buffer.duration-1)} step="0.1" value={track.offset} disabled={working}
                  onChange={e=>setTracks(old=>old.map((x,i)=>i===index&&x?{...x,offset:Number(e.target.value)}:x))}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-[#0b1020] p-2 text-white"/></label>
            </div>
          </div>:<p className="mt-3 text-xs text-slate-500">WAV · MP3 · FLAC · M4A · AAC · AIFF · OGG, quando supportati dal browser.</p>}
        </section>)}
      </div>
      <section className="rounded-2xl border border-slate-800 bg-[#151927] p-5">
        <div className="mb-4 flex items-center gap-2 text-base font-bold"><SlidersHorizontal className="text-violet-400"/> Arrangiamento e controlli</div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs text-slate-400">Modalità creativa
            <select value={settings.mode} disabled={working} onChange={e=>update('mode',e.target.value as MashupMode)} className="mt-2 w-full rounded-lg border border-slate-700 bg-[#0b1020] p-3 text-white">
              <option value="club">House / Club · cassa A protagonista</option><option value="transitions">DJ Transitions · alternanza</option><option value="conversation">Vocal Conversation · alternanza stereo</option>
            </select></label>
          <label className="text-xs text-slate-400">BPM master
            <input type="number" min="60" max="200" value={settings.targetBpm} onChange={e=>update('targetBpm',Number(e.target.value))} disabled={working}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-[#0b1020] p-3 text-white"/></label>
          <label className="text-xs text-slate-400">Durata
            <select value={settings.durationSec} onChange={e=>update('durationSec',Number(e.target.value))} disabled={working} className="mt-2 w-full rounded-lg border border-slate-700 bg-[#0b1020] p-3 text-white">
              {[30,60,90,120,150,180,210,240,270,300].map(n=><option key={n} value={n}>{humanTime(n)}</option>)}
            </select></label>
          {([{key:'blend',label:'Presenza del brano B',min:0,max:100,suffix:'%'},{key:'crossfadeSec',label:'Crossfade',min:0.25,max:8,suffix:' s'},{key:'bassB',label:'Bassi B',min:-12,max:12,suffix:' dB'},{key:'midB',label:'Medi B',min:-12,max:12,suffix:' dB'},{key:'trebleB',label:'Alti B',min:-12,max:12,suffix:' dB'}] as const).map(control=><label key={control.key} className="text-xs text-slate-400">
            <span className="flex justify-between"><span>{control.label}</span><b className="text-white">{settings[control.key]}{control.suffix}</b></span>
            <input type="range" className="mt-3 w-full accent-violet-500" min={control.min} max={control.max} step={control.key==='crossfadeSec'?0.25:1} value={settings[control.key]} disabled={working}
              onChange={e=>update(control.key,Number(e.target.value))}/></label>)}
        </div>
      </section>
      <section className="rounded-2xl border border-violet-500/20 bg-[#171226] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">Direzione musicale · anteprima del piano</h2>
          <p className="mt-1 text-xs text-slate-400">Transizioni a frasi di 8 battute; cassa del brano A prioritaria in modalità Club.</p></div>
          <span className="rounded-full bg-violet-500/15 px-3 py-1 text-xs text-violet-200">Mix stereo · locale · senza ACE-Step</span></div>
        {gpuEnabled&&<p className="mt-2 text-xs text-violet-300">Modalità GPU: ritmo e BPM del brano A. Le transizioni sono calcolate sulle frasi musicali, senza rigenerazione ACE-Step.</p>}
        <div className="mt-4 grid grid-cols-8 gap-1">{Array.from({length:8},(_,i)=><div key={i} className={'h-8 rounded-md '+(settings.mode==='club'?'bg-violet-500/40':i%2===0?'bg-violet-500/50':'bg-cyan-500/40')} title={'Frase '+(i+1)}/>)}</div>
        {plan?<div className="mt-4 space-y-2 text-xs text-amber-200">{plan.warnings.map((w,i)=><p key={i}>• {w}</p>)}</div>:<p className="mt-3 text-xs text-slate-400">Carica due brani e imposta BPM compatibili (massimo ±12%) prima di generare.</p>}
        {gpuEnabled&&<label className="mt-4 flex items-center gap-3 text-xs text-slate-300">
          <input type="checkbox" checked={rights} onChange={e=>setRights(e.target.checked)} disabled={working} className="accent-violet-500"/>
          Confermo di avere i diritti necessari sui due brani.
        </label>}
        <button disabled={working||(gpuEnabled?(!gpuAvailable||!tracks[0]||!tracks[1]||!rights):!plan)}
          onClick={()=>void (gpuEnabled?generateGpu():generate())}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 p-4 font-bold disabled:cursor-not-allowed disabled:opacity-40">
          <Sparkles size={19}/>{working?'Elaborazione audio in corso…':gpuEnabled?'GENERA MASHUP GPU · STEM REALI':'GENERA MASHUP PRO'}</button>
        <p className="mt-3 text-center text-xs text-slate-400" role="status">{stage}</p>
        {error&&<p role="alert" className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
      </section>
      {gpuJob?.status==='COMPLETED'&&gpuJob.audioUrl&&<section className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5">
        <h2 className="font-bold">Master GPU · stem Demucs verificati</h2>
        <audio controls src={gpuJob.audioUrl} className="mt-3 w-full"/>
        <a href={gpuJob.audioUrl} download={'SONARA-Mashup-GPU-'+gpuJob.jobId+'.wav'}
          className="mt-3 inline-flex gap-2 rounded-lg border border-emerald-500/30 px-3 py-2 text-sm text-emerald-300">
          <Download size={18}/> Scarica il master</a>
        <p className="mt-2 text-xs text-slate-400">La verifica degli stem non garantisce il risultato artistico. Ascolta il brano prima di utilizzarlo.</p>
      </section>}
      {result&&<section className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5">
        <h2 className="mb-3 flex items-center gap-2 font-bold"><Headphones size={18}/> Il tuo mashup è pronto</h2>
        <audio controls src={result.url} className="w-full"/>
        <a href={result.url} download={'SONARA-Mashup-'+result.id.slice(0,8)+'.wav'} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 px-4 py-3 text-sm font-bold text-emerald-300"><Download size={17}/> Scarica WAV stereo</a>
      </section>}
      <section className="rounded-2xl border border-slate-800 bg-[#151927] p-5">
        <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-bold"><Library size={18}/> Archivio personale Mashup</h2>
          <button onClick={()=>void refreshLibrary()} className="rounded-lg border border-slate-700 px-3 py-2 text-xs">Aggiorna archivio</button></div>
        <p className="mt-2 text-xs text-slate-500">I master sono salvati nel browser di questo dispositivo. Non sono sincronizzati con l'account.</p>
        <div className="mt-3 space-y-2">{library.length?library.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#0b1020] p-3">
          <div><p className="text-sm">{item.name}</p><p className="text-xs text-slate-500">{(item.bytes/1048576).toFixed(1)} MB</p></div>
          <a href={item.url} download={'SONARA-Mashup-'+item.id.slice(0,8)+'.wav'} className="text-xs font-bold text-violet-300">Scarica WAV</a>
        </div>):<p className="text-xs text-slate-500">Nessun mashup salvato su questo dispositivo.</p>}</div>
      </section>
      <section className="rounded-2xl border border-slate-800 bg-[#151927] p-5">
        <h2 className="font-bold">Archivio GPU · account SONARA</h2>
        <p className="my-2 text-xs text-slate-400">I master GPU vengono custoditi in R2 con accesso riservato al tuo account.</p>
        {gpuLibrary.length?gpuLibrary.map(job=><div key={job.jobId} className="my-2 rounded-lg bg-[#0b1020] p-3">
          <p className="text-sm">{job.title||'Mashup GPU'} · {humanTime(job.durationSec)}</p>
          {job.audioUrl&&<><audio controls src={job.audioUrl} className="mt-2 w-full"/>
            <a href={job.audioUrl} download={job.jobId+'.wav'} className="text-xs text-violet-300">Scarica WAV</a></>}
        </div>):<p className="text-xs text-slate-500">Nessun master GPU pubblicato.</p>}
      </section>
      <p className="pb-8 text-xs leading-5 text-slate-500">Questa versione offre elaborazione audio stereo reale e non separa voci o strumenti. L'analisi BPM è una stima da verificare; il cambio velocità può modificare la tonalità. Usa soltanto registrazioni per cui possiedi i diritti necessari.</p>
    </div>
  </div>;
}
