import { useEffect, useRef, useState } from 'react';
import { AudioLines, Download, LoaderCircle, Pause, Play, RotateCcw, Scissors, SlidersHorizontal, Volume2 } from 'lucide-react';
import {
  encodeWav24, renderRemixSelection, resolveRemixSelection, waveformBins,
  type RemixEditSettings,
} from './sonaraRemixAudioEngine';
import './SonaraRemixProEditor.css';

export type RemixEditorTrack = {
  jobId: string;
  title: string;
  audioUrl: string;
};
const DEFAULTS = {fadeIn: 0, fadeOut: 0, bass: 0, mid: 0, treble: 0, loop: false} as const;
const secLabel = (value: number) => {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  const whole = Math.floor(safe);
  return Math.floor(whole / 60) + ':' + String(whole % 60).padStart(2, '0') +
    '.' + String(Math.round((safe - whole) * 1000)).padStart(3, '0');
};
const safeFilename = (title: string, loop: boolean) =>
  (title.normalize('NFKD').replace(/[^a-zA-Z0-9 _-]/g, '').trim()
    .replace(/\s+/g, '-') || 'SONARA-REMIX') +
  (loop ? '-LOOP' : '-EDIT') + '.wav';
const bytesLimit = 256 * 1024 * 1024;
const editorTrackId = (value: string) => /^srpro_[0-9a-f-]{36}$/.test(value);
const finite = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));

export default function SonaraRemixProEditor({track}:{track: RemixEditorTrack | null}) {
  const [audio, setAudio] = useState<AudioBuffer | null>(null);
  const [settings, setSettings] = useState<RemixEditSettings>({
    start:0, end:0, ...DEFAULTS,
  });
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState('');
  const [marker, setMarker] = useState<'start'|'end'>('start');
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const previewUrlRef = useRef('');
  const loadingRef = useRef(0);
  const peakRef = useRef<Float32Array | null>(null);

  // Fetch only the private SONARA job URL; never follow an external audio
  // destination or expose source recordings to a third-party editor.
  useEffect(() => {
    const id = ++loadingRef.current;
    let cancelled = false;
    if (audioRef.current) audioRef.current.pause();
    if (previewUrlRef.current) { URL.revokeObjectURL(previewUrlRef.current); previewUrlRef.current=''; }
    setAudio(null); setPreview(''); setPosition(0); setPlaying(false);
    setSettings({start:0,end:0,...DEFAULTS}); setError(''); setNotice('');
    peakRef.current = null;
    if (!track || !editorTrackId(track.jobId) ||
        track.audioUrl !== '/api/sonara-relay/pro-job/'+track.jobId+'/audio') {
      if (track) setError('Il file selezionato non è un master privato SONARA valido.');
      return;
    }
    const controller = new AbortController();
    void (async () => {
      setBusy(true);
      let context: AudioContext | null = null;
      try {
        const response = await fetch(track.audioUrl, {
          credentials:'include', cache:'no-store', signal:controller.signal,
          redirect:'error',
        });
        if (!response.ok) throw new Error('Non riesco a leggere il master privato: HTTP '+response.status);
        const length = Number(response.headers.get('content-length') || 0);
        if (length > bytesLimit) throw new Error('Master troppo grande per la modifica nel browser (limite 256 MiB).');
        const raw = await response.arrayBuffer();
        if (raw.byteLength > bytesLimit) throw new Error('Master troppo grande per la modifica nel browser.');
        if (raw.byteLength < 44) throw new Error('Il master WAV è incompleto.');
        context = new AudioContext();
        const decoded = await context.decodeAudioData(raw);
        if (!decoded.length || !Number.isFinite(decoded.duration) ||
            decoded.numberOfChannels < 1 || decoded.numberOfChannels > 2)
          throw new Error('Il master non contiene audio PCM mono/stereo leggibile.');
        // Guard decoded memory usage independently of transfer size.
        if (decoded.length * decoded.numberOfChannels * 4 > 256 * 1024 * 1024)
          throw new Error('Il master decodificato supera la memoria sicura dell’editor.');
        if (cancelled || loadingRef.current !== id) return;
        peakRef.current = waveformBins(decoded);
        setAudio(decoded);
        setSettings({start:0,end:decoded.duration,...DEFAULTS});
        setNotice('Master originale caricato. Le modifiche non cambiano il brano nell’archivio.');
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Impossibile aprire l’editor audio.');
      } finally {
        if (context) await context.close().catch(()=>{});
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {cancelled = true; controller.abort();};
  }, [track?.jobId, track?.audioUrl]);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const selected = audio ? resolveRemixSelection(audio.duration, settings) : null;
  const patch = (partial: Partial<RemixEditSettings>) => {
    if (!audio) return;
    setSettings(previous => {
      const next = {...previous,...partial};
      const safe = resolveRemixSelection(audio.duration, next);
      return {...next,
        start:safe.start,end:safe.end,fadeIn:safe.fadeIn,fadeOut:safe.fadeOut,
        bass:safe.bass,mid:safe.mid,treble:safe.treble,
      };
    });
    if (audioRef.current) audioRef.current.pause();
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = '';
    }
    setPreview('');setPlaying(false);setPosition(0);
    setNotice('Modifiche aggiornate. Premi «Applica e ascolta» per verificare il risultato.');
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audio || !selected || !peakRef.current) return;
    const cssWidth = Math.max(280, canvas.clientWidth || 720);
    const width = Math.min(1600, Math.round(cssWidth * Math.min(2, window.devicePixelRatio || 1)));
    const height = 150;
    canvas.width = width;canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const bins=peakRef.current;
    ctx.clearRect(0,0,width,height);
    ctx.fillStyle='#12111a';ctx.fillRect(0,0,width,height);
    const first=Math.round(selected.start/audio.duration*width);
    const last=Math.round(selected.end/audio.duration*width);
    ctx.fillStyle='#221b35';ctx.fillRect(first,0,Math.max(1,last-first),height);
    const mid=height/2;
    for(let x=0;x<width;x++){
      const idx=Math.min(bins.length-1,Math.floor(x/width*bins.length));
      const value=Math.max(.014,bins[idx]);
      const level=value*(height*.44);
      ctx.fillStyle=x<first||x>last?'#494354':'#b695ed';
      ctx.fillRect(x,mid-level,Math.max(1,width/bins.length*.65),level*2);
    }
    ctx.strokeStyle='#98e6ce';ctx.lineWidth=2;
    for(const px of [first,last]) {ctx.beginPath();ctx.moveTo(px,0);ctx.lineTo(px,height);ctx.stroke();}
    ctx.strokeStyle='#f8fafc';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(Math.round(finite(position/audio.duration,0,1)*width),0);
    ctx.lineTo(Math.round(finite(position/audio.duration,0,1)*width),height);ctx.stroke();
  },[audio,settings,position,selected?.start,selected?.end]);

  const moveMarker = (clientX:number) => {
    if (!audio || !selected || !canvasRef.current) return;
    const bounds=canvasRef.current.getBoundingClientRect();
    const seconds=finite((clientX-bounds.left)/bounds.width*audio.duration,0,audio.duration);
    if (marker==='start') patch({start:Math.min(seconds,selected.end-.25)});
    else patch({end:Math.max(seconds,selected.start+.25)});
  };

  const compile = async () => {
    if (!audio) throw new Error('Carica prima un master audio.');
    const rendered = await renderRemixSelection(audio,settings);
    const exportData = encodeWav24(rendered);
    if (rendered.length === 0 || exportData.blob.size < 44)
      throw new Error('Non è stato possibile produrre il WAV.');
    return exportData;
  };
  const apply = async () => {
    if (processing || !audio) return;
    setProcessing(true);setError('');
    const trackGeneration=loadingRef.current;
    try {
      const encoded=await compile();
      if(trackGeneration!==loadingRef.current) return;
      const url=URL.createObjectURL(encoded.blob);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current=url;setPreview(url);setPosition(0);setPlaying(false);
      setNotice('Anteprima pronta: ascolta con le dissolvenze e l’EQ applicati. Il master originale resta intatto.');
    } catch(cause) {
      setError(cause instanceof Error?cause.message:'Elaborazione audio non riuscita.');
    } finally {setProcessing(false);}
  };
  const download = async () => {
    if (processing || !audio || !track) return;
    setProcessing(true);setError('');
    try {
      // Always re-render the CURRENT controls: no stale previews get exported.
      const encoded=await compile();
      const url=URL.createObjectURL(encoded.blob);
      const link=document.createElement('a');
      link.href=url;link.download=safeFilename(track.title,settings.loop);
      document.body.appendChild(link);link.click();link.remove();
      // Delay URL cleanup to allow mobile browsers to initiate the download.
      window.setTimeout(()=>URL.revokeObjectURL(url),60000);
      setNotice('Download WAV 24-bit richiesto al browser. Il file editato resta sul dispositivo; il master nell’archivio non viene sostituito.');
    } catch(cause) {setError(cause instanceof Error?cause.message:'Esportazione WAV non riuscita.');}
    finally {setProcessing(false);}
  };
  const reset = () => {
    if (!audio) return;
    patch({start:0,end:audio.duration,...DEFAULTS});
    setNotice('Modifiche ripristinate ai valori originali.');
  };

  return (
    <section className="sonara-pro-editor" data-testid="sonara-remix-pro-audio-editor">
      <header className="sonara-pro-editor-header">
        <span className="sonara-pro-editor-icon"><AudioLines size={20}/></span>
        <div>
          <strong>Timeline · SONARA Audio Editor</strong>
          <small>Taglio preciso, loop, dissolvenze e equalizzazione. Nessuna modifica al master originale.</small>
        </div>
        <span className="sonara-pro-editor-chip">WAV 24 BIT</span>
      </header>
      {!track && <div className="sonara-pro-editor-idle">Scegli «Modifica nella timeline» su un brano completato o nel tuo archivio.</div>}
      {track && <>
        <div className="sonara-pro-editor-name">
          <Volume2 size={17}/>
          <strong>{track.title}</strong>
          <span>{audio ? secLabel(audio.duration) : 'Caricamento'}</span>
        </div>
        {busy && <div className="sonara-pro-editor-loading"><LoaderCircle size={16}/> Decodifica privata del master in corso…</div>}
        {error && <p role="alert" className="sonara-pro-editor-error">{error}</p>}
        {audio && selected && <>
          <div className="sonara-pro-editor-timeline">
            <div className="sonara-pro-editor-canvas-top">
              <strong>Forma d’onda</strong>
              <span>Intervallo selezionato: {secLabel(selected.seconds)}</span>
            </div>
            <canvas
              ref={canvasRef} className="sonara-pro-editor-waveform" height={150}
              role="img" aria-label="Forma d’onda musicale con marcatori di inizio e fine"
              onClick={event=>moveMarker(event.clientX)}
              data-testid="sonara-pro-waveform"/>
            <div className="sonara-pro-editor-time-row">
              <span>0:00.000</span><span>Selezione {secLabel(selected.start)} – {secLabel(selected.end)}</span>
              <span>{secLabel(audio.duration)}</span>
            </div>
            <fieldset className="sonara-pro-editor-markers">
              <legend>Il clic sulla forma d’onda imposta</legend>
              <label><input type="radio" name="sonara-pro-marker" checked={marker==='start'} onChange={()=>setMarker('start')}/> Inizio taglio</label>
              <label><input type="radio" name="sonara-pro-marker" checked={marker==='end'} onChange={()=>setMarker('end')}/> Fine taglio</label>
            </fieldset>
            <div className="sonara-pro-editor-trim">
              <label>Inizio (secondi)
                <input type="number" step="0.001" min="0" max={Math.max(0,audio.duration-.25)}
                  data-testid="sonara-pro-trim-start" value={selected.start}
                  onChange={event=>patch({start:Number(event.target.value)})}/>
              </label>
              <label>Fine (secondi)
                <input type="number" step="0.001" min=".25" max={audio.duration}
                  data-testid="sonara-pro-trim-end" value={selected.end}
                  onChange={event=>patch({end:Number(event.target.value)})}/>
              </label>
              <label className="sonara-pro-editor-loop">
                <input type="checkbox" checked={settings.loop} data-testid="sonara-pro-loop"
                  onChange={event=>patch({loop:event.target.checked})}/>
                <span><strong>Loop continuo</strong><small>Ripeti l’intervallo durante l’ascolto; esporta un singolo ciclo WAV.</small></span>
              </label>
            </div>
          </div>
          <div className="sonara-pro-editor-panels">
            <fieldset className="sonara-pro-editor-panel">
              <legend><Scissors size={16}/> Dissolvenze</legend>
              <label>Dissolvenza iniziale <strong>{selected.fadeIn.toFixed(3)} s</strong>
                <input type="range" min="0" max={Math.min(120,selected.seconds)} step=".1"
                  value={selected.fadeIn} onChange={event=>patch({fadeIn:Number(event.target.value)})}/>
                <input type="number" min="0" max={Math.min(120,selected.seconds)} step=".001"
                  data-testid="sonara-pro-fade-in" value={selected.fadeIn}
                  onChange={event=>patch({fadeIn:Number(event.target.value)})}/>
              </label>
              <label>Dissolvenza finale <strong>{selected.fadeOut.toFixed(3)} s</strong>
                <input type="range" min="0" max={Math.min(120,selected.seconds-selected.fadeIn)}
                  step=".1" value={selected.fadeOut}
                  onChange={event=>patch({fadeOut:Number(event.target.value)})}/>
                <input type="number" min="0" max={Math.min(120,selected.seconds-selected.fadeIn)}
                  step=".001" value={selected.fadeOut} data-testid="sonara-pro-fade-out"
                  onChange={event=>patch({fadeOut:Number(event.target.value)})}/>
              </label>
              <small>Il fade viene applicato esattamente al segmento esportato. Per i loop senza fade è previsto un breve bordo anti-click.</small>
            </fieldset>
            <fieldset className="sonara-pro-editor-panel">
              <legend><SlidersHorizontal size={16}/> Equalizzatore professionale</legend>
              {([
                ['bass','Bassi','140 Hz · Low Shelf'],
                ['mid','Medi','1 kHz · Peaking'],
                ['treble','Alti','6.5 kHz · High Shelf'],
              ] as const).map(([field,label,description])=>
                <label key={field} className="sonara-pro-editor-eq-control">
                  <span><strong>{label}</strong><small>{description}</small><em>{settings[field]>0?'+':''}{settings[field]} dB</em></span>
                  <input type="range" min="-12" max="12" step=".5"
                    data-testid={'sonara-pro-eq-'+field}
                    value={settings[field]} onChange={event=>patch({[field]:Number(event.target.value)})}/>
                </label>
              )}
              <small>Filtri DSP reali a tre bande, da −12 a +12 dB, con attenuazione automatica del picco se necessaria.</small>
            </fieldset>
          </div>
          <div className="sonara-pro-editor-transport">
            <div className="sonara-pro-editor-buttons">
              <button type="button" onClick={()=>void apply()} disabled={processing}
                data-testid="sonara-pro-preview-render">
                {processing?<LoaderCircle size={16}/>:<Play size={16}/>} Applica e ascolta
              </button>
              <button type="button" onClick={reset} disabled={processing}>
                <RotateCcw size={15}/> Ripristina
              </button>
            </div>
            {preview&&<div className="sonara-pro-editor-playback">
              <audio ref={audioRef} controls src={preview} loop={settings.loop} preload="auto"
                onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)}
                onTimeUpdate={event=>setPosition(selected.start+event.currentTarget.currentTime)}
                onEnded={()=>setPlaying(false)}
                aria-label="Anteprima modificata del remix"/>
              <span>{playing?<Pause size={14}/>:<Play size={14}/>} {settings.loop?'Anteprima in loop':'Anteprima modificata'}</span>
            </div>}
            <button type="button" className="sonara-pro-editor-export"
              data-testid="sonara-pro-export-wav" onClick={()=>void download()} disabled={processing}>
              <Download size={18}/> Salva sul dispositivo · WAV 24-bit
            </button>
          </div>
          {notice && <small role="status" className="sonara-pro-editor-notice">{notice}</small>}
          <small className="sonara-pro-editor-privacy">Elaborazione locale nel browser: nessun nuovo job MoLab, nessun addebito e nessuna sovrascrittura del master originale.</small>
        </>}
      </>}
    </section>
  );
}
