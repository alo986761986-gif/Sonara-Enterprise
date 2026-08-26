import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, CheckCircle2, Headphones, Loader2, Mic2, RefreshCw, Volume2 } from 'lucide-react';

const ROUTING_KEY = 'sonara.dj.audio-routing.v1';

type RoutingState = { masterOutput: string; cueOutput: string; input: string };
const defaultRouting: RoutingState = { masterOutput: 'default', cueOutput: 'default', input: 'default' };

export default function DJAudioRouting() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [routing, setRouting] = useState<RoutingState>(() => {
    try { return { ...defaultRouting, ...JSON.parse(localStorage.getItem(ROUTING_KEY) || '{}') }; } catch { return defaultRouting; }
  });
  const [status, setStatus] = useState('Premi SCANSIONA AUDIO per autorizzare e leggere le interfacce disponibili.');
  const [busy, setBusy] = useState(false);
  const testAudioRef = useRef<HTMLAudioElement | null>(null);

  const outputs = devices.filter(device => device.kind === 'audiooutput');
  const inputs = devices.filter(device => device.kind === 'audioinput');
  const sinkSupported = typeof HTMLMediaElement !== 'undefined' && typeof (HTMLMediaElement.prototype as any).setSinkId === 'function';
  const contextSinkSupported = typeof AudioContext !== 'undefined' && typeof (AudioContext.prototype as any).setSinkId === 'function';

  const publishRouting = (next: RoutingState) => {
    window.dispatchEvent(new CustomEvent('sonara:dj-audio-routing', { detail: next }));
  };

  const save = (patch: Partial<RoutingState>) => {
    const next = { ...routing, ...patch };
    setRouting(next);
    localStorage.setItem(ROUTING_KEY, JSON.stringify(next));
    publishRouting(next);
  };

  useEffect(() => {
    publishRouting(routing);
  }, []);

  const scan = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) { setStatus('Il browser non espone MediaDevices. Usa SONARA DJ Bridge per ispezionare l’hardware audio professionale.'); return; }
    setBusy(true);
    let stream: MediaStream | null = null;
    try {
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); } catch { /* labels can still be partially available */ }
      const found = await navigator.mediaDevices.enumerateDevices();
      setDevices(found);
      const outputCount = found.filter(item => item.kind === 'audiooutput').length;
      const inputCount = found.filter(item => item.kind === 'audioinput').length;
      setStatus(`${outputCount} uscite e ${inputCount} ingressi rilevati. Il browser mostra solo ciò che il sistema operativo espone.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Scansione audio non riuscita.');
    } finally {
      stream?.getTracks().forEach(track => track.stop());
      setBusy(false);
    }
  };

  useEffect(() => {
    const handler = () => { void scan(); };
    navigator.mediaDevices?.addEventListener?.('devicechange', handler);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', handler);
  }, []);

  const testOutput = async (deviceId: string) => {
    if (!sinkSupported) { setStatus('Questo browser non consente di scegliere l’uscita con setSinkId.'); return; }
    if (typeof AudioContext === 'undefined') { setStatus('Web Audio non è disponibile in questo browser.'); return; }
    try {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const destination = ctx.createMediaStreamDestination();
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.33);
      oscillator.connect(gain).connect(destination);
      const audio = new Audio();
      testAudioRef.current = audio;
      audio.srcObject = destination.stream;
      await (audio as any).setSinkId(deviceId || 'default');
      oscillator.start(); oscillator.stop(ctx.currentTime + 0.35);
      await audio.play();
      window.setTimeout(() => { audio.pause(); audio.srcObject = null; void ctx.close(); }, 500);
      setStatus('Test uscita inviato correttamente.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Test uscita non riuscito.');
    }
  };

  const latency = useMemo(() => {
    if (typeof AudioContext === 'undefined') return 'non disponibile';
    try {
      const ctx = new AudioContext({ latencyHint: 'interactive' }) as AudioContext & { outputLatency?: number };
      const value = (ctx.baseLatency || 0) + (ctx.outputLatency || 0);
      void ctx.close();
      return value > 0 ? `${(value * 1000).toFixed(1)} ms` : 'non dichiarata';
    } catch { return 'non disponibile'; }
  }, [devices.length]);

  const labelFor = (device: MediaDeviceInfo, index: number) => device.label || `${device.kind === 'audiooutput' ? 'Output' : 'Input'} ${index + 1}`;

  return <section className="rounded-3xl border border-cyan-500/15 bg-slate-900/50 p-4 sm:p-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2"><AudioLines className="h-4 w-4 text-cyan-300"/><h2 className="text-sm font-black text-white">Professional Audio Routing</h2></div><p className="mt-1 text-[10px] text-slate-500">SONARA usa le uscite realmente selezionabili dal browser. ASIO/CoreAudio/WASAPI multicanale completo verrà marcato operativo solo con un adapter Bridge di streaming audio realmente implementato e verificato.</p></div><button onClick={() => void scan()} disabled={busy} className="flex items-center justify-center gap-2 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-2.5 text-[9px] font-black text-cyan-100 disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <RefreshCw className="h-3.5 w-3.5"/>} SCANSIONA AUDIO</button></div>
    <div className="mt-4 grid gap-3 lg:grid-cols-3"><label className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><span className="flex items-center gap-2 text-[9px] font-black text-slate-400"><Volume2 className="h-3.5 w-3.5 text-fuchsia-300"/> MASTER OUTPUT</span><select value={routing.masterOutput} onChange={e => save({ masterOutput: e.target.value })} className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-900 px-2 py-2 text-[9px] text-white"><option value="default">Sistema predefinito</option>{outputs.map((device,index)=><option key={device.deviceId} value={device.deviceId}>{labelFor(device,index)}</option>)}</select><button disabled={!sinkSupported} onClick={() => void testOutput(routing.masterOutput)} className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-900 px-2 py-2 text-[8px] font-black text-slate-400 disabled:opacity-40">TEST MASTER</button></label>
      <label className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><span className="flex items-center gap-2 text-[9px] font-black text-slate-400"><Headphones className="h-3.5 w-3.5 text-cyan-300"/> CUE / BOOTH OUTPUT</span><select value={routing.cueOutput} onChange={e => save({ cueOutput: e.target.value })} className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-900 px-2 py-2 text-[9px] text-white"><option value="default">Sistema predefinito</option>{outputs.map((device,index)=><option key={device.deviceId} value={device.deviceId}>{labelFor(device,index)}</option>)}</select><button disabled={!sinkSupported} onClick={() => void testOutput(routing.cueOutput)} className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-900 px-2 py-2 text-[8px] font-black text-slate-400 disabled:opacity-40">TEST CUE</button></label>
      <label className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><span className="flex items-center gap-2 text-[9px] font-black text-slate-400"><Mic2 className="h-3.5 w-3.5 text-amber-300"/> AUDIO INPUT</span><select value={routing.input} onChange={e => save({ input: e.target.value })} className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-900 px-2 py-2 text-[9px] text-white"><option value="default">Sistema predefinito</option>{inputs.map((device,index)=><option key={device.deviceId} value={device.deviceId}>{labelFor(device,index)}</option>)}</select><div className="mt-2 rounded-lg border border-slate-800 bg-slate-900 px-2 py-2 text-center text-[8px] font-black text-slate-500">MIC / LINE DEVICE</div></label></div>
    <div className="mt-4 grid gap-2 sm:grid-cols-3"><div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><div className="text-[8px] font-black text-slate-600">OUTPUT SELECTION</div><div className={`mt-1 flex items-center gap-1 text-[9px] font-black ${sinkSupported ? 'text-emerald-300' : 'text-slate-600'}`}>{sinkSupported ? <CheckCircle2 className="h-3 w-3"/> : null}{sinkSupported ? 'SUPPORTED' : 'BRIDGE ADAPTER NEEDED'}</div></div><div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><div className="text-[8px] font-black text-slate-600">AUDIOCONTEXT SINK</div><div className={`mt-1 text-[9px] font-black ${contextSinkSupported ? 'text-emerald-300' : 'text-slate-600'}`}>{contextSinkSupported ? 'SUPPORTED' : 'DEFAULT OUTPUT'}</div></div><div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><div className="text-[8px] font-black text-slate-600">DECLARED LATENCY</div><div className="mt-1 text-[9px] font-black text-white">{latency}</div></div></div>
    <div className="mt-3 rounded-xl border border-slate-800 bg-black/20 px-3 py-2 text-[9px] text-slate-500">{status}</div>
  </section>;
}
