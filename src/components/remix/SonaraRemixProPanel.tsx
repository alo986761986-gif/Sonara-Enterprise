import { useEffect, useRef, useState } from 'react';
import { AudioWaveform, ArrowRight, ArrowUpRight, Check, ChevronDown, Clock3, Download, Layers2, LoaderCircle, LockKeyhole, ShieldCheck, SlidersHorizontal, Sparkles, UploadCloud } from 'lucide-react';
import './sonaraRemixProV3.css';
import { chooseRandomRemixDuration, isValidRemixDuration, buildRemixProGenerationRequest } from './remixDuration';

type ProJob = {jobId?: string;status?: string;stage?: string;progress?: number;audioUrl?: string;
  stems?: {role:string;url:string}[];error?: string;
  requestedDurationSeconds?:number;actualDurationSeconds?:number;};
const isJob = (id:string) => /^srpro_[0-9a-f-]{36}$/.test(id);
const sleep=(ms:number)=>new Promise(resolve=>window.setTimeout(resolve,ms));
const durationLabel=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.round(seconds%60)).padStart(2,'0')}`;
const safeError=(value:unknown,fallback:string)=>typeof value==='string'&&value.length<250?value:fallback;
const KEY='sonara.remixPro.activeJob.v1';
const validDuration=(n:number)=>Number.isInteger(n)&&n>=30&&n<=480&&n%30===0;
const AUDIO_FORMATS=/\.(wav|mp3|flac|m4a|mp4|aac|ogg|oga|opus|aif|aiff|aifc|webm|wma|caf|amr|ac3)$/i;
const AUDIO_PICKER_ACCEPT='audio/*,.wav,.mp3,.flac,.m4a,.mp4,.aac,.ogg,.oga,.opus,.aif,.aiff,.aifc,.webm,.wma,.caf,.amr,.ac3';
const audioSuffix=(name:string)=>name.match(AUDIO_FORMATS)?.[1]?.toLowerCase()||'';

export default function SonaraRemixProPanel() {
  const [available,setAvailable]=useState<boolean|null>(null);
  const [multiformatAvailable,setMultiformatAvailable]=useState(false);
  const [sourceA,setSourceA]=useState<File|null>(null);
  const [sourceB,setSourceB]=useState<File|null>(null);
  const [prompt,setPrompt]=useState('Create one cohesive professional new remix preserving the principal melody and A harmonies, with the rhythmic groove and drum articulation of B.');
  const [bassFrom,setBassFrom]=useState<'a'|'b'>('a');
  const [bpmA,setBpmA]=useState('');
  const [bpmB,setBpmB]=useState('');
  const [rights,setRights]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  const [job,setJob]=useState<ProJob|null>(null);
  const [submittedDuration,setSubmittedDuration]=useState<number|null>(null);
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
    if(isJob(previous)){activeJob.current=previous;setJob({jobId:previous,status:'PROCESSING',progress:0});
      setInfo('Recupero un job precedente. La durata assegnata a quel job resta invariata.');}
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
          if(response.status===404||response.status===410){
            // Only clear a job whose private status is confirmed absent.
            // Never silently restart a previously submitted GPU task.
            try{sessionStorage.removeItem(KEY);}catch{}
            activeJob.current='';
            setJob(null);
            setError('Il job precedente non risulta piu disponibile. Puoi avviare un nuovo remix A+B.');
            return;
          }
          if(response.status===401||response.status===403){
            setError('Sessione SONARA non autorizzata. Accedi nuovamente prima di avviare il remix.');
            return;
          }
          if(!response.ok)throw new Error(safeError(data.error,'Monitoraggio temporaneamente non disponibile'));
          if(cancelled||!mounted.current)return;
          errors=0;
          setJob(data);
          if (submittedDuration!==null && data.requestedDurationSeconds!==undefined &&
              Number(data.requestedDurationSeconds)!==submittedDuration) {
            setError('ERRORE DURATA: il server ha registrato '+durationLabel(Number(data.requestedDurationSeconds))+
              ' invece di '+durationLabel(submittedDuration)+'. Il job non corrisponde alla richiesta; non inviarne un altro prima che termini.');
          }
          if(data.status==='COMPLETED'||data.status==='FAILED'){
            try{sessionStorage.removeItem(KEY);}catch{}
            return;
          }
          setInfo('Fase: '+String(data.stage||'elaborazione')+' — '+Math.round(Number(data.progress||0))+'%');
          await sleep(5000);
        }catch{
          errors++;
          if(errors>10){if(mounted.current)setError('Connessione al job interrotta. Il job '+id+' resta salvato: riapri Remix Pro per controllarlo. Non inviare un nuovo job finche lo stato non e verificato.');return;}
          await sleep(Math.min(errors*2000,12000));
        }
      }
    })();
    return()=>{cancelled=true;};
  },[job?.jobId,job?.status,submittedDuration]);

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
    // Freeze one random duration before either upload. Never reroll after retries,
    // during asynchronous uploads, or while a job is in progress.
    const requestedDuration=chooseRandomRemixDuration();
    if(!isValidRemixDuration(requestedDuration)){setError('Durata automatica non valida. Il job non è stato creato.');return;}
    setSubmittedDuration(requestedDuration);
    setSubmitting(true);setError('');setInfo('Durata scelta automaticamente: '+durationLabel(requestedDuration)+'. Caricamento privato del brano A…');
    try{
      const a=await upload(sourceA,'A');
      setInfo('Caricamento privato del brano B…');
      const b=await upload(sourceB,'B');
      setInfo('Avvio del job autenticato…');
      // Pass a complete Request instead of fetch(url, {body:string}).
      // The legacy Cloudflare duration shim rewrites init.body.durationSec
      // for hidden old sliders, but never updates the expected duration/header.
      // fetch(Request) preserves the single authenticated V3 contract.
      const response=await fetch(buildRemixProGenerationRequest(window.location.origin,{
        sonaraRemixPro:true,
        sonaraRemixProRightsConfirmed:true,
        sonaraRemixProSourceA:a,
        sonaraRemixProSourceB:b,
        sonaraRemixProBassFrom:bassFrom,
        ...(bpmA?{sonaraRemixProBpmA:Number(bpmA)}:{}),
        ...(bpmB?{sonaraRemixProBpmB:Number(bpmB)}:{}),
        prompt:prompt.trim().slice(0,6500),
        candidateCount:1,
        audio_cover_strength:0.76,
        cover_noise_strength:0.14
      },requestedDuration));
      const payload=await response.json().catch(()=>({}));
      if(!response.ok) {
        const recoverId=String(payload?.jobId||'');
        if(payload?.recoveryPending===true && isJob(recoverId)) {
          // Do not blindly resubmit an ambiguously queued job; the private
          // job record remains pending until its R2 state is reconciled.
          activeJob.current=recoverId;
          try{sessionStorage.setItem(KEY,recoverId);}catch{}
          setJob({jobId:recoverId,status:'PROCESSING',stage:'reconciling',progress:0,requestedDurationSeconds:requestedDuration});
          setInfo('Accodamento non confermato. ID '+recoverId+' conservato; verifica dello stato del job in corso.');
          return;
        }
        throw new Error(safeError(payload?.error?.message||payload.error,'Job Remix Pro non autorizzato.'));
      }
      if(!isJob(String(payload.jobId||''))) {
        throw new Error('Risposta job non valida: controlla lo stato prima di riprovare.');
      }
      const id=String(payload.jobId);
      const queuedDuration=Number(payload.requestedDurationSeconds);
      if(!validDuration(queuedDuration)||queuedDuration!==requestedDuration){
        // This job may already exist in the private queue: retain its ID and
        // NEVER duplicate the request or pretend that 0:30 equals 8:00.
        activeJob.current=id;
        try{sessionStorage.setItem(KEY,id);}catch{}
        setJob({jobId:id,status:'PROCESSING',stage:'queued',progress:0,
          requestedDurationSeconds:validDuration(queuedDuration)?queuedDuration:undefined});
        setError('Durata rifiutata: richiesta '+durationLabel(requestedDuration)+
          ', conferma server '+(validDuration(queuedDuration)?durationLabel(queuedDuration):'mancante')+
          '. Job '+id+' conservato per controllo. Non inviare duplicati.');
        return;
      }
      activeJob.current=id;
      try{sessionStorage.setItem(KEY,id);}catch{}
      setJob({jobId:id,status:'PROCESSING',stage:'queued',progress:0,
        requestedDurationSeconds:requestedDuration});
      setInfo('Job '+id.slice(0,17)+' confermato dal server con durata '+durationLabel(requestedDuration)+'.');
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

  const busy=submitting||(job?.status==='PROCESSING');
  const ready=available===true&&Boolean(sourceA)&&Boolean(sourceB)&&sourceA!==sourceB&&
    rights&&Boolean(prompt.trim())&&!busy;
  const nowDuration=Number(job?.requestedDurationSeconds)>0
    ?Number(job?.requestedDurationSeconds):submittedDuration;
  const suggestion=(kind:'balanced'|'groove'|'melody')=>{
    const values={
      balanced:'Create one cohesive professional remix combining the melody and harmony of track A with the natural groove, percussion and energy of track B. Evolve the arrangement organically.',
      groove:'Make one dancefloor-ready remix: preserve the recognizable melody from A, weave in the drums and groove of B, and introduce natural transitions and dynamic musical development.',
      melody:'Create a single expressive, polished track built around the lead melody and emotional phrasing of A, supported by the rhythm and percussion of B with clear natural instruments.'
    };
    setPrompt(values[kind]);
  };

  return (
    <div className="sonara-pro-v3" data-testid="sonara-remix-pro-v3">
      <div className="sonara-pro-v3__hero">
        <div className="sonara-pro-v3__hero-top">
          <span className="sonara-pro-v3__overline"><span className="sonara-pro-v3__spark"/> SONARA / CREATIVE ENGINE</span>
          <span className={'sonara-pro-v3__connection '+(available===true?'is-online':available===false?'is-offline':'')}>
            <span className="sonara-pro-v3__connection-dot"/>
            {available===true?'ENGINE ONLINE':available===null?'VERIFICA MOTORE':'MOTORE NON DISPONIBILE'}
          </span>
        </div>
        <h2>Due brani. <span>Una nuova identità.</span></h2>
        <p>Unisci la melodia di A e il ritmo di B in un unico remix originale. Tu scegli il carattere musicale, SONARA si occupa della durata.</p>
        <div className="sonara-pro-v3__hero-foot">
          <span><Layers2 size={14}/> FUSIONE A + B</span>
          <span><AudioWaveform size={14}/> ACE-STEP XL TURBO</span>
          <span><ShieldCheck size={14}/> AUDIO PRIVATO</span>
        </div>
      </div>

      <section className="sonara-pro-v3__section" aria-label="Sorgenti del remix">
        <div className="sonara-pro-v3__section-heading">
          <div><span className="sonara-pro-v3__step">01</span><div>
            <h3>Le tue sorgenti</h3>
            <p>Carica due brani diversi per costruire un unico risultato.</p>
          </div></div>
          <span className="sonara-pro-v3__section-tag">2 INPUT AUDIO</span>
        </div>
        <div className="sonara-pro-v3__source-grid" data-testid="sonara-remix-pro-uploaders">
          <div className={'sonara-pro-v3__source-card is-a '+(sourceA?'has-file':'')}
            data-sonara-pro-source="a"
            onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';}}
            onDrop={e=>{e.preventDefault();chooseSource(e.dataTransfer.files?.[0]||null,'a');}}>
            <div className="sonara-pro-v3__source-head">
              <span className="sonara-pro-v3__source-index">A</span>
              <span className="sonara-pro-v3__source-state">{sourceA?<><Check size={13}/> PRONTO</>:'PRIMA SORGENTE'}</span>
            </div>
            <div className="sonara-pro-v3__sound-mark" aria-hidden="true">
              {[22,38,27,53,34,66,41,77,46,62,31,49,24,39,21].map((h,i)=><i key={i} style={{height:h+'%'}} />)}
            </div>
            <div className="sonara-pro-v3__source-content">
              <h4>Melodia e armonie</h4>
              <p>La voce, il tema e il carattere musicale del brano A.</p>
            </div>
            <input id="sonara-remix-pro-file-a" ref={sourceAInput} type="file" accept={AUDIO_PICKER_ACCEPT}
              aria-label="Seleziona file audio brano A" data-testid="sonara-remix-pro-input-a"
              onChange={e=>chooseSource(e.currentTarget.files?.[0]||null,'a')}
              className="sonara-pro-v3__file-input"/>
            <button type="button" data-testid="sonara-remix-pro-choose-a"
              className="sonara-pro-v3__upload-button" onClick={()=>sourceAInput.current?.click()}>
              {sourceA?<Check size={16}/>:<UploadCloud size={16}/>}
              {sourceA?'Sostituisci brano A':'Carica brano A'}
              <ArrowUpRight size={15}/>
            </button>
            <span className="sonara-pro-v3__file-name" aria-live="polite">
              {sourceA?sourceA.name+' · '+(sourceA.size/1048576).toFixed(1)+' MB':'Trascina un file audio qui oppure scegli un file'}
            </span>
          </div>

          <div className={'sonara-pro-v3__source-card is-b '+(sourceB?'has-file':'')}
            data-sonara-pro-source="b"
            onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';}}
            onDrop={e=>{e.preventDefault();chooseSource(e.dataTransfer.files?.[0]||null,'b');}}>
            <div className="sonara-pro-v3__source-head">
              <span className="sonara-pro-v3__source-index">B</span>
              <span className="sonara-pro-v3__source-state">{sourceB?<><Check size={13}/> PRONTO</>:'SECONDA SORGENTE'}</span>
            </div>
            <div className="sonara-pro-v3__sound-mark" aria-hidden="true">
              {[32,55,38,25,69,46,29,76,42,68,37,57,28,48,34].map((h,i)=><i key={i} style={{height:h+'%'}} />)}
            </div>
            <div className="sonara-pro-v3__source-content">
              <h4>Groove e ritmo</h4>
              <p>La batteria, il movimento e l'energia del brano B.</p>
            </div>
            <input id="sonara-remix-pro-file-b" ref={sourceBInput} type="file" accept={AUDIO_PICKER_ACCEPT}
              aria-label="Seleziona file audio brano B" data-testid="sonara-remix-pro-input-b"
              onChange={e=>chooseSource(e.currentTarget.files?.[0]||null,'b')}
              className="sonara-pro-v3__file-input"/>
            <button type="button" data-testid="sonara-remix-pro-choose-b"
              className="sonara-pro-v3__upload-button" onClick={()=>sourceBInput.current?.click()}>
              {sourceB?<Check size={16}/>:<UploadCloud size={16}/>}
              {sourceB?'Sostituisci brano B':'Carica brano B'}
              <ArrowUpRight size={15}/>
            </button>
            <span className="sonara-pro-v3__file-name" aria-live="polite">
              {sourceB?sourceB.name+' · '+(sourceB.size/1048576).toFixed(1)+' MB':'Trascina un file audio qui oppure scegli un file'}
            </span>
          </div>
        </div>
        <div className="sonara-pro-v3__fusion-strip">
          <span>TRACK A</span><span className="sonara-pro-v3__fusion-line"/>
          <span className="sonara-pro-v3__fusion-core"><Sparkles size={15}/> SONARA FUSION</span>
          <span className="sonara-pro-v3__fusion-line"/><span>TRACK B</span>
          <strong><ArrowRight size={16}/> ONE NEW TRACK</strong>
        </div>
      </section>

      <section className="sonara-pro-v3__section" aria-label="Direzione musicale del remix">
        <div className="sonara-pro-v3__section-heading">
          <div><span className="sonara-pro-v3__step">02</span><div>
            <h3>Direzione musicale</h3>
            <p>Guida lo stile del nuovo brano senza complicazioni.</p>
          </div></div>
        </div>
        <div className="sonara-pro-v3__controls-layout">
          <div className="sonara-pro-v3__creative-panel">
            <label htmlFor="sonara-pro-v3-prompt">COME DEVE SUONARE IL REMIX?</label>
            <textarea id="sonara-pro-v3-prompt" rows={5} value={prompt}
              placeholder="Descrivi l'atmosfera, il sound, gli strumenti e la trasformazione musicale…"
              onChange={e=>setPrompt(e.target.value)}/>
            <div className="sonara-pro-v3__prompt-footer">
              <span>ISPIRAZIONI RAPIDE</span>
              <div>
                <button type="button" onClick={()=>suggestion('balanced')}>Bilanciato</button>
                <button type="button" onClick={()=>suggestion('groove')}>Club &amp; groove</button>
                <button type="button" onClick={()=>suggestion('melody')}>Melodico</button>
              </div>
            </div>
          </div>
          <aside className="sonara-pro-v3__settings-panel">
            <div className="sonara-pro-v3__auto-duration" data-testid="sonara-remix-pro-auto-duration">
              <span className="sonara-pro-v3__setting-icon"><Clock3 size={20}/></span>
              <div>
                <small>DURATA DEL NUOVO BRANO</small>
                <strong>Automatica <span>2–5 min</span></strong>
                <p>{nowDuration?'Durata assegnata: '+durationLabel(nowDuration):'SONARA sceglie la durata al momento della creazione.'}</p>
              </div>
            </div>
            <label className="sonara-pro-v3__select-label" htmlFor="sonara-pro-v3-bass">
              SORGENTE BASSO
              <select id="sonara-pro-v3-bass" value={bassFrom} onChange={e=>setBassFrom(e.target.value==='b'?'b':'a')}>
                <option value="a">Dal brano A</option>
                <option value="b">Dal brano B</option>
              </select>
            </label>
            <details className="sonara-pro-v3__advanced">
              <summary><SlidersHorizontal size={15}/> Parametri avanzati <ChevronDown size={14}/></summary>
              <div className="sonara-pro-v3__bpm-grid">
                <label>BPM A <input type="number" min={55} max={200} placeholder="Auto" value={bpmA} onChange={e=>setBpmA(e.target.value)} /></label>
                <label>BPM B <input type="number" min={55} max={200} placeholder="Auto" value={bpmB} onChange={e=>setBpmB(e.target.value)} /></label>
              </div>
            </details>
          </aside>
        </div>
      </section>

      <section className="sonara-pro-v3__production" aria-label="Creazione del remix">
        <div className="sonara-pro-v3__production-copy">
          <span className="sonara-pro-v3__production-label"><LockKeyhole size={14}/> SESSIONE PRIVATA · R2</span>
          <h3>Pronto a creare qualcosa di nuovo?</h3>
          <p>Un solo master WAV, costruito dalle due sorgenti. Nessun nuovo job sarà avviato mentre quello precedente è ancora in elaborazione.</p>
          <label className="sonara-pro-v3__rights">
            <input type="checkbox" checked={rights} onChange={e=>setRights(e.target.checked)}/>
            <span>Confermo di avere i diritti per utilizzare entrambi i brani.</span>
          </label>
        </div>
        <div className="sonara-pro-v3__production-action">
          <button type="button" data-testid="sonara-pro-v3-generate" disabled={!ready}
            onClick={()=>void begin()} className="sonara-pro-v3__create-button">
            {submitting?<LoaderCircle className="sonara-pro-v3__spin" size={19}/>:<Sparkles size={19}/>}
            {submitting?'Preparazione in corso…':'Crea Remix Pro'}
            <ArrowRight size={19}/>
          </button>
          <span>{!available?'Motore in verifica':busy?'Un job è già in corso':!sourceA||!sourceB?'Carica A e B per iniziare':!rights?'Conferma i diritti di utilizzo':'Pronto per creare un unico brano A+B'}</span>
        </div>
      </section>

      {!multiformatAvailable&&available===true&&<p className="sonara-pro-v3__note" role="status">La decodifica multiformato non è ancora attiva sulla GPU; per ora carica due WAV.</p>}
      {(info||error)&&<div className={'sonara-pro-v3__message '+(error?'is-error':'')} role={error?'alert':'status'}>
        {error||info}
      </div>}

      {job&&<section className="sonara-pro-v3__job" aria-label="Stato del remix generato">
        <div className="sonara-pro-v3__job-head">
          <div><span>YOUR REMIX</span><h3>{job.status==='COMPLETED'?'Il tuo nuovo brano è pronto':job.status==='FAILED'?'Generazione non riuscita':'Stiamo creando il tuo remix'}</h3></div>
          <span className="sonara-pro-v3__job-badge">{job.status||'PROCESSING'}</span>
        </div>
        <div className="sonara-pro-v3__job-details">
          <span>JOB {job.jobId?.slice(0,20)}</span>
          <span data-testid="sonara-remix-pro-job-duration">DURATA: {Number(job.requestedDurationSeconds)>0?durationLabel(Number(job.requestedDurationSeconds)):'in verifica'}</span>
          {Number(job.actualDurationSeconds)>0&&<span>WAV: {durationLabel(Number(job.actualDurationSeconds))}</span>}
        </div>
        <progress className="sonara-pro-v3__progress" value={Math.max(0,Math.min(100,job.progress||0))} max={100}/>
        <span className="sonara-pro-v3__job-stage">{String(job.stage||'elaborazione')} · {Math.round(Number(job.progress||0))}%</span>
        {job.status==='FAILED'&&<p role="alert" className="sonara-pro-v3__job-error">{job.error||'Il job non è riuscito.'}</p>}
        {output&&<div className="sonara-pro-v3__output">
          <audio controls src={output} preload="metadata"/>
          <div className="sonara-pro-v3__output-buttons">
            <button type="button" onClick={select}><Check size={15}/> Usa nel player SONARA</button>
            <a href={output} download="SONARA-REMIX-PRO.wav"><Download size={15}/> Scarica WAV</a>
          </div>
          {(job.stems||[]).length>0&&<details className="sonara-pro-v3__stems">
            <summary>Tracce separate</summary>
            {(job.stems||[]).map(stem=><label key={stem.role}><span>{stem.role}</span><audio controls src={stem.url} preload="none"/></label>)}
          </details>}
        </div>}
      </section>}

      <div className="sonara-pro-v3__footer">SONARA ENTERPRISE <span>REMIX PRO / V3 INTERFACE</span> <span>Audio supportati: WAV · MP3 · FLAC · M4A · AAC · OGG e altri</span></div>
    </div>
  );
}
