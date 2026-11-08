import { useEffect, useRef, useState } from 'react';
import { AudioWaveform, Check, Download, LoaderCircle, ShieldCheck, UploadCloud } from 'lucide-react';

type ProJob = {jobId?: string;status?: string;stage?: string;progress?: number;audioUrl?: string;
  stems?: {role:string;url:string}[];error?: string;};
const isJob = (id:string) => /^srpro_[0-9a-f-]{36}$/.test(id);
const sleep=(ms:number)=>new Promise(resolve=>window.setTimeout(resolve,ms));
const safeError=(value:unknown,fallback:string)=>typeof value==='string'&&value.length<250?value:fallback;
const KEY='sonara.remixPro.activeJob.v1';
const AUDIO_FORMATS=/\.(wav|mp3|flac|m4a|mp4|aac|ogg|oga|opus|aif|aiff|aifc|webm|wma|caf|amr|ac3)$/i;
const AUDIO_PICKER_ACCEPT='audio/*,.wav,.mp3,.flac,.m4a,.mp4,.aac,.ogg,.oga,.opus,.aif,.aiff,.aifc,.webm,.wma,.caf,.amr,.ac3';
const audioSuffix=(name:string)=>name.match(AUDIO_FORMATS)?.[1]?.toLowerCase()||'';

export default function SonaraRemixProPanel() {
  const [available,setAvailable]=useState<boolean|null>(null);
  const [multiformatAvailable,setMultiformatAvailable]=useState(false);
  const [sourceA,setSourceA]=useState<File|null>(null);
  const [sourceB,setSourceB]=useState<File|null>(null);
  const [prompt,setPrompt]=useState('Create one cohesive professional new remix preserving the principal melody and A harmonies, with the rhythmic groove and drum articulation of B.');
  const [duration,setDuration]=useState(120);
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
  const sourceAInput=useRef<HTMLInputElement>(null);
  const sourceBInput=useRef<HTMLInputElement>(null);
  const chooseSource=(file:File|null,role:'a'|'b')=>{
    if(!file)return;
    if(!AUDIO_FORMATS.test(file.name)||file.size<44||file.size>512*1024*1024){
      setError('Il brano '+role.toUpperCase()+' deve essere un formato audio supportato, massimo 512 MiB.');
      return;
    }
    if(role==='a')setSourceA(file);
    else setSourceB(file);
    setError('');
    setInfo('Brano '+role.toUpperCase()+' selezionato: '+file.name);
  };

  useEffect(()=>{
    mounted.current=true;
    const previous=(()=>{try{return sessionStorage.getItem(KEY)||'';}catch{return '';}})();
    if(isJob(previous)){activeJob.current=previous;setJob({jobId:previous,status:'PROCESSING',progress:0});}
    fetch('/api/sonara-relay/pro-capabilities',{cache:'no-store',credentials:'include'})
      .then(r=>r.ok?r.json():{available:false})
      .then(x=>{if(mounted.current){setAvailable(x.available===true);setMultiformatAvailable(x.multiformatAvailable===true);}})
      .catch(()=>{if(mounted.current)setAvailable(false);});
    return()=>{mounted.current=false;};
  },[]);

  useEffect(()=>{
    const id=job?.jobId;
    if(!id||!isJob(id)||job?.status==='COMPLETED'||job?.status==='FAILED')return;
    let cancelled=false;
    void (async()=>{
      let errors=0;
      for(let i=0;i<1800&&!cancelled;i++){
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
          await sleep(5000);
        }catch{
          errors++;
          if(errors>10){if(mounted.current)setError('Monitoraggio interrotto. Il job '+id+' è conservato: riapri Remix Pro per riprenderlo.');return;}
          await sleep(Math.min(errors*2000,12000));
        }
      }
    })();
    return()=>{cancelled=true;};
  },[job?.jobId,job?.status]);

  const upload=async(file:File,sourceLabel:string)=>{
    const maxSourceBytes=512*1024*1024;
    if(file.size<44||file.size>maxSourceBytes||!AUDIO_FORMATS.test(file.name)){
      throw new Error('Carica un file audio supportato fino a 512 MiB (anche oltre 8 minuti).');
    }
    const suffix=audioSuffix(file.name);
    if(suffix!=='wav'&&!multiformatAvailable)
      throw new Error('Audio multiformato in aggiornamento su MoLab. Al momento usa WAV.');
    const buffer=await file.slice(0,12).arrayBuffer();
    const bytes=new Uint8Array(buffer);
    if(suffix==='wav'&&(String.fromCharCode(...bytes.slice(0,4))!=='RIFF'||String.fromCharCode(...bytes.slice(8,12))!=='WAVE')){
      throw new Error('Il file non è un WAV autentico.');
    }
    if(suffix==='wav'&&file.size<=80*1024*1024) {
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
    }
    const start=await fetch('/api/sonara-relay/reference-multipart/start',{
      method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:file.name,bytes:file.size})
    });
    const session=await start.json().catch(()=>({}));
    if(!start.ok||!/^sref_[0-9a-f-]{36}$/.test(String(session.referenceId||'')))
      throw new Error(safeError(session.error,'Avvio upload audio privato non riuscito.'));
    const ref=String(session.referenceId),chunk=Number(session.partBytes);
    const total=Number(session.parts);
    if(chunk!==8*1024*1024||!Number.isInteger(total)||total<1||total>64)
      throw new Error('Configurazione upload a blocchi non valida.');
    const parts:{partNumber:number;etag:string}[]=[];
    for(let n=1;n<=total;n++){
      setInfo('Caricamento brano '+sourceLabel+': blocco '+n+'/'+total+'...');
      const piece=file.slice((n-1)*chunk,Math.min(n*chunk,file.size));
      let uploaded=false;
      for(let attempt=0;attempt<3&&!uploaded;attempt++){
        try{
          const response=await fetch('/api/sonara-relay/reference-multipart/part/'+ref+'/'+n,{
            method:'PUT',credentials:'include',
            headers:{'Content-Type':'application/octet-stream'},
            body:piece
          });
          const answer=await response.json().catch(()=>({}));
          if(!response.ok||typeof answer.etag!=='string')
            throw new Error(safeError(answer.error,'Blocco non caricato.'));
          parts.push({partNumber:n,etag:answer.etag});uploaded=true;
        }catch(e){
          if(attempt===2)throw e;
          await sleep((attempt+1)*1000);
        }
      }
    }
    const finish=await fetch('/api/sonara-relay/reference-multipart/finish/'+ref,{
      method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({parts})
    });
    const result=await finish.json().catch(()=>({}));
    if(!finish.ok||result.referenceId!==ref)
      throw new Error(safeError(result.error,'Finalizzazione upload WAV fallita.'));
    return ref;
  };

  const begin=async()=>{
    if(submitting||activeJob.current&&job?.status!=='FAILED'&&job?.status!=='COMPLETED')return;
    if(available!==true){setError('Remix Pro GPU non ancora collegato. Usa il Remix normale.');return;}
    if(!sourceA||!sourceB){setError('Seleziona due file audio diversi.');return;}
    if(sourceA===sourceB){setError('Le sorgenti A e B devono essere diverse.');return;}
    if(!rights){setError('Conferma di avere il diritto di utilizzare entrambi i brani.');return;}
    if(!prompt.trim()){setError('Inserisci le indicazioni musicali per il nuovo brano.');return;}
    setSubmitting(true);setError('');setInfo('Caricamento privato del brano A…');
    try{
      const a=await upload(sourceA,'A');
      setInfo('Caricamento privato del brano B…');
      const b=await upload(sourceB,'B');
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
          // Do not blindly resubmit an ambiguously queued job; the private
          // job record remains pending until its R2 state is reconciled.
          activeJob.current=recoverId;
          try{sessionStorage.setItem(KEY,recoverId);}catch{}
          setJob({jobId:recoverId,status:'PROCESSING',stage:'reconciling',progress:0});
          setInfo('Accodamento non confermato. ID '+recoverId+' conservato; verifica dello stato del job in corso.');
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
      <small>Remix di due brani: voce e armonie A + batteria B, strumenti separati con Demucs e nuovo render ACE-Step. Audio privati e accessibili solo al proprietario. Carica WAV, MP3, FLAC, M4A, AAC, OGG, OPUS, AIFF, WebM e altri formati elencati (max 15 minuti e 512 MiB per file); Remix AI da 0:30 a 8:00.</small>
      <div data-testid="sonara-remix-pro-uploaders" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,225px),1fr))',gap:12}}>
        <div data-sonara-pro-source="a" onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';}}
          onDrop={e=>{e.preventDefault();chooseSource(e.dataTransfer.files?.[0]||null,'a');}}
          style={{display:'grid',gap:10,minWidth:0,padding:16,border:'1px dashed #9869dc',borderRadius:12,background:'#20172c'}}>
          <strong>BRANO A — Voce e armonie</strong>
          <small>Trascina qui il primo file audio oppure selezionalo dal dispositivo.</small>
          <input id="sonara-remix-pro-file-a" ref={sourceAInput} type="file" accept={AUDIO_PICKER_ACCEPT}
            aria-label="Seleziona file audio brano A" data-testid="sonara-remix-pro-input-a"
            onChange={e=>chooseSource(e.currentTarget.files?.[0]||null,'a')}
            style={{position:'absolute',width:1,height:1,opacity:0,overflow:'hidden',pointerEvents:'none'}} />
          <button type="button" data-testid="sonara-remix-pro-choose-a"
            onClick={()=>sourceAInput.current?.click()}
            style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,minHeight:44,padding:'10px 14px',border:'1px solid #ab87ef',borderRadius:9,background:'#6c3b9d',color:'#fff',fontWeight:800,cursor:'pointer'}}>
            <UploadCloud size={18}/>{sourceA?'Cambia brano A':'Carica brano A'}
          </button>
          <small aria-live="polite" style={{overflowWrap:'anywhere',color:sourceA?'#9ce6bb':'#c8bed7'}}>
            {sourceA?sourceA.name+' · '+(sourceA.size/1024/1024).toFixed(1)+' MiB':'Nessun file A selezionato'}
          </small>
        </div>
        <div data-sonara-pro-source="b" onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';}}
          onDrop={e=>{e.preventDefault();chooseSource(e.dataTransfer.files?.[0]||null,'b');}}
          style={{display:'grid',gap:10,minWidth:0,padding:16,border:'1px dashed #9869dc',borderRadius:12,background:'#20172c'}}>
          <strong>BRANO B — Batteria e groove</strong>
          <small>Trascina qui il secondo file audio oppure selezionalo dal dispositivo.</small>
          <input id="sonara-remix-pro-file-b" ref={sourceBInput} type="file" accept={AUDIO_PICKER_ACCEPT}
            aria-label="Seleziona file audio brano B" data-testid="sonara-remix-pro-input-b"
            onChange={e=>chooseSource(e.currentTarget.files?.[0]||null,'b')}
            style={{position:'absolute',width:1,height:1,opacity:0,overflow:'hidden',pointerEvents:'none'}} />
          <button type="button" data-testid="sonara-remix-pro-choose-b"
            onClick={()=>sourceBInput.current?.click()}
            style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,minHeight:44,padding:'10px 14px',border:'1px solid #ab87ef',borderRadius:9,background:'#6c3b9d',color:'#fff',fontWeight:800,cursor:'pointer'}}>
            <UploadCloud size={18}/>{sourceB?'Cambia brano B':'Carica brano B'}
          </button>
          <small aria-live="polite" style={{overflowWrap:'anywhere',color:sourceB?'#9ce6bb':'#c8bed7'}}>
            {sourceB?sourceB.name+' · '+(sourceB.size/1024/1024).toFixed(1)+' MiB':'Nessun file B selezionato'}
          </small>
        </div>
      </div>
      <small>Formati: WAV, MP3, FLAC, M4A/MP4 audio, AAC, OGG/OPUS, AIFF, WebM audio, WMA, CAF, AMR, AC3. Massimo 15 minuti e 512 MiB per file. La GPU verifica il codec e converte l'audio in WAV di lavoro privato, senza cambiare il file originale.</small>
      {!multiformatAvailable&&<small role="status">Decodifica multiformato non ancora pronta sull'agente MoLab. I WAV continuano a funzionare.</small>}
      <label>Direzione musicale<textarea rows={3} value={prompt} onChange={e=>setPrompt(e.target.value)} style={{width:'100%',marginTop:6,padding:8,borderRadius:6,background:'#1c1926',color:'#fff'}} /></label>
      <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8}}>
        <label>Durata Remix AI (30 secondi – 8 minuti)
          <input type="range" min={30} max={480} step={30} value={duration}
            onChange={e=>setDuration(Number(e.target.value))} style={{width:'100%'}}/>
          <strong>{Math.floor(duration/60)}:{String(duration%60).padStart(2,'0')} minuti</strong>
          <select value={duration} onChange={e=>setDuration(Number(e.target.value))}>
            {Array.from({length:16},(_,i)=>(i+1)*30).map(sec=>
              <option key={sec} value={sec}>{Math.floor(sec/60)}:{String(sec%60).padStart(2,'0')}</option>
            )}
          </select>
        </label>
        <label>Basso<select value={bassFrom} onChange={e=>setBassFrom(e.target.value==='b'?'b':'a')}><option value="a">Dal brano A</option><option value="b">Dal brano B</option></select></label>
        <label>BPM A (facoltativo)<input type="number" min={55} max={200} placeholder="Analisi automatica" value={bpmA} onChange={e=>setBpmA(e.target.value)} /></label>
        <label>BPM B (facoltativo)<input type="number" min={55} max={200} placeholder="Analisi automatica" value={bpmB} onChange={e=>setBpmB(e.target.value)} /></label>
      </div>
      <label style={{display:'flex',alignItems:'flex-start',gap:8}}>
        <input type="checkbox" checked={rights} onChange={e=>setRights(e.target.checked)} />
        <span>Confermo di possedere o avere i diritti di utilizzo di entrambi i brani.</span>
      </label>
      <small role="status">Remix Pro illimitato: i nuovi remix non consumano minuti dal piano Studio. Il singolo remix puo durare fino a 8 minuti. Rimangono necessari un account Studio attivo e la disponibilita della GPU.</small>
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
