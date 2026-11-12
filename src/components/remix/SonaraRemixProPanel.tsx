import { useEffect, useRef, useState } from 'react';
import { AudioWaveform, Check, Download, LoaderCircle, ShieldCheck, UploadCloud, FolderOpen, Sparkles } from 'lucide-react';
import SonaraRemixProLibrary from './SonaraRemixProLibrary';
import SonaraRemixProProgress, { type RemixProTransfer } from './SonaraRemixProProgress';
import SonaraRemixProEditor, { type RemixEditorTrack } from './SonaraRemixProEditor';
import { createIntelligentRemixDirection } from './sonaraRemixIntelligentDirection';
import SonaraRemixV7Studio from './SonaraRemixV7Studio';
import { addV7Direction, v7Directions, type V7Intent, type V7Direction } from './sonaraRemixV7Director';
import './SonaraRemixProStudio.css';

type ProJob = {jobId?: string;status?: string;stage?: string;progress?: number;audioUrl?: string;
  stems?: {role:string;url:string}[];error?: string;title?:string;createdAt?:number;
  requestedDurationSeconds?:number;actualDurationSeconds?:number;
  v5Result?: {candidatesGenerated:number;candidatesAccepted:number;technicalScore:number;artisticListeningRequired:boolean};
  v6Result?: {selectionScore:number;spectralDiversityProxy:number;continuityProxy:number;masterProfile:string;artisticListeningRequired:boolean;isArtisticJudgment:false};
  v7Result?: {priority:number;harmonicEstimate:string;creativeMode?:'balanced'|'experimental'|'wild'|'explosive';master:{lufs:number;truePeakDbTp:number;crestDb:number};
    rhythm?:{sourceBpm:number;outputBpm:number;confidence:number;retimeRatio:number;meter:string;phraseBars:number;vocalGrid:string;beatGridBasis:string}};
};
const isJob = (id:string) => /^srpro_[0-9a-f-]{36}$/.test(id);
const sleep=(ms:number)=>new Promise(resolve=>window.setTimeout(resolve,ms));
const durationLabel=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.round(seconds%60)).padStart(2,'0')}`;
const safeError=(value:unknown,fallback:string)=>typeof value==='string'&&value.length<250?value:fallback;
const KEY='sonara.remixPro.activeJob.v1';
const DURATION_KEY='sonara.remixPro.requestedDuration.v2';
const validDuration=(n:number)=>Number.isInteger(n)&&n>=30&&n<=480&&n%30===0;
const AUDIO_FORMATS=/\.(wav|mp3|flac|m4a|mp4|mov|m4v|aac|ogg|oga|opus|aif|aiff|aifc|webm|wma|caf|amr|ac3)$/i;
const AUDIO_PICKER_ACCEPT='audio/*,video/*,.wav,.mp3,.flac,.m4a,.mp4,.mov,.m4v,.aac,.ogg,.oga,.opus,.aif,.aiff,.aifc,.webm,.wma,.caf,.amr,.ac3';
const audioSuffix=(name:string)=>name.match(AUDIO_FORMATS)?.[1]?.toLowerCase()||'';

export default function SonaraRemixProPanel() {
  const [available,setAvailable]=useState<boolean|null>(null);
  const [v5Available,setV5Available]=useState(false);
  const [v6Available,setV6Available]=useState(false);
  const [v7Available,setV7Available]=useState(false);
  const [v7RhythmAvailable,setV7RhythmAvailable]=useState(false);
  const [v7CreativeModesAvailable,setV7CreativeModesAvailable]=useState(false);
  const [rhythmMode,setRhythmMode]=useState<'source-a'|'manual'>('source-a');
  const [phraseBars,setPhraseBars]=useState<4|8|16>(8);
  const [vocalGrid,setVocalGrid]=useState<'bar'|'half-bar'>('half-bar');
  const [explosiveAvailable,setExplosiveAvailable]=useState(false);
  const [dnaMode,setDnaMode]=useState<'balanced'|'experimental'|'wild'|'explosive'>('balanced');
  const [masterProfile,setMasterProfile]=useState<'streaming'|'club'>('streaming');
  const [dnaLevels,setDnaLevels]=useState({melody:65,harmony:60,groove:65,timbre:55,humanize:60});
  const [genre,setGenre]=useState('auto');
  const [bInfluence,setBInfluence]=useState(50);
  const [candidateCount,setCandidateCount]=useState(2);
  const [durationMode,setDurationMode]=useState<'auto'|'manual'>('auto');
  const [multiformatAvailable,setMultiformatAvailable]=useState(false);
  const [sourceA,setSourceA]=useState<File|null>(null);
  const [parentJobId,setParentJobId]=useState('');
  const [v7Enabled,setV7Enabled]=useState(true);
  const [v7Intent,setV7Intent]=useState<V7Intent>({vocalFlow:85,houseGroove:90,harmony:85,arrangement:80});
  const [v7Direction,setV7Direction]=useState<V7Direction['id']>('dialogue');
  const [trackTitle,setTrackTitle]=useState('');
  const [archiveRefresh,setArchiveRefresh]=useState(0);
  const [editorTrack,setEditorTrack]=useState<RemixEditorTrack|null>(null);
  const [sourceB,setSourceB]=useState<File|null>(null);
  const [prompt,setPrompt]=useState('Create ONE coherent House production with a single steady kick and BPM from song A. Blend the two ORIGINAL A and B voices into flowing natural verses and musical dialogue, not repeated choruses or alternating source blocks. Keep both original languages and pronunciations, leave space between vocals, avoid crowded instruments and competing basslines. Build a professional continuous arrangement with clear intro, development, and outro.');
  const [directionCount,setDirectionCount]=useState(0);
  const directionSequence=useRef(0);
  const [duration,setDuration]=useState<number>(()=>{
    try { const value=Number(sessionStorage.getItem(DURATION_KEY)); return validDuration(value)?value:120; }
    catch { return 120; }
  });
  const candidateLimit=durationMode==='auto'?2:duration<=90?3:duration<=180?2:1;
  const effectiveCandidates=Math.min(candidateCount,candidateLimit);
  const [bassFrom,setBassFrom]=useState<'a'|'b'>('a');
  const [bpmA,setBpmA]=useState('');
  const [bpmB,setBpmB]=useState('');
  const [rights,setRights]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  const [transfer,setTransfer]=useState<RemixProTransfer|null>(null);
  const [lastConfirmedAt,setLastConfirmedAt]=useState<number|null>(null);
  const [monitoringDelayed,setMonitoringDelayed]=useState(false);
  const [job,setJob]=useState<ProJob|null>(null);
  const [submittedDuration,setSubmittedDuration]=useState<number|null>(null);
  const [error,setError]=useState('');
  const [info,setInfo]=useState('');
  const mounted=useRef(true);
  const activeJob=useRef('');
  const sourceAInput=useRef<HTMLInputElement>(null);
  const sourceBInput=useRef<HTMLInputElement>(null);
  const shuffleMusicalDirection=()=>{
    const input={
      genre,mode:dnaMode,bInfluence,bassFrom,master:masterProfile,
      bpmA,bpmB,dna:dnaLevels,
    };
    let candidate='';
    for(let attempt=0;attempt<8;attempt++){
      candidate=createIntelligentRemixDirection(input,++directionSequence.current);
      if(candidate!==prompt)break;
    }
    setPrompt(candidate);
    setDirectionCount(directionSequence.current);
    setError('');
    setInfo('Nuova direzione musicale pronta. Puoi modificarla prima di generare il brano.');
  };
  const createVersionFromArchive=async(entry:{jobId:string;title:string;audioUrl:string})=>{
    if(!isJob(entry.jobId)||entry.audioUrl!=='/api/sonara-relay/pro-job/'+entry.jobId+'/audio'){
      setError('Origine della versione non verificata.');return;
    }
    if(submitting||job?.status==='PROCESSING'){
      setError('Completa il lavoro attivo prima di avviare una nuova versione.');return;
    }
    setError('');setInfo('Recupero privato del master originale dal tuo archivio…');
    try{
      const response=await fetch(entry.audioUrl,{credentials:'include',cache:'no-store'});
      if(!response.ok)throw new Error('Non riesco a recuperare il tuo remix originale.');
      const blob=await response.blob();
      if(blob.size<44||blob.size>512*1024*1024)
        throw new Error('Il master non rispetta i limiti audio Remix Pro.');
      const file=new File([blob],entry.title.replace(/[^a-zA-Z0-9 _-]/g,'').slice(0,65)+'.wav',{type:'audio/wav'});
      setSourceA(file);
      setParentJobId(entry.jobId);
      setTrackTitle((entry.title+' · V2').slice(0,96));
      setInfo('Versione derivata da '+entry.title+'. Seleziona il secondo brano B, conferma i diritti e avvia una nuova generazione.');
    }catch(e){setError(e instanceof Error?e.message:'Impossibile preparare la versione.');}
  };
  const changeDuration=(seconds:number)=>{
    if (!validDuration(seconds)) return;
    setDuration(seconds);
    try { sessionStorage.setItem(DURATION_KEY,String(seconds)); } catch {}
  };
  const chooseSource=(file:File|null,role:'a'|'b')=>{
    if(!file)return;
    if(!AUDIO_FORMATS.test(file.name)||file.size<44||file.size>512*1024*1024){
      setError('Il brano '+role.toUpperCase()+' deve essere audio o video musicale supportato, massimo 512 MiB.');
      return;
    }
    if(role==='a'){setSourceA(file);setParentJobId('');}
    else setSourceB(file);
    setError('');
    setInfo('Brano '+role.toUpperCase()+' selezionato: '+file.name);
  };

  useEffect(()=>{
    mounted.current=true;
    const previous=(()=>{try{return sessionStorage.getItem(KEY)||'';}catch{return '';}})();
    if(isJob(previous)){activeJob.current=previous;setJob({jobId:previous,status:'PROCESSING',progress:0});
      setInfo('Recupero un job precedente. La sua durata potrebbe essere diversa dalla nuova selezione.');}
    fetch('/api/sonara-relay/pro-capabilities',{cache:'no-store',credentials:'include'})
      .then(r=>r.ok?r.json():{available:false})
      .then(x=>{if(mounted.current){setAvailable(x.available===true);setMultiformatAvailable(x.multiformatAvailable===true);setV5Available(x.v5Available===true);setV6Available(x.v6Available===true);setV7Available(x.v7Available===true);setV7RhythmAvailable(x.v7RhythmAvailable===true);setV7CreativeModesAvailable(x.v7CreativeModesAvailable===true);setExplosiveAvailable(x.explosiveAvailable===true);}})
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
            // A lost enqueue can return 404 even while its private reservation
            // is being reconciled. Do not claim the master was erased.
            if(errors<3){
              errors++;
              await sleep(3500);
              continue;
            }
            try{sessionStorage.removeItem(KEY);}catch{}
            activeJob.current='';
            setJob(null);
            setError('Questa richiesta non risulta registrata dopo i controlli. Nessun master confermato: puoi riprovare, ma se una prenotazione risulta ancora attiva sarà riconciliata dal server.');
            setArchiveRefresh(n=>n+1);
            return;
          }
          if(response.status===401||response.status===403){
            setError('Sessione SONARA non autorizzata. Accedi nuovamente prima di avviare il remix.');
            return;
          }
          if(!response.ok)throw new Error(safeError(data.error,'Monitoraggio temporaneamente non disponibile'));
          if(cancelled||!mounted.current)return;
          errors=0;
          setMonitoringDelayed(false);
          setLastConfirmedAt(Date.now());
          setJob(data);
          if (submittedDuration!==null && data.requestedDurationSeconds!==undefined &&
              Number(data.requestedDurationSeconds)!==submittedDuration) {
            setError('ERRORE DURATA: il server ha registrato '+durationLabel(Number(data.requestedDurationSeconds))+
              ' invece di '+durationLabel(submittedDuration)+'. Il job non corrisponde alla richiesta; non inviarne un altro prima che termini.');
          }
          if(data.status==='COMPLETED'||data.status==='FAILED'){
            try{sessionStorage.removeItem(KEY);}catch{}
            activeJob.current='';
            setArchiveRefresh(n=>n+1);
            setInfo(data.status==='COMPLETED'
              ? 'Master completato e salvato nel tuo archivio Remix. Puoi creare subito il prossimo brano.'
              : 'Il job è concluso. Puoi avviare una nuova fusione A+B.');
            return;
          }
          setInfo('Fase: '+String(data.stage||'elaborazione')+' — '+Math.round(Number(data.progress||0))+'%');
          await sleep(5000);
        }catch{
          errors++;
          if(errors>=2 && mounted.current)setMonitoringDelayed(true);
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
      throw new Error('Carica un file audio o video musicale supportato fino a 512 MiB.');
    }
    const suffix=audioSuffix(file.name);
    if(suffix!=='wav'&&!multiformatAvailable)
      throw new Error('Audio multiformato in aggiornamento su MoLab. Al momento usa WAV.');
    setTransfer({phase:sourceLabel==='A'?'a':'b',name:file.name,confirmedBytes:0,totalBytes:file.size});
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
      setTransfer({phase:sourceLabel==='A'?'a':'b',name:file.name,confirmedBytes:file.size,totalBytes:file.size});
      return String(data.referenceId);
    }
    const start=await fetch('/api/sonara-relay/reference-multipart/start',{
      method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:file.name,bytes:file.size})
    });
    const session=await start.json().catch(()=>({}));
    if(!start.ok||!/^sref_[0-9a-f-]{36}$/.test(String(session.referenceId||'')))
      throw new Error(safeError(session.error,'Avvio upload multimediale privato non riuscito.'));
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
          setTransfer({phase:sourceLabel==='A'?'a':'b',name:file.name,
            confirmedBytes:Math.min(file.size,n*chunk),totalBytes:file.size});
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
      throw new Error(safeError(result.error,'Finalizzazione upload multimediale fallita.'));
    return ref;
  };

  const begin=async()=>{
    if(submitting||activeJob.current&&job?.status!=='FAILED'&&job?.status!=='COMPLETED')return;
    if(available!==true){setError('Remix Pro GPU non ancora collegato. Usa il Remix normale.');return;}
    if(!sourceA||!sourceB){setError('Seleziona due brani audio o video musicali diversi.');return;}
    if(sourceA===sourceB){setError('Le sorgenti A e B devono essere diverse.');return;}
    if(!rights){setError('Conferma di avere il diritto di utilizzare entrambi i brani.');return;}
    if(!prompt.trim()){setError('Inserisci le indicazioni musicali per il nuovo brano.');return;}
    if(v7Enabled&&v7RhythmAvailable&&rhythmMode==='manual'&&
      (!bpmA||!Number.isFinite(Number(bpmA))||Number(bpmA)<55||Number(bpmA)>200)){
      setError('Imposta BPM A tra 55 e 200: la correzione è ammessa solo entro ±12% dal ritmo reale di A.');
      return;
    }
    if(dnaMode==='explosive'&&!explosiveAvailable){setError('Explosive Fusion richiede l’aggiornamento del worker GPU MoLab.');return;}
    // Auto duration is chosen ONCE before enqueue, so the private job still
    // carries an exact, verifiable duration: never change it during polling.
    const requestedDuration=v5Available&&durationMode==='auto'
      ? (3 + (crypto.getRandomValues(new Uint32Array(1))[0] % 4))*30
      : duration;
    const safeCandidateCount=Math.min(effectiveCandidates,requestedDuration<=90?3:requestedDuration<=180?2:1);
    if(!validDuration(requestedDuration)){setError('Scegli una durata valida fra 0:30 e 8:00.');return;}
    if(!v5Available||!v6Available){setError('Per conservare le voci originali A+B serve Remix Pro V6 GPU attivo.');return;}
    setSubmittedDuration(requestedDuration);
    setSubmitting(true);setError('');setInfo('Caricamento privato del brano A…');
    try{
      const a=await upload(sourceA,'A');
      setInfo('Caricamento privato del brano B…');
      const b=await upload(sourceB,'B');
      setTransfer({phase:'registering',name:'Conferma',confirmedBytes:0,totalBytes:0});
      setInfo('Avvio del job autenticato…');
      const response=await fetch('/api/billing/generate',{
        method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          sonaraRemixPro:true,
          sonaraRemixProRightsConfirmed:true,
          sonaraRemixProSourceA:a,
          ...(parentJobId?{sonaraRemixProParentJobId:parentJobId}:{}),
          sonaraRemixProSourceB:b,
          sonaraRemixProTitle:trackTitle.trim().slice(0,96)||('Creative Fusion '+new Date().toLocaleDateString('it-IT')),
          sonaraRemixProBassFrom:bassFrom,
          ...(v5Available?{
            sonaraRemixProV5:true,
            sonaraRemixProGenre:genre,
            sonaraRemixProBInfluence:bInfluence,
            sonaraRemixProCandidates:safeCandidateCount,
            sonaraRemixProDurationMode:durationMode,
            sonaraRemixProV6:true,
            sonaraRemixProV7:v7Enabled&&v7Available,
            sonaraRemixProV7CreativeModes:v7Enabled&&v7Available&&v7CreativeModesAvailable,
            ...(v7Enabled&&v7Available&&v7RhythmAvailable
              ?{sonaraRemixProV7RhythmControls:{
                 tempoMode:rhythmMode,meter:'4/4',
                 phraseBars,vocalGrid}}:{}),
            ...(v6Available?{sonaraRemixProV6Controls:{
              mode:dnaMode, master:masterProfile,...dnaLevels
            }}:{})
          }:{}),
          ...((bpmA&&!(v7Enabled&&v7RhythmAvailable&&rhythmMode==='source-a'))?{sonaraRemixProBpmA:Number(bpmA)}:{}),
          ...(bpmB?{sonaraRemixProBpmB:Number(bpmB)}:{}),
          durationSec:requestedDuration,
          prompt:(v7Enabled
            ?addV7Direction(prompt,v7Directions(v7Intent).find(item=>item.id===v7Direction)!)
            :prompt.trim()).slice(0,6500),
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
    finally{setSubmitting(false);setTransfer(null);}
  };

  const output=job?.status==='COMPLETED'&&job.audioUrl?job.audioUrl:null;
  const select=()=>{
    if(!output||!job?.jobId)return;
    const data={variationId:'Remix Pro',jobId:job.jobId,audioUrl:output,audioFormat:'wav',title:'SONARA Remix Pro'};
    window.dispatchEvent(new CustomEvent('sonara:generated-track-selected',{detail:data}));
    setInfo('Remix Pro selezionato nel player SONARA.');
  };

  return (
    <div className="sonara-remix-pro sonara-v6-studio" data-sonara-remix-v5-studio="true" data-sonara-remix-v6-primary="true" style={{padding:24,border:'1px solid #363145',borderRadius:22,background:'#101215',color:'#edeaf5',display:'grid',gap:18,boxShadow:'0 16px 45px rgba(0,0,0,.25)'}}>
      <div className="sonara-v6-hero" style={{display:'flex',gap:8,alignItems:'center',justifyContent:'space-between'}}>
        <strong className="sonara-v6-title" style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',fontSize:18,letterSpacing:'.04em'}}><AudioWaveform size={19}/> SONARA REMIX PRO <span className="sonara-v6-version" style={{fontSize:10,background:'#32234e',border:'1px solid #664c92',borderRadius:99,padding:'5px 9px'}}>V6 · CREATIVE DNA FUSION</span></strong>
        <span style={{fontSize:10,color:available?'#97e5b8':'#d5b6ef'}}>{available?'GPU ONLINE':available===null?'CONNESSIONE…':'NON ANCORA ATTIVO'}</span>
      </div>
      <small className="sonara-pro-intro">DUE SORGENTI, UN BRANO ORIGINALE. Un unico groove dal brano A, le due voci originali e un arrangiamento nuovo. Tutte le fasi operative saranno visibili durante la generazione.</small>
      <div role="status" style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <span style={{padding:'6px 11px',borderRadius:99,background:v6Available?'#15342c':'#382b21',color:v6Available?'#9eeac3':'#e6c38e',fontSize:11}}>{v6Available?'CREATIVE DNA V6 GPU PRONTO':v5Available?'MOTORE V5 DISPONIBILE':'GPU IN ATTESA'}</span>
        <small style={{color:'#9a91a9'}}>{v6Available?'Fusione V6 attivabile · V5 disponibile come ripiego':v5Available?'Anteprima Creative DNA sul motore V5; GPU V6 non confermata':'In attesa del motore privato Remix Pro'}</small>
      </div>
      <div className="sonara-v6-section-label"><span>01</span><div><strong>I tuoi due brani</strong><small>Importa le sorgenti A+B per creare un'unica composizione.</small></div></div>
      <div className="sonara-v6-uploads" data-testid="sonara-remix-pro-uploaders" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,225px),1fr))',gap:12}}>
        <div data-sonara-pro-source="a" onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';}}
          onDrop={e=>{e.preventDefault();chooseSource(e.dataTransfer.files?.[0]||null,'a');}}
          style={{display:'grid',gap:10,minWidth:0,padding:16,border:'1px dashed #9869dc',borderRadius:12,background:'#20172c'}}>
          <strong>BRANO A — Cassa, tempo e voce originale</strong>
          <small>Trascina qui un brano audio o un video musicale.</small>
          <input id="sonara-remix-pro-file-a" ref={sourceAInput} type="file" accept={AUDIO_PICKER_ACCEPT}
            aria-label="Seleziona file audio o video brano A" data-testid="sonara-remix-pro-input-a"
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
          <strong>BRANO B — Seconda voce e identità musicale</strong>
          <small>Trascina qui un brano audio o un video musicale.</small>
          <input id="sonara-remix-pro-file-b" ref={sourceBInput} type="file" accept={AUDIO_PICKER_ACCEPT}
            aria-label="Seleziona file audio o video brano B" data-testid="sonara-remix-pro-input-b"
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
      <small>Formati audio: WAV, MP3, FLAC, M4A, AAC, OGG/OPUS, AIFF, WebM, WMA, CAF, AMR, AC3. Video musicali: MP4, MOV, M4V (anche con più tracce audio). Massimo 15 minuti di musica e 512 MiB per file. La GPU estrae solo l'audio e lo converte in WAV di lavoro privato, senza modificare l'originale.</small>
      {!multiformatAvailable&&<small role="status">Decodifica multiformato non ancora pronta sull'agente MoLab. I WAV continuano a funzionare.</small>}
      <div className="sonara-v6-section-label"><span>02</span><div><strong>Direzione creativa</strong><small>Una produzione nuova, con la tua identità musicale.</small></div></div>
      <section className="sonara-v6-controls" style={{border:'1px solid #3f3354',borderRadius:15,padding:16,display:'grid',gap:12,background:'rgba(255,255,255,.025)'}}>
        <strong style={{fontSize:12,letterSpacing:'.1em',color:'#d6c2f0'}}>CREATIVE FUSION CONTROLS</strong>
        {v5Available&&<section data-testid="sonara-v6-fusion-controls" style={{border:'1px solid #634b85',borderRadius:12,padding:15,display:'grid',gap:11,background:'linear-gradient(145deg,#21182f,#191725)'}}>
          <strong style={{color:'#e1c9ff',fontSize:13,letterSpacing:'.08em'}}>SONARA CREATIVE DNA FUSION V6</strong>
          <small style={{color:'#beb0d5'}}>{v6Available?'Motore V6 GPU disponibile: analisi DNA, composizione differenziata, selezione misurabile e mastering dedicato.':'Anteprima Creative DNA su V5: le indicazioni compositive sono reali, ma analisi e selezione V6 richiedono un aggiornamento del worker MoLab.'}</small>
          {dnaMode==='explosive'&&<small role="status">Explosive Fusion mantiene un'unica cassa House dal brano A, con le due voci originali fuse in una struttura fluida, senza ritornelli incollati. Le parole e la fedeltà musicale non sono garantite automaticamente: serve ascoltare il master. Disponibile solo con worker V6 aggiornato.</small>}
          <small role="status" style={{color:'#d8c1f0'}}>Fusione House A+B · cassa e BPM solo dal brano A, voci autentiche in frasi naturali senza alternanza di ritornelli fissi. Niente ricanto o traduzione automatica. Il mix va ascoltato prima della pubblicazione.</small>
          <small className="sonara-pro-mode-capability" role="status">
            {v7CreativeModesAvailable
              ?'MODALITÀ V7 DIFFERENZIATE ATTIVE · Ogni profilo modifica davvero il trattamento musicale e l’arrangiamento.'
              :'Modalità V7 avanzate in attesa del nuovo modulo MoLab: resta attiva la compatibilità con il motore precedente.'}
          </small>
          <label style={{display:'grid',gap:5}}>Modalità creativa
            <select value={dnaMode} onChange={e=>setDnaMode(e.target.value as 'balanced'|'experimental'|'wild'|'explosive')} style={{background:'#272036',color:'#fff',border:'1px solid #6e5488',borderRadius:8,padding:10}}>
              <option value="balanced">Balanced · Fusione coerente</option>
              <option value="experimental">Experimental · Nuove interpretazioni</option>
              <option value="wild">Wild · Trasformazione audace</option>
              <option value="explosive" disabled={!explosiveAvailable}>Explosive Fusion A+B · Cassa unica, due voci naturali {explosiveAvailable?'':'(GPU in aggiornamento)'}</option>
            </select>
          </label>
          <div className="sonara-pro-mode-explainer" data-testid="sonara-mode-difference-description" role="status">
            {({
              balanced:'BALANCED · Una canzone coerente e musicale. Voci A+B distribuite in modo equilibrato, accompagnamento caldo e sviluppo graduale.',
              experimental:'EXPERIMENTAL · Nuove armonie e risposte musicali, ordine delle frasi vocali meno prevedibile e strumentazione più esplorativa.',
              wild:'WILD · Trasformazione audace, timbri contrastanti, frasi vocali meno lineari e dinamica del basso più marcata.',
              explosive:'EXPLOSIVE · Energia da club sempre alta, un solo groove e un solo kit di batteria A, voci autentiche integrate senza pause ritmiche.'
            } as const)[dnaMode]}
          </div>
          {([
            ['melody','Melodia A'],['harmony','Armonia A'],['groove','Groove A'],
            ['timbre','Timbri B'],['humanize','Naturalezza degli strumenti']
          ] as const).map(([field,label])=><label key={field} style={{display:'grid',gap:5}}>
            <span style={{display:'flex',justifyContent:'space-between',gap:8}}><span>{label}</span><strong>{dnaLevels[field]}%</strong></span>
            <input aria-label={'DNA '+label} type="range" min={0} max={100} step={5} value={dnaLevels[field]}
              onChange={e=>setDnaLevels(previous=>({...previous,[field]:Number(e.target.value)}))}/>
          </label>)}
          <label style={{display:'grid',gap:5}}>Mastering
            <select value={masterProfile} onChange={e=>setMasterProfile(e.target.value==='club'?'club':'streaming')}
              style={{background:'#272036',color:'#fff',border:'1px solid #6e5488',borderRadius:8,padding:10}}>
              <option value="streaming">Streaming · Master dinamico</option>
              <option value="club">Club · Impatto e bassi controllati</option>
            </select>
            {!v6Available&&<small style={{color:'#d5b38a'}}>Il profilo mastering è una direzione musicale nell'anteprima V5; il DSP V6 richiede un worker aggiornato.</small>}
          </label>
        </section>}
        <label style={{display:'grid',gap:6}}>Genere musicale
          <select value={genre} disabled={!v5Available} onChange={e=>setGenre(e.target.value)} style={{padding:10,borderRadius:9,background:'#262032',color:'#fff',border:'1px solid #4e4164'}}>
            <option value="auto">Automatico</option><option value="house">House</option>
            <option value="tech-house">Tech House</option><option value="deep-house">Deep House</option>
            <option value="jazz-fusion">Jazz Fusion</option><option value="hip-hop">Hip Hop / Rap</option>
            <option value="latin-house">Latin / Brazilian House</option><option value="pop">Pop</option>
          </select>
        </label>
        <label style={{display:'grid',gap:6}}>Influenza creativa: A {100-bInfluence}% · B {bInfluence}%
          <input type="range" min={20} max={80} step={5} value={bInfluence} disabled={!v5Available} aria-label="Bilanciamento creativo brano A e B" onChange={e=>setBInfluence(Number(e.target.value))}/>
        </label>
        <label style={{display:'grid',gap:6}}>Candidati musicali
          <select value={effectiveCandidates} disabled={!v5Available} onChange={e=>setCandidateCount(Number(e.target.value))} style={{padding:9,borderRadius:9,background:'#262032',color:'#fff',border:'1px solid #4e4164'}}>
            <option value={1}>1 candidato</option>{candidateLimit>=2&&<option value={2}>2 candidati</option>}{candidateLimit>=3&&<option value={3}>3 candidati</option>}
          </select>
          <small style={{color:'#a99db9'}}>Candidati effettivi: {effectiveCandidates}. Per remix oltre 3 minuti viene generato un solo candidato; fino a 3 minuti sono disponibili 2, fino a 1:30 massimo 3. La durata automatica adatta il numero all'avvio.</small>
        </label>
      </section>
      <label className="sonara-v6-field">Titolo del nuovo remix
        <input type="text" maxLength={96} value={trackTitle}
          onChange={e=>setTrackTitle(e.target.value)} placeholder="Es. Midnight Fusion · Club Edit"
          aria-label="Titolo del remix da salvare in archivio"/>
      </label>
      <div className="sonara-v6-field sonara-v6-direction-field" data-testid="sonara-remix-intelligent-direction">
        <div className="sonara-v6-direction-head">
          <label htmlFor="sonara-remix-direction-textarea">Direzione musicale intelligente</label>
          <button type="button" className="sonara-v6-direction-shuffle" data-testid="sonara-remix-change-direction"
            onClick={shuffleMusicalDirection} aria-label="Cambia direzione musicale"
            title="Crea una nuova proposta senza avviare alcun job GPU">
            <Sparkles size={16}/> Cambia direzione musicale
          </button>
        </div>
        <textarea id="sonara-remix-direction-textarea" rows={6} maxLength={6500}
          data-testid="sonara-remix-direction-textarea"
          value={prompt} onChange={e=>setPrompt(e.target.value)}
          placeholder="Descrivi il risultato musicale oppure premi Cambia direzione musicale…"/>
        <small role="status" className="sonara-v6-direction-hint">
          {directionCount>0?'Proposte generate: '+directionCount+'. ':' '}
          Varianti senza limite predefinito, basate su genere, modalità, equilibrio A/B, BPM inseriti e controlli DNA.
          Il contenuto dei file sarà analizzato dal motore soltanto durante la generazione.
          Cambiare proposta non consuma GPU e non crea un remix.
        </small>
      </div>
      <small className="sonara-v7-engine-status" role="status">
        {v7Available
          ?'V7 audio GPU verificato: il motore eseguirà la pianificazione vocale avanzata, la dinamica A e la selezione tecnica migliorata.'
          :'V7 Studio Director attivo come guida creativa sul motore V6. La parte audio V7 richiede l’installazione separata sul worker RTX PRO 6000.'}
      </small>
      <SonaraRemixV7Studio enabled={v7Enabled} onEnabledChange={setV7Enabled}
        intent={v7Intent} onIntentChange={setV7Intent}
        direction={v7Direction} onDirectionChange={setV7Direction}/>
      <section className="sonara-v7-rhythm" data-testid="sonara-v7-rhythm-controls"
        aria-label="Regolazione ritmo, battute e tempo">
        <div className="sonara-v7-rhythm-header">
          <span className="sonara-v7-kicker">RHYTHM & TEMPO LOCK · HOUSE</span>
          <strong>Ritmo, battute e tempo</strong>
          <p>Una sola batteria dal brano A. Griglia 4/4, frasi regolari e ingressi vocali musicali.</p>
        </div>
        <div className="sonara-v7-rhythm-grid">
          <label>Tempo del remix
            <select data-testid="sonara-v7-tempo-mode" value={rhythmMode}
              disabled={!v7Enabled} onChange={e=>setRhythmMode(e.target.value==='manual'?'manual':'source-a')}>
              <option value="source-a">Automatico: misura dal brano A</option>
              <option value="manual">Manuale: BPM A desiderato</option>
            </select>
          </label>
          <label>BPM obiettivo
            <input data-testid="sonara-v7-target-bpm" type="number" inputMode="numeric"
              min={55} max={200} step={1} placeholder={rhythmMode==='source-a'?'Rilevamento automatico':'Es. 124'}
              disabled={!v7Enabled||rhythmMode==='source-a'}
              value={rhythmMode==='manual'?bpmA:''}
              onChange={e=>setBpmA(e.target.value)}/>
          </label>
          <label>Metro musicale
            <input type="text" readOnly value="4/4 · House" aria-label="Metro musicale bloccato a quattro quarti"/>
          </label>
          <label>Struttura delle frasi
            <select data-testid="sonara-v7-phrase-bars" value={phraseBars}
              disabled={!v7Enabled} onChange={e=>setPhraseBars(Number(e.target.value) as 4|8|16)}>
              <option value={4}>4 battute per frase breve</option>
              <option value={8}>8 battute · Standard House</option>
              <option value={16}>16 battute · Struttura estesa</option>
            </select>
          </label>
          <label>Ingresso delle voci A+B
            <select data-testid="sonara-v7-vocal-grid" value={vocalGrid}
              disabled={!v7Enabled} onChange={e=>setVocalGrid(e.target.value==='bar'?'bar':'half-bar')}>
              <option value="half-bar">Ogni mezza battuta musicale (2 beat)</option>
              <option value="bar">Su inizio battuta (4 beat)</option>
            </select>
          </label>
        </div>
        <div className="sonara-v7-bar-visual" aria-hidden="true">
          {Array.from({length:8},(_,bar)=><div key={bar} className="sonara-v7-bar">
            {Array.from({length:4},(_,beat)=><span key={beat} className={beat===0?'is-downbeat':''}/>)}
          </div>)}
        </div>
        <small role="status">{v7RhythmAvailable
          ?'GPU Rhythm Lock pronta: verifica il BPM di A, allinea le battute e applica solo piccole correzioni del tempo con preservazione dell’altezza. Se il BPM richiesto è troppo distante da A, rifiuta il job prima della generazione.'
          :'Rhythm Lock audio non ancora disponibile sul worker MoLab: le preferenze sono visibili, ma la correzione ritmica si attiverà solo dopo l’aggiornamento GPU.'}
        </small>
      </section>
      {parentJobId&&<div className="sonara-v7-origin" role="status">
        <strong>Versione collegata all'archivio</strong>
        <span>Nuovo remix derivato dal master {parentJobId.slice(6,14)}. La versione originale resterà salvata.</span>
        <button type="button" onClick={()=>{setParentJobId('');setSourceA(null);}}>Annulla nuova versione</button>
      </div>}
      <div className="sonara-v6-section-label"><span>03</span><div><strong>Durata e produzione</strong><small>Imposta la lunghezza e i dettagli del brano.</small></div></div>
      <div className="sonara-v6-production" style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8}}>
        <label>Durata Remix AI (30 secondi – 8 minuti)
          <select aria-label="Modalità durata Remix AI" disabled={!v5Available} value={v5Available?durationMode:'manual'} onChange={e=>setDurationMode(e.target.value==='manual'?'manual':'auto')}>
            <option value="auto">Durata automatica V5 (1:30–3:00)</option><option value="manual">Durata manuale</option>
          </select>
          <input type="range" min={30} max={480} step={30} value={duration} disabled={v5Available&&durationMode==='auto'}
            data-testid="sonara-remix-pro-duration-slider"
            aria-label="Durata esatta del brano A+B da 30 secondi a 8 minuti"
            aria-valuetext={durationLabel(duration)}
            onChange={e=>changeDuration(Number(e.target.value))} style={{width:'100%'}}/>
          <strong data-testid="sonara-remix-pro-duration-selected">{v5Available&&durationMode==='auto'?'Durata: scelta automaticamente all’avvio (1:30–3:00)':'Durata del NUOVO remix A+B: '+durationLabel(duration)+' minuti'}</strong>
          <select disabled={v5Available&&durationMode==='auto'} data-testid="sonara-remix-pro-duration-select" value={duration} onChange={e=>changeDuration(Number(e.target.value))}>
            {Array.from({length:16},(_,i)=>(i+1)*30).map(sec=>
              <option key={sec} value={sec}>{Math.floor(sec/60)}:{String(sec%60).padStart(2,'0')}</option>
            )}
          </select>
        </label>
        <label>Basso<select value={bassFrom} onChange={e=>setBassFrom(e.target.value==='b'?'b':'a')}><option value="a">Dal brano A</option><option value="b">Dal brano B</option></select></label>
        <label>BPM A {v7Enabled&&v7RhythmAvailable&&rhythmMode==='manual'?'(obbligatorio)':'(facoltativo)'}
          <input type="number" min={55} max={200} placeholder="Analisi automatica"
            disabled={v7Enabled&&v7RhythmAvailable&&rhythmMode==='source-a'}
            value={v7Enabled&&v7RhythmAvailable&&rhythmMode==='source-a'?'':bpmA}
            onChange={e=>setBpmA(e.target.value)} />
        </label>
        <label>BPM B (facoltativo)<input type="number" min={55} max={200} placeholder="Analisi automatica" value={bpmB} onChange={e=>setBpmB(e.target.value)} /></label>
      </div>
      <label style={{display:'flex',alignItems:'flex-start',gap:8}}>
        <input type="checkbox" checked={rights} onChange={e=>setRights(e.target.checked)} />
        <span>Confermo di possedere o avere i diritti di utilizzo di entrambi i brani.</span>
      </label>
      <small role="status" style={{color:'#aba2bb'}}>Remix Pro realizza un unico WAV con sorgenti A e B separate. {v5Available&&durationMode==='auto'?'Con durata automatica, la scelta effettiva viene fissata prima del job e verificata dal server. ':'L’uscita mantiene la durata scelta.'} Un brano lungo può richiedere più passaggi ACE-Step. Nessun consumo di minuti Studio.</small>
      <button className="sonara-v6-create" data-testid="sonara-v6-create-next" type="button"
        disabled={!available||submitting||job?.status==='PROCESSING'||!rights}
        onClick={()=>void begin()} style={{padding:11,borderRadius:9,background:'#6c3b9d',color:'white',fontWeight:800}}>
        {submitting?<LoaderCircle size={15}/>:<ShieldCheck size={15}/>} Crea Remix Pro reale
      </button>
      {info&&<small role="status">{info}</small>}
      {error&&<small role="alert" style={{color:'#ffb3b9'}}>{error}</small>}
      <SonaraRemixProProgress job={job} transfer={transfer}
        lastConfirmedAt={lastConfirmedAt} monitoringDelayed={monitoringDelayed} />
      {job&&<div className="sonara-v6-current-job" style={{display:'grid',gap:8}}>
        <strong>Dettagli lavoro · {job.jobId?.slice(0,18)}</strong>
        <small data-testid="sonara-remix-pro-job-duration">Durata del JOB {job.jobId?.slice(0,12)}: {Number(job.requestedDurationSeconds)>0?durationLabel(Number(job.requestedDurationSeconds)):'da recuperare dal server'}{Number(job.actualDurationSeconds)>0?' · WAV verificato: '+durationLabel(Number(job.actualDurationSeconds)):''}. {Number(job.requestedDurationSeconds)>0&&Number(job.requestedDurationSeconds)!==duration?'Questo è un job precedente: la nuova selezione '+durationLabel(duration)+' NON lo modifica.':''}</small>
        {job.status==='FAILED'&&<small role="alert">{job.error||'Job non riuscito.'}</small>}
        {job.v7Result?.creativeMode&&<small role="status" data-testid="sonara-creative-mode-applied">
          Modalità creativa confermata dal worker: <strong>{job.v7Result.creativeMode.toUpperCase()}</strong>.
          Il master applica effettivamente l'arrangiamento della modalità selezionata.
        </small>}
        {job.v7Result?.rhythm&&<small role="status" data-testid="sonara-v7-rhythm-result">
          Rhythm Lock: sorgente A {job.v7Result.rhythm.sourceBpm} BPM · uscita {job.v7Result.rhythm.outputBpm} BPM · metro 4/4 ·
          frasi {job.v7Result.rhythm.phraseBars} battute · confidenza di periodicità {Math.round(job.v7Result.rhythm.confidence*100)}%.
          La confidenza riguarda la periodicità della cassa, non il riconoscimento certo del downbeat.
        </small>}
        {job.v7Result&&<small role="status">
          V7 Deep Fusion: priorità tecnica {job.v7Result.priority}/100 ·
          armonia {job.v7Result.harmonicEstimate} ·
          master {job.v7Result.master.lufs} LUFS ·
          picco {job.v7Result.master.truePeakDbTp} dBTP.
          Sono misure tecniche, non una valutazione artistica: ascolta il risultato.
        </small>}
        {job.v6Result&&<small role="status">Creative DNA V6: profilo {job.v6Result.masterProfile}; indice tecnico composito {job.v6Result.selectionScore}/100, differenza spettrale misurata {job.v6Result.spectralDiversityProxy}/100. Sono indicatori tecnici, non giudizi artistici. Ascolta prima di pubblicare.</small>}
        {job.v5Result&&<small role="status">V5: {job.v5Result.candidatesAccepted} candidati tecnicamente validi su {job.v5Result.candidatesGenerated}. Indicatore tecnico: {job.v5Result.technicalScore}/100 (non misura la qualità artistica). Ascolto consigliato prima della pubblicazione.</small>}
        {output&&<>
          <audio src={output} controls preload="metadata" style={{width:'100%'}} />
          <div style={{display:'flex',gap:8}}>
            <button type="button" onClick={select}><Check size={14}/> Usa nel player</button>
            {job?.jobId&&<button type="button" data-testid="sonara-pro-edit-current"
              onClick={()=>setEditorTrack({jobId:job.jobId!,title:job.title||trackTitle||"SONARA Remix Pro",audioUrl:output})}>
              <AudioWaveform size={14}/> Modifica nella timeline
            </button>}
            <a href={output} download="SONARA-REMIX-PRO.wav"><Download size={14}/> Scarica WAV</a>
          </div>
          <strong>Stem reali separati</strong>
          {(job.stems||[]).map(stem=><label key={stem.role} style={{display:'grid',gap:4}}>
            <span>{stem.role}</span><audio controls src={stem.url} preload="none" style={{width:'100%'}}/>
          </label>)}
        </>}
      </div>}
      {available!==true&&<small>Remix tradizionale disponibile. Remix Pro sarà abilitato solo dopo autenticazione e verifica del servizio GPU dedicato.</small>}
      <div className="sonara-v6-section-label"><span><FolderOpen size={17}/></span><div><strong>Il tuo archivio personale</strong><small>Master salvati e disponibili dopo ogni generazione.</small></div></div>
      <SonaraRemixProLibrary refreshToken={archiveRefresh} onEdit={setEditorTrack}
        onCreateVersion={entry=>{void createVersionFromArchive(entry);}}/>
      <div className="sonara-v6-section-label"><span><AudioWaveform size={17}/></span><div><strong>Timeline ed equalizzatore</strong><small>Modifica e salva localmente i remix completati, senza toccare il master privato.</small></div></div>
      <SonaraRemixProEditor track={editorTrack}/>
    </div>
  );
}
