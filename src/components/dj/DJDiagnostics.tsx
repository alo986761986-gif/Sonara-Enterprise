import React, { useMemo, useState } from 'react';
import { Activity, CheckCircle2, CircleAlert, RefreshCw, ShieldCheck } from 'lucide-react';
import { useDJBridge } from './useDJBridge';

type Check = { label: string; ok: boolean; detail: string; warn?: boolean; optional?: boolean };

export default function DJDiagnostics() {
  const bridge = useDJBridge();
  const [refreshKey, setRefreshKey] = useState(0);
  const checks = useMemo<Check[]>(() => {
    const audioContext = typeof AudioContext !== 'undefined';
    const ctx = audioContext ? new AudioContext({ latencyHint: 'interactive' }) as AudioContext & { outputLatency?: number } : null;
    const base = ctx?.baseLatency || 0; const out = ctx?.outputLatency || 0;
    if (ctx) void ctx.close();
    return [
      { label: 'Secure Context', ok: window.isSecureContext, detail: window.isSecureContext ? 'HTTPS/localhost sicuro.' : 'Web MIDI/HID possono essere limitati senza HTTPS.' },
      { label: 'Web MIDI', ok: typeof (navigator as any).requestMIDIAccess === 'function', detail: 'Controlli, pad, fader, knob e MIDI OUT.' },
      { label: 'Web HID', ok: Boolean((navigator as any).hid), detail: 'Dispositivi HID accessibili con consenso esplicito.' },
      { label: 'Web USB', ok: Boolean((navigator as any).usb), detail: 'Disponibilità API USB; non sostituisce i driver audio/HID del produttore.' },
      { label: 'MediaDevices', ok: Boolean(navigator.mediaDevices?.enumerateDevices), detail: 'Enumerazione input/output audio del sistema.' },
      { label: 'Output Selection', ok: typeof (HTMLMediaElement.prototype as any).setSinkId === 'function', detail: 'Selezione device audio per test/uscite browser.' },
      { label: 'Web Audio', ok: audioContext, detail: audioContext ? `Base/output latency dichiarata: ${((base + out) * 1000).toFixed(1)} ms.` : 'AudioContext non disponibile.' },
      { label: 'DJ Bridge (opzionale)', ok: bridge.state === 'online', optional: bridge.state !== 'online', warn: bridge.state === 'connecting', detail: bridge.state === 'online' ? `Bridge ${bridge.bridgeVersion || 'v2'} · RTT ${bridge.latencyMs?.toFixed(1) || '—'} ms · ${bridge.devices.length} device.` : bridge.state === 'connecting' ? 'Connessione manuale al DJ Bridge…' : 'Componente opzionale non installato. La modalità Browser rimane attiva.' }
    ];
  }, [bridge.state, bridge.bridgeVersion, bridge.latencyMs, bridge.devices.length, bridge.lastError, refreshKey]);
  const requiredChecks = checks.filter(item => !item.optional);
  const score = Math.round((requiredChecks.filter(item => item.ok).length / requiredChecks.length) * 100);

  return <section className="rounded-3xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2"><Activity className="h-4 w-4 text-emerald-300"/><h2 className="text-sm font-black text-white">DJ System Diagnostics</h2><span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[8px] font-black text-emerald-300">{score}% READY</span></div><p className="mt-1 text-[10px] text-slate-500">Controllo browser, audio e hardware API. Il Bridge locale è facoltativo.</p></div><button onClick={() => setRefreshKey(value => value + 1)} className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-[9px] font-black text-slate-300"><RefreshCw className="h-3.5 w-3.5"/> RICONTROLLA</button></div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{checks.map(check => <div key={check.label} className={`rounded-xl border p-3 ${check.ok ? 'border-emerald-500/15 bg-emerald-500/5' : check.warn ? 'border-amber-500/15 bg-amber-500/5' : 'border-slate-800 bg-slate-950/70'}`}><div className="flex items-center justify-between gap-2"><div className="text-[9px] font-black text-white">{check.label}</div>{check.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300"/> : <CircleAlert className={`h-3.5 w-3.5 ${check.warn ? 'text-amber-300' : 'text-slate-600'}`}/>}</div><p className="mt-1 text-[8px] leading-4 text-slate-500">{check.detail}</p></div>)}</div>
    <div className="mt-4 flex items-start gap-2 rounded-xl border border-cyan-500/15 bg-cyan-500/5 p-3 text-[9px] leading-5 text-cyan-100/70"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300"/><span>SONARA non attiva protocolli LAN proprietari dal browser. Le integrazioni di rete passano dal Bridge e vengono abilitate solo tramite adapter espliciti, mantenendo separata la rete DJ dalla pagina web.</span></div>
  </section>;
}
