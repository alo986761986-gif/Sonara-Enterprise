import { useCallback, useEffect, useState } from 'react';
import { AudioLines, Check, Download, FolderOpen, LoaderCircle, Music2, Pencil, Play, RefreshCcw, X } from 'lucide-react';
import './SonaraRemixProLibrary.css';
import type { RemixEditorTrack } from './SonaraRemixProEditor';

type ArchivedRemix = {
  jobId: string;
  status: string;
  title: string;
  audioUrl?: string | null;
  createdAt: number;
  actualDurationSeconds?: number;
  requestedDurationSeconds?: number;
  engineVersion?: string;
  v6Result?: {masterProfile?: string};
};
type ArchiveResponse = {
  jobs?: ArchivedRemix[];
  hasMore?: boolean;
  nextCursor?: string | null;
  legacyScanIncomplete?: boolean;
  error?: string;
};
const idOk = (value: string) => /^srpro_[0-9a-f-]{36}$/.test(value);
const duration = (seconds?: number) => {
  const n = Math.max(0, Math.round(Number(seconds || 0)));
  return n ? Math.floor(n / 60) + ':' + String(n % 60).padStart(2,'0') : '—';
};
function safeName(name: string) {
  return (name.normalize('NFKD').replace(/[^a-zA-Z0-9 _-]+/g,'').trim().replace(/\s+/g,'-') || 'SONARA-REMIX') + '.wav';
}

export default function SonaraRemixProLibrary({refreshToken=0,onEdit}:{refreshToken?:number;onEdit?:(track:RemixEditorTrack)=>void}) {
  const [items,setItems] = useState<ArchivedRemix[]>([]);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [cursor,setCursor] = useState<string | null>(null);
  const [hasMore,setHasMore] = useState(false);
  const [legacyIncomplete,setLegacyIncomplete] = useState(false);
  const [selected,setSelected] = useState<string>('');
  const [editing,setEditing] = useState<string>('');
  const [draft,setDraft] = useState('');
  const [saving,setSaving] = useState(false);

  const load = useCallback(async (append=false)=>{
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const url='/api/sonara-relay/pro-library'+(append&&cursor?'?cursor='+encodeURIComponent(cursor):'');
      const response=await fetch(url,{credentials:'include',cache:'no-store'});
      const data:ArchiveResponse=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(typeof data.error==='string'?data.error:'Archivio non raggiungibile.');
      const incoming=(data.jobs||[]).filter(x=>idOk(x.jobId)&&x.status==='COMPLETED');
      setItems(previous=>{
        const all=append?[...previous,...incoming]:incoming;
        return [...new Map(all.map(x=>[x.jobId,x])).values()].sort(
          (a,b)=>b.createdAt-a.createdAt).slice(0,300);
      });
      setCursor(data.nextCursor||null);
      setHasMore(data.hasMore===true);
      setLegacyIncomplete(data.legacyScanIncomplete===true);
    } catch(e) {setError(e instanceof Error?e.message:'Errore archivio Remix.');}
    finally {setBusy(false);}
  },[busy,cursor]);

  useEffect(()=>{
    let cancelled=false;
    const run=async()=>{
      try{
        const response=await fetch('/api/sonara-relay/pro-library',
          {credentials:'include',cache:'no-store'});
        const data:ArchiveResponse=await response.json().catch(()=>({}));
        if(cancelled)return;
        if(!response.ok)throw new Error(typeof data.error==='string'?data.error:'Archivio non disponibile.');
        const records=(data.jobs||[]).filter(x=>idOk(x.jobId)&&x.status==='COMPLETED');
        setItems(records.sort((a,b)=>b.createdAt-a.createdAt));
        setCursor(data.nextCursor||null);
        setHasMore(data.hasMore===true);
        setLegacyIncomplete(data.legacyScanIncomplete===true);
        setError('');
      }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Archivio non disponibile.');}
    };
    void run();
    return()=>{cancelled=true;};
  },[refreshToken]);

  const choose=(entry:ArchivedRemix)=>{
    if(!entry.audioUrl||!idOk(entry.jobId))return;
    window.dispatchEvent(new CustomEvent('sonara:generated-track-selected',
      {detail:{variationId:'Remix Pro',jobId:entry.jobId,audioUrl:entry.audioUrl,
        audioFormat:'wav',title:entry.title}}));
    setSelected(entry.jobId);
  };
  const rename=async(entry:ArchivedRemix)=>{
    const title=draft.trim();
    if(!title||title.length>96||!idOk(entry.jobId))return;
    setSaving(true);setError('');
    try{
      const response=await fetch('/api/sonara-relay/pro-job/'+entry.jobId,{
        method:'PATCH',credentials:'include',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({title})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(typeof data.error==='string'?data.error:'Rinomina non riuscita.');
      setItems(previous=>previous.map(x=>x.jobId===entry.jobId?{...x,title:data.title}:x));
      setEditing('');
    }catch(e){setError(e instanceof Error?e.message:'Rinomina non riuscita.');}
    finally{setSaving(false);}
  };

  return (
    <section className="sonara-pro-library" data-testid="sonara-pro-personal-library">
      <header className="sonara-pro-library-head">
        <div className="sonara-pro-library-heading">
          <span className="sonara-pro-library-symbol"><FolderOpen size={19}/></span>
          <span><strong>Il mio archivio Remix</strong>
            <small>I tuoi master completi, privati e disponibili dal tuo account SONARA.</small>
          </span>
        </div>
        <div className="sonara-pro-library-actions">
          <span className="sonara-pro-library-count">{items.length} brani</span>
          <button type="button" onClick={()=>void load()} disabled={busy}
            aria-label="Aggiorna archivio Remix" title="Aggiorna archivio">
            {busy?<LoaderCircle size={16} className="sonara-pro-spin"/>:<RefreshCcw size={16}/>}
          </button>
        </div>
      </header>
      {error&&<p role="alert" className="sonara-pro-library-error">{error}</p>}
      {items.length===0&&!error?
        <div className="sonara-pro-library-empty">
          <AudioLines size={28}/>
          <strong>Il tuo studio personale è pronto</strong>
          <span>Completa una fusione A+B: il master comparirà qui automaticamente.</span>
        </div>:
        <div className="sonara-pro-library-grid">
          {items.map(entry=>
            <article key={entry.jobId} className="sonara-pro-library-card">
              <div className="sonara-pro-library-art"><Music2 size={23}/></div>
              <div className="sonara-pro-library-details">
                {editing===entry.jobId?
                  <form className="sonara-pro-library-rename" onSubmit={e=>{e.preventDefault();void rename(entry);}}>
                    <input autoFocus maxLength={96} aria-label="Titolo del remix"
                      value={draft} onChange={e=>setDraft(e.target.value)}/>
                    <button type="submit" disabled={saving||!draft.trim()} aria-label="Salva titolo"><Check size={15}/></button>
                    <button type="button" onClick={()=>setEditing('')} aria-label="Annulla"><X size={15}/></button>
                  </form>:
                  <div className="sonara-pro-library-title">
                    <strong title={entry.title}>{entry.title}</strong>
                    <button type="button" onClick={()=>{setEditing(entry.jobId);setDraft(entry.title);}}
                      aria-label={'Rinomina '+entry.title}><Pencil size={13}/></button>
                  </div>
                }
                <div className="sonara-pro-library-meta">
                  <span>{entry.engineVersion?.toUpperCase()||'REMIX PRO'}</span>
                  <span>{duration(entry.actualDurationSeconds||entry.requestedDurationSeconds)}</span>
                  <span>{entry.createdAt?new Date(entry.createdAt).toLocaleDateString('it-IT'):'—'}</span>
                </div>
                {entry.audioUrl&&<audio controls preload="none" src={entry.audioUrl}
                  aria-label={'Ascolta '+entry.title}/>}
                <div className="sonara-pro-library-buttons">
                  <button type="button" onClick={()=>choose(entry)} disabled={!entry.audioUrl}>
                    {selected===entry.jobId?<Check size={14}/>:<Play size={14}/>}
                    {selected===entry.jobId?'Nel player':'Usa nel player'}
                  </button>
                  {entry.audioUrl&&onEdit&&<button type="button" data-testid={"sonara-pro-edit-"+entry.jobId}
                    onClick={()=>onEdit({jobId:entry.jobId,title:entry.title,audioUrl:entry.audioUrl!})}>
                    <Pencil size={14}/> Modifica nella timeline
                  </button>}
                  {entry.audioUrl&&<a href={entry.audioUrl} download={safeName(entry.title)}>
                    <Download size={14}/> WAV
                  </a>}
                </div>
              </div>
            </article>
          )}
        </div>
      }
      {(hasMore||legacyIncomplete)&&
        <div className="sonara-pro-library-footer">
          <span>{legacyIncomplete?'Recupero progressivo dei remix precedenti disponibile.':'Altri master presenti nell’archivio.'}</span>
          <button type="button" onClick={()=>void load(hasMore)} disabled={busy}>
            {busy?'Caricamento…':hasMore?'Mostra altri remix':'Recupera brani precedenti'}
          </button>
        </div>}
    </section>
  );
}
