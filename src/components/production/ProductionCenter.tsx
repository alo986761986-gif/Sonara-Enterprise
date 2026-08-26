import React, { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Disc3,
  Download,
  FileAudio,
  Gauge,
  Layers3,
  Loader2,
  Music2,
  SlidersHorizontal,
  Upload,
  Volume2
} from 'lucide-react';
import {
  audioBufferToWav,
  audioExtensionFromUrl,
  decodeAudioFromUrl,
  downloadBlob,
  downloadRealAudio,
  safeAudioFilename,
  type RealAudioAsset
} from './audioUtils';

interface ProductionCenterProps {
  audioUrl?: string;
  audioFormat?: string;
  title?: string;
  onProcessedAudio?: (url: string, metrics: Record<string, any>) => void;
  onOpenMastering?: () => void;
}

const Panel = ({ children, title, icon: Icon, status = 'ACTIVE' }: any) => (
  <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 shadow-xl">
    <div className="mb-5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-2 text-purple-300"><Icon className="h-5 w-5" /></div>
        <h3 className="text-base font-black text-white">{title}</h3>
      </div>
      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-black tracking-wider text-emerald-300">{status}</span>
    </div>
    {children}
  </section>
);

function MixingConsole({ audioUrl, title, onProcessedAudio }: ProductionCenterProps) {
  const [inputGain, setInputGain] = useState(0);
  const [pan, setPan] = useState(0);
  const [compression, setCompression] = useState(35);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const renderMix = async () => {
    if (!audioUrl || busy) return;
    setBusy(true);
    setNotice('');
    try {
      const decoded = await decodeAudioFromUrl(audioUrl);
      const OfflineContext = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
      if (!OfflineContext) throw new Error('Offline Web Audio non supportato.');
      const offline = new OfflineContext(Math.min(2, decoded.numberOfChannels || 1), decoded.length, decoded.sampleRate);
      const source = offline.createBufferSource();
      source.buffer = decoded;
      const gain = offline.createGain();
      gain.gain.value = Math.pow(10, inputGain / 20);
      const compressorNode = offline.createDynamicsCompressor();
      compressorNode.threshold.value = -8 - compression * 0.32;
      compressorNode.knee.value = 18;
      compressorNode.ratio.value = 1 + compression * 0.07;
      compressorNode.attack.value = 0.01;
      compressorNode.release.value = 0.18;

      const panner = typeof offline.createStereoPanner === 'function' ? offline.createStereoPanner() : null;
      if (panner) panner.pan.value = pan / 100;

      source.connect(gain);
      gain.connect(compressorNode);
      if (panner) {
        compressorNode.connect(panner);
        panner.connect(offline.destination);
      } else {
        compressorNode.connect(offline.destination);
      }
      source.start(0);
      const rendered = await offline.startRendering();
      const blob = audioBufferToWav(rendered);
      const url = URL.createObjectURL(blob);
      onProcessedAudio?.(url, {
        stage: 'mixing',
        inputGainDb: inputGain,
        panPercent: pan,
        compressionPercent: compression,
        sampleRate: rendered.sampleRate,
        channels: rendered.numberOfChannels,
        format: 'wav'
      });
      setNotice('Mix DSP renderizzato in WAV reale e impostato come master corrente.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Mixing Console" icon={SlidersHorizontal}>
      <div className="space-y-4">
        <label className="block text-xs font-bold text-slate-300">Input gain <span className="float-right text-purple-300">{inputGain.toFixed(1)} dB</span><input className="mt-2 w-full accent-purple-500" type="range" min={-12} max={12} step={0.5} value={inputGain} onChange={event => setInputGain(Number(event.target.value))} /></label>
        <label className="block text-xs font-bold text-slate-300">Panorama <span className="float-right text-purple-300">{pan === 0 ? 'C' : pan < 0 ? `${Math.abs(pan)}L` : `${pan}R`}</span><input className="mt-2 w-full accent-purple-500" type="range" min={-100} max={100} step={1} value={pan} onChange={event => setPan(Number(event.target.value))} /></label>
        <label className="block text-xs font-bold text-slate-300">Compressione <span className="float-right text-purple-300">{compression}%</span><input className="mt-2 w-full accent-purple-500" type="range" min={0} max={100} step={1} value={compression} onChange={event => setCompression(Number(event.target.value))} /></label>
        <button onClick={renderMix} disabled={!audioUrl || busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />} Render Mix WAV</button>
        {!audioUrl && <p className="text-[10px] leading-5 text-amber-300">Genera o carica un brano prima di usare il mixer.</p>}
        {notice && <p className="text-[10px] leading-5 text-slate-400">{notice}</p>}
      </div>
    </Panel>
  );
}

function MasteringPanel({ audioUrl, audioFormat, onOpenMastering }: ProductionCenterProps) {
  return (
    <Panel title="Mastering" icon={Disc3}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3"><div className="text-[9px] uppercase tracking-wider text-slate-500">Target</div><div className="mt-1 text-sm font-black text-white">-14 LUFS</div></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3"><div className="text-[9px] uppercase tracking-wider text-slate-500">True Peak</div><div className="mt-1 text-sm font-black text-white">-1 dBTP</div></div>
        </div>
        <p className="text-[10px] leading-5 text-slate-400">Apre il mastering professionale SONARA già collegato al DSP reale: EQ a 26 bande, gain, loudness, true peak e WAV processato.</p>
        <button onClick={onOpenMastering} disabled={!audioUrl} className="flex w-full items-center justify-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-3 text-xs font-black text-purple-100 disabled:opacity-40"><Gauge className="h-4 w-4" /> Apri Mastering Professionale</button>
        <div className="text-[10px] text-slate-500">Master corrente: {audioUrl ? String(audioFormat || audioExtensionFromUrl(audioUrl, 'wav')).toUpperCase() : 'nessuno'}</div>
      </div>
    </Panel>
  );
}

function StemManager({ title }: ProductionCenterProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [stems, setStems] = useState<RealAudioAsset[]>([]);

  const importStems = (files: FileList | null) => {
    if (!files?.length) return;
    const next = Array.from(files).filter(file => file.type.startsWith('audio/') || /\.(wav|mp3|flac|ogg|m4a|aac)$/i.test(file.name)).map((file, index) => ({
      id: `local-${Date.now()}-${index}`,
      label: file.name.replace(/\.[^.]+$/, ''),
      url: URL.createObjectURL(file),
      format: file.name.split('.').pop()?.toLowerCase() || 'audio',
      source: 'local' as const
    }));
    setStems(current => [...current, ...next]);
  };

  return (
    <Panel title="Stem Manager" icon={Layers3}>
      <input ref={inputRef} type="file" accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a,.aac" multiple className="hidden" onChange={event => importStems(event.target.files)} />
      <button onClick={() => inputRef.current?.click()} className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-xs font-black text-cyan-100"><Upload className="h-4 w-4" /> Importa stem reali</button>
      {stems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-800 p-4 text-[10px] leading-5 text-slate-500">Nessuno stem reale disponibile. SONARA non crea nomi o file fittizi: importa WAV/FLAC/MP3 separati e verranno gestiti qui.</div>
      ) : (
        <div className="max-h-52 space-y-2 overflow-auto pr-1">
          {stems.map(stem => (
            <div key={stem.id} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <FileAudio className="h-4 w-4 shrink-0 text-cyan-300" />
              <div className="min-w-0 flex-1"><div className="truncate text-xs font-bold text-white">{stem.label}</div><div className="text-[9px] uppercase text-slate-500">{stem.format}</div></div>
              <audio controls preload="metadata" src={stem.url} className="h-8 w-40 max-w-[45%]" />
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 text-[9px] text-slate-600">Sessione: {safeAudioFilename(title || 'SONARA')}</div>
    </Panel>
  );
}

function ExportCenter({ audioUrl, audioFormat, title }: ProductionCenterProps) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const realFormat = useMemo(() => audioUrl ? audioExtensionFromUrl(audioUrl, audioFormat || 'wav') : String(audioFormat || 'wav').toLowerCase(), [audioUrl, audioFormat]);

  const exportMaster = async () => {
    if (!audioUrl || busy) return;
    setBusy(true);
    setNotice('');
    try {
      const exported = await downloadRealAudio(audioUrl, `${title || 'sonara-track'}-master`, realFormat);
      setNotice(`Esportato master reale in ${exported.toUpperCase()}. Nessuna estensione rinominata artificialmente.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const exportProcessedWavCopy = async () => {
    if (!audioUrl || busy) return;
    setBusy(true);
    setNotice('');
    try {
      const decoded = await decodeAudioFromUrl(audioUrl);
      const wav = audioBufferToWav(decoded);
      downloadBlob(wav, `${title || 'sonara-track'}-pcm16`, 'wav');
      setNotice('Creato ed esportato WAV PCM 16-bit reale dal master corrente.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Export Center" icon={Download}>
      <div className="space-y-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3"><div className="text-[9px] uppercase tracking-wider text-slate-500">Formato master disponibile</div><div className="mt-1 flex items-center gap-2 text-sm font-black text-white"><Music2 className="h-4 w-4 text-purple-300" /> {audioUrl ? realFormat.toUpperCase() : 'NESSUN AUDIO'}</div></div>
        <button onClick={exportMaster} disabled={!audioUrl || busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Scarica master originale</button>
        <button onClick={exportProcessedWavCopy} disabled={!audioUrl || busy} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-xs font-black text-slate-200 disabled:opacity-40"><FileAudio className="h-4 w-4" /> Esporta WAV PCM reale</button>
        {notice && <div className="flex gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-[10px] leading-5 text-emerald-200"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />{notice}</div>}
      </div>
    </Panel>
  );
}

export const ProductionCenter: React.FC<ProductionCenterProps> = props => (
  <div className="space-y-6">
    <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-6 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-black text-white">SONARA Production Suite</h2><p className="mt-1 text-xs text-slate-400">Mix, mastering, stems ed export collegati ad audio reale.</p></div>
        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-black tracking-wider text-emerald-300">PRODUCTION ACTIVE</span>
      </div>
    </div>
    <div className="grid gap-5 xl:grid-cols-2">
      <MixingConsole {...props} />
      <MasteringPanel {...props} />
      <StemManager {...props} />
      <ExportCenter {...props} />
    </div>
  </div>
);
