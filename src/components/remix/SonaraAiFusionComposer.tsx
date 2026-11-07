import { useEffect, useRef, useState } from 'react';
import { AudioWaveform, LoaderCircle, Sparkles } from 'lucide-react';

type Job = { jobId?: string; status?: string; error?: string; progress?: number; audioUrl?: string; audioUrls?: string[]; candidates?: Array<{ audioUrl?: string }> };
// Use same-origin Worker route to include the site's HttpOnly session cookie.
const API = '';
const MAX_BYTES = 32 * 1024 * 1024;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default function SonaraAiFusionComposer() {
  const [songA, setSongA] = useState<File | null>(null);
  const [songB, setSongB] = useState<File | null>(null);
  const [strength, setStrength] = useState(55);
  const [bpm, setBpm] = useState(124);
  const [duration, setDuration] = useState(90);
  const [prompt, setPrompt] = useState('Compose an original coherent new song using the main musical structure of A and the style, groove and instrument qualities of B. Recompose melodies, rhythm and harmonic sections as a unified arrangement. No stacked full-length songs, no crossfade-only DJ mix, no two disconnected sections. Natural instruments and professional mastering.');
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [progress, setProgress] = useState(0);
  const disposed = useRef(false);

  useEffect(() => {
    disposed.current = false;
    fetch(API + '/api/sonara-relay/fusion-capabilities', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : {available:false})
      .then(data => { if (!disposed.current) setEnabled(data.available === true); })
      .catch(() => { if (!disposed.current) setEnabled(false); });
    return () => { disposed.current = true; };
  }, []);

  const choose = (file: File | undefined, role: 'a' | 'b') => {
    setError('');
    setAudioUrl('');
    if (!file) { role === 'a' ? setSongA(null) : setSongB(null); return; }
    if (file.size < 10000 || file.size > MAX_BYTES || (!file.type.startsWith('audio/') && !/\.(wav|mp3|flac|ogg|m4a|aac)$/i.test(file.name))) {
      setError('Seleziona un audio WAV, MP3, FLAC o M4A valido, massimo 32 MB.');
      return;
    }
    role === 'a' ? setSongA(file) : setSongB(file);
  };

  const upload = async (file: File) => {
    const response = await fetch(API + '/api/sonara-relay/reference', {
      method: 'POST', credentials: 'include',
      headers: {
        'Content-Type': file.type.startsWith('audio/') ? file.type : 'application/octet-stream',
        'X-Sonara-Reference-Name': file.name.slice(0, 140)
      }, body: file
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !/^sref_[0-9a-f-]{36}$/.test(String(data.referenceId || '')))
      throw new Error(data.error || 'Impossibile caricare il brano: accedi al tuo account SONARA.');
    return String(data.referenceId);
  };

  const generate = async () => {
    if (!songA || !songB || !enabled || busy) return;
    if (songA === songB || (songA.name === songB.name && songA.size === songB.size)) {
      setError('Seleziona due canzoni differenti.'); return;
    }
    setError(''); setAudioUrl(''); setBusy(true); setProgress(0);
    try {
      setMessage('Caricamento privato dei due brani musicali…');
      const ids = await Promise.all([upload(songA), upload(songB)]);
      if (disposed.current) return;
      setMessage('Richiesta generativa AI Fusion alla GPU RTX PRO 6000…');
      const response = await fetch('/api/billing/generate', {
        method: 'POST', credentials: 'include',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          prompt, rawPrompt: prompt, bpm, durationSec: duration,
          generationProfile: 'quality', candidateCount: 1,
          sonaraAiFusion: {
            version: 1, sourceReferenceId: ids[0], styleReferenceId: ids[1],
            structureStrength: strength / 100
          }
        })
      });
      const initial: Job = await response.json().catch(() => ({}));
      if (!response.ok || !/^sr2_[0-9a-f-]{36}$/.test(String(initial.jobId || '')))
        throw new Error(initial.error || 'SONARA non ha avviato la generazione AI Fusion.');
      setMessage('ACE-Step sta creando una reinterpretazione con entrambi i brani…');
      for (let step = 0; step < 360 && !disposed.current; step++) {
        const check = await fetch('/api/billing/job?jobId=' + encodeURIComponent(String(initial.jobId)), {credentials:'include',cache:'no-store'});
        const job: Job = await check.json().catch(() => ({}));
        if (job.status === 'FAILED' || job.status === 'NOT_FOUND') throw new Error(job.error || 'Generazione fallita.');
        if (job.status === 'COMPLETED') {
          const next = job.audioUrl || job.audioUrls?.[0] || job.candidates?.[0]?.audioUrl;
          if (!next) throw new Error('Il motore non ha restituito un WAV.');
          setAudioUrl(next); setProgress(100); setMessage('Brano nuovo generato: ascoltalo e valuta la fusione.'); return;
        }
        if (!check.ok && check.status !== 502) throw new Error(job.error || 'Errore nella lettura del job.');
        setProgress(Math.min(95, Math.max(0, Number(job.progress || 0))));
        await delay(2000);
      }
      if (!disposed.current) throw new Error('Tempo di attesa terminato. La generazione potrebbe continuare sul server.');
    } catch (cause) {
      if (!disposed.current) setError(cause instanceof Error ? cause.message : 'Errore AI Fusion');
    } finally {
      if (!disposed.current) setBusy(false);
    }
  };

  return <div className="sonara-ai-fusion-v1" style={{margin:16,padding:16,border:'1px solid #7864b8',borderRadius:12,background:'#12101d',color:'#eee',display:'grid',gap:12}}>
    <div style={{display:'flex',gap:9,alignItems:'center'}}><Sparkles size={20}/><strong>SONARA AI Fusion — Da due canzoni a un nuovo brano</strong></div>
    <small>AI generativa a doppio riferimento: A guida la struttura, B guida lo stile. Nessuna semplice sovrapposizione o concatenazione.</small>
    <label><strong>BRANO A — struttura e melodia</strong><input style={{display:'block',width:'100%',marginTop:7}} disabled={busy} type="file" accept="audio/*,.wav,.mp3,.flac,.m4a" onChange={e => choose(e.target.files?.[0], 'a')}/></label>
    <label><strong>BRANO B — groove e strumentazione</strong><input style={{display:'block',width:'100%',marginTop:7}} disabled={busy} type="file" accept="audio/*,.wav,.mp3,.flac,.m4a" onChange={e => choose(e.target.files?.[0], 'b')}/></label>
    <label>Influenza struttura A: {strength}% <input style={{width:'100%'}} type="range" min={35} max={80} value={strength} disabled={busy} onChange={e => setStrength(Number(e.target.value))}/></label>
    <label>BPM <input type="number" min={40} max={220} value={bpm} disabled={busy} onChange={e => setBpm(Math.max(40,Math.min(220,Number(e.target.value)||124)))}/></label>
    <label>Durata <select value={duration} disabled={busy} onChange={e => setDuration(Number(e.target.value))}><option value={60}>60 sec</option><option value={90}>90 sec</option><option value={120}>120 sec</option><option value={180}>180 sec</option></select></label>
    <label>Direzione artistica <textarea style={{display:'block',width:'100%',minHeight:95,background:'#211c30',color:'#fff'}} value={prompt} disabled={busy} onChange={e => setPrompt(e.target.value)}/></label>
    <small>Versione sperimentale: doppio condizionamento ACE-Step; non garantisce la presenza riconoscibile di entrambe le melodie. Separazione stems e sincronizzazione armonica non sono ancora incluse. Carica solo audio di cui possiedi i diritti necessari.</small>
    {!enabled && <p style={{color:'#fcd34d'}}>Motore AI Fusion non ancora abilitato sul server. Nessun file verrà caricato finché il backend non sarà pronto.</p>}
    <button type="button" disabled={!enabled || !songA || !songB || busy || !prompt.trim()} onClick={() => void generate()} style={{padding:14,background:'#6d39bb',border:0,borderRadius:9,color:'#fff',fontWeight:800,opacity:(!enabled || busy) ? 0.5 : 1}}>
      {busy ? <LoaderCircle size={15}/> : <AudioWaveform size={15}/>} {busy?'AI Fusion in corso…':'Genera un nuovo brano con AI Fusion'}
    </button>
    {busy && <div role="status">{message} {Math.round(progress)}%</div>}
    {error && <p role="alert" style={{color:'#ffbaba'}}>{error}</p>}
    {audioUrl && <div style={{display:'grid',gap:8}}><strong>Risultato AI Fusion</strong><audio controls src={audioUrl}/><a href={audioUrl} target="_blank" rel="noopener noreferrer">Apri WAV finale</a></div>}
  </div>;
}
