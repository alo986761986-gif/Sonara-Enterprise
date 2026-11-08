import { useEffect, useRef, useState } from 'react';
import { AudioWaveform, Check, Download, LoaderCircle, ShieldCheck, UploadCloud } from 'lucide-react';

type ProJob = {jobId?: string;status?: string;stage?: string;progress?: number;audioUrl?: string;
  stems?: {role:string;url:string}[];error?: string;};
const isJob = (id:string) => /^srpro_[0-9a-f-]{36}$/.test(id);
const sleep=(ms:number)=>new Promise(resolve=>window.setTimeout(resolve,ms));
const safeError=(value:unknown,fallback:string)=>typeof value==='string'&&value.length<250?value:fallback;
const KEY='sonara.remixPro.activeJob.v1';

export default function SonaraRemixProPanel() {
  const [available,setAvailable]=useState<boolean|null>(null);
  const [sourceA,setSourceA]=useState<File|null>(null);
  const [sourceB,setSourceB]=useState<File|null>(null);
  const [prompt,setPrompt]=useState('Create one cohesive professional new remix preserving the principal melody and A harmonies, with the rhythmic groove and drum articulation of B.');
  const [duration,setDuration]=useState(60);
  const [bassFrom,setBassFrom]=useState<'a'|'b'>('a');
  const [bpmA,setBpmA]=useState('');
  const [bpmB,setBpmB]=useState('');
  const [rights,setRights]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  const [job,setJob]=useState<ProJob|null>(null);
  const [error,setError]=useState('');
  const [info,setInfo]=useState('');
  const mounted=useRef(true);
  const activeJob=useRef('');

  useEffect(()=>{
    mounted.current=true;
    const previous=(()=>{try{return sessionStorage.getItem(KEY)||'';}catch{return '';}})();
    if(isJob(previous)){activeJob.current=previous;setJob({jobId:previous,status:'PROCESSING',progress:0});}
    fetch('/api/sonara-relay/pro-capabilities',{cache:'no-store',credentials:'include'})
      .then(r=>r.ok?r.json():{available:false})
      .then(x=>{if(mounted.current)setAvailable(x.available===true);})
      .catch(()=>{if(mounted.current)setAvailable(false);});
    return()=>{mounted.current=false;};
  },[]);

  useEffect(()=>{
    const id=job?.jobId;
    if(!id||!isJob(id)||job?.status==='COMPLETED'||job?.status==='FAILED')return;
    let cancelled=false;
    void (async()=>{
      let errors=0;
      for(let i=0;i<520&&!cancelled;i++){
        try{
          const response=await fetch('/api/sonara-relay/pro-job/'+id,{credentials:'include',cache:'no-store'});
          const data:ProJob=await response.json().catch(()=>({}));
          if(!response.ok)throw new Error(safeError(data.error,'Monitoraggio temporaneamente non disponibile'));
          if(cancelled||!mounted.current)return;
          errors=0;
          setJob(data);
          if(data.status==='COMPLETED'||data.status==='FAILED'){
            try{sessionStorage.removeItem(KEY);}catch{}
            return;
          }
          setInfo('Fase: '+String(data.stage||'elaborazione')+' — '+Math.round(Number(data.progress||0))+'%');
          await sleep(2500);
        }catch{
          errors++;
          if(errors>10){if(mounted.current)setError('Monitoraggio interrotto. Il job '+id+' è conservato: riapri Remix Pro per riprenderlo.');return;}
          await sleep(Math.min(errors*2000,12000));
        }
      }
    })();
    return()=>{cancelled=true;};
  },[job?.jobId,job?.status]);

  const upload=async(file:File)=>{
    if(file.size<44||file.size>80*1024*1024||!/^audio\/(?:wav|x-wav|wave)$/.test(file.type||'audio/wav')&&!/\.wav$/i.test(file.name)){
      throw new Error('Carica una sorgente WAV fino a 80 MB.');
    }
    const buffer=await file.slice(0,12).arrayBuffer();
    const bytes=new Uint8Array(buffer);
    if(String.fromCharCode(...bytes.slice(0,4))!=='RIFF'||String.fromCharCode(...bytes.slice(8,12))!=='WAVE'){
      throw new Error('Il file non è un WAV autentico.');
    }
    const r=await fetch('/api/sonara-relay/reference',{
      method:'POST',credentials:'include',
      headers:{'Content-Type':'audio/wav','X-Sonara-Reference-Name':file.name.slice(0,120)},
      body:file
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok||!/^sref_[0-9a-f-]{36}$/.test(String(data.referenceId||''))){
      throw new Error(safeError(data.error,'Caricamento privato R2 non riuscito.'));
    }
    return String(data.referenceId);
  };

  const begin=async()=>{
    if(submitting||activeJob.current&&job?.status!=='FAILED'&&job?.status!=='COMPLETED')return;
    if(available!==true){setError('Remix Pro GPU non ancora collegato. Usa il Remix normale.');return;}
    if(!sourceA||!sourceB){setError('Seleziona due file WAV diversi.');return;}
    if(sourceA===sourceB){setError('Le sorgenti A e B devono essere diverse.');return;}
    if(!rights){setError('Conferma di avere il diritto di utilizzare entrambi i brani.');return;}
    if(!prompt.trim()){setError('Inserisci le indicazioni musicali per il nuovo brano.');return;}
    setSubmitting(true);setError('');setInfo('Caricamento privato del brano A…');
    try{
      const a=await upload(sourceA);
      setInfo('Caricamento privato del brano B…');
      const b=await upload(sourceB);
      setInfo('Avvio del job autenticato…');
      const response=await fetch('/api/billing/generate',{
        method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          sonaraRemixPro:true,
          sonaraRemixProRightsConfirmed:true,
          sonaraRemixProSourceA:a,
          sonaraRemixProSourceB:b,
          sonaraRemixProBassFrom:bassFrom,
          ...(bpmA?{sonaraRemixProBpmA:Number(bpmA)}:{}),
          ...(bpmB?{sonaraRemixProBpmB:Number(bpmB)}:{}),
          durationSec:duration,
          prompt:prompt.trim().slice(0,6500),
          candidateCount:1,
          audio_cover_strength:0.76,
          cover_noise_strength:0.14
        })
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok) {
        const recoverId=String(payload?.jobId||'');
        if(payload?.recoveryPending===true && isJob(recoverId)) {
          // Do not blindly resubmit an ambiguously queued job: the quota is
          // still reserved until the server reconciles its actual R2 state.
          activeJob.current=recoverId;
          try{sessionStorage.setItem(KEY,recoverId);}catch{}
          setJob({jobId:recoverId,status:'PROCESSING',stage:'reconciling',progress:0});
          setInfo('Accodamento non confermato. ID '+recoverId+' conservato; verifica del job e delle quote in corso.');
          return;
        }
        throw new Error(safeError(payload?.error?.message||payload.error,'Job Remix Pro non autorizzato.'));
      }
      if(!isJob(String(payload.jobId||''))) {
        throw new Error('Risposta job non valida: controlla lo stato prima di riprovare.');
      }
      const id=String(payload.jobId);
      activeJob.current=id;
      try{sessionStorage.setItem(KEY,id);}catch{}
      setJob({jobId:id,status:'PROCESSING',stage:'queued',progress:0});
      setInfo('Job '+id.slice(0,17)+' avviato senza duplicazioni.');
    }catch(e){setError(e instanceof Error?e.message:'Avvio Remix Pro non riuscito.');}
    finally{setSubmitting(false);}
  };

  const output=job?.status==='COMPLETED'&&job.audioUrl?job.audioUrl:null;
  const select=()=>{
    if(!output||!job?.jobId)return;
    const data={variationId:'Remix Pro',jobId:job.jobId,audioUrl:output,audioFormat:'wav',title:'SONARA Remix Pro'};
    window.dispatchEvent(new CustomEvent('sonara:generated-track-selected',{detail:data}));
    setInfo('Remix Pro selezionato nel player SONARA.');
  };

  return (
    <div className="sonara-remix-pro" style={{padding:14,border:'1px solid #453257',borderRadius:12,background:'#121019',color:'#ddd9e8',display:'grid',gap:12}}>
      <div style={{display:'flex',gap:8,alignItems:'center',justifyContent:'space-between'}}>
        <strong style={{display:'flex',alignItems:'center',gap:6}}><AudioWaveform size={16}/> SONARA REMIX PRO</strong>
        <span style={{fontSize:10,color:available?'#97e5b8':'#d5b6ef'}}>{available?'GPU ONLINE':available===null?'CONNESSIONE…':'NON ANCORA ATTIVO'}</span>
      </div>
      <small>Remix di due brani: voce e armonie A + batteria B, strumenti separati con Demucs e nuovo render ACE-Step. Audio privati e accessibili solo al proprietario.</small>
      <label>Brano A (voce e armonie)
        <input type="file" accept=".wav,audio/wav" onChange={e=>setSourceA(e.currentTarget.files?.[0]||null)} />
      </label>
      <label>Brano B (batteria e groove)
        <input type="file" accept=".wav,audio/wav" onChange={e=>setSourceB(e.currentTarget.files?.[0]||null)} />
      </label>
      <label>Direzione musicale<textarea rows={3} value={prompt} onChange={e=>setPrompt(e.target.value)} style={{width:'100%',marginTop:6,padding:8,borderRadius:6,background:'#1c1926',color:'#fff'}} /></label>
      <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8}}>
        <label>Durata (10–120 s)<input type="number" min={10} max={120} value={duration} onChange={e=>setDuration(Math.max(10,Math.min(120,Number(e.target.value)||60)))} /></label>
        <label>Basso<select value={bassFrom} onChange={e=>setBassFrom(e.target.value==='b'?'b':'a')}><option value="a">Dal brano A</option><option value="b">Dal brano B</option></select></label>
        <label>BPM A (facoltativo)<input type="number" min={55} max={200} placeholder="Analisi automatica" value={bpmA} onChange={e=>setBpmA(e.target.value)} /></label>
        <label>BPM B (facoltativo)<input type="number" min={55} max={200} placeholder="Analisi automatica" value={bpmB} onChange={e=>setBpmB(e.target.value)} /></label>
      </div>
      <label style={{display:'flex',alignItems:'flex-start',gap:8}}>
        <input type="checkbox" checked={rights} onChange={e=>setRights(e.target.checked)} />
        <span>Confermo di possedere o avere i diritti di utilizzo di entrambi i brani.</span>
      </label>
      <button type="button" disabled={!available||submitting||job?.status==='PROCESSING'||!rights}
        onClick={()=>void begin()} style={{padding:11,borderRadius:9,background:'#6c3b9d',color:'white',fontWeight:800}}>
        {submitting?<LoaderCircle size={15}/>:<ShieldCheck size={15}/>} Crea Remix Pro reale
      </button>
      {info&&<small role="status">{info}</small>}
      {error&&<small role="alert" style={{color:'#ffb3b9'}}>{error}</small>}
      {job&&<div style={{display:'grid',gap:8}}>
        <strong>Job {job.jobId?.slice(0,18)} · {job.status||'PROCESSING'}</strong>
        <progress value={Math.max(0,Math.min(100,job.progress||0))} max={100} style={{width:'100%'}} />
        {job.status==='FAILED'&&<small role="alert">{job.error||'Job non riuscito.'}</small>}
        {output&&<>
          <audio src={output} controls preload="metadata" style={{width:'100%'}} />
          <div style={{display:'flex',gap:8}}>
            <button type="button" onClick={select}><Check size={14}/> Usa nel player</button>
            <a href={output} download="SONARA-REMIX-PRO.wav"><Download size={14}/> Scarica WAV</a>
          </div>
          <strong>Stem reali separati</strong>
          {(job.stems||[]).map(stem=><label key={stem.role} style={{display:'grid',gap:4}}>
            <span>{stem.role}</span><audio controls src={stem.url} preload="none" style={{width:'100%'}}/>
          </label>)}
        </>}
      </div>}
      {available!==true&&<small>Remix tradizionale disponibile. Remix Pro sarà abilitato solo dopo autenticazione e verifica del servizio GPU dedicato.</small>}
    </div>
  );
}
