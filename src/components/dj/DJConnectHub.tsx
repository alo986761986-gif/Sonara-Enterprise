import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Cable,
  CheckCircle2,
  CircleAlert,
  Cpu,
  Disc3,
  Headphones,
  Link2,
  Loader2,
  Music2,
  Radio,
  RefreshCw,
  SlidersHorizontal,
  Usb,
  Zap
} from 'lucide-react';
import DJLiveMixer from './DJLiveMixer';
import DJProfileLibrary from './DJProfileLibrary';
import DJAudioRouting from './DJAudioRouting';
import DJDiagnostics from './DJDiagnostics';
import { DJDeviceProfile, findDJDeviceProfile } from './deviceProfiles';
import { emitDJControl, onDJFeedback, bipolarMidiValue, normalizedMidiValue } from './djRuntime';
import { useDJBridge } from './useDJBridge';

type Transport = 'midi' | 'hid' | 'bridge' | 'network' | 'audio';
type DJDevice = {
  id: string;
  name: string;
  manufacturer: string;
  transport: Transport;
  state: 'connected' | 'disconnected';
  profile: DJDeviceProfile;
  input?: any;
  output?: any;
  raw?: any;
};

type MidiLearnAction =
  | 'deckA.play' | 'deckA.cue' | 'deckA.sync' | 'deckA.pitch' | 'deckA.volume' | 'deckA.gain' | 'deckA.filter' | 'deckA.eqLow' | 'deckA.eqMid' | 'deckA.eqHigh'
  | 'deckB.play' | 'deckB.cue' | 'deckB.sync' | 'deckB.pitch' | 'deckB.volume' | 'deckB.gain' | 'deckB.filter' | 'deckB.eqLow' | 'deckB.eqMid' | 'deckB.eqHigh'
  | 'deckA.hotcue1' | 'deckA.hotcue2' | 'deckA.hotcue3' | 'deckA.hotcue4'
  | 'deckB.hotcue1' | 'deckB.hotcue2' | 'deckB.hotcue3' | 'deckB.hotcue4'
  | 'deckA.loop' | 'deckB.loop'
  | 'mixer.crossfader' | 'mixer.master';

type MappingRule = { status: number; data1: number; channel: number; outputStatus?: number; outputData1?: number };
type Mapping = Partial<Record<MidiLearnAction, MappingRule>>;

const LEARN_ACTIONS: Array<{ id: MidiLearnAction; label: string; kind: 'button' | 'absolute' | 'bipolar' }> = [
  { id: 'deckA.play', label: 'Deck A · Play', kind: 'button' }, { id: 'deckA.cue', label: 'Deck A · Cue', kind: 'button' }, { id: 'deckA.sync', label: 'Deck A · Sync', kind: 'button' },
  { id: 'deckA.pitch', label: 'Deck A · Pitch', kind: 'bipolar' }, { id: 'deckA.volume', label: 'Deck A · Volume', kind: 'absolute' }, { id: 'deckA.filter', label: 'Deck A · Filter', kind: 'bipolar' },
  { id: 'deckA.gain', label: 'Deck A · Gain', kind: 'bipolar' },
  { id: 'deckA.eqLow', label: 'Deck A · EQ Low', kind: 'bipolar' }, { id: 'deckA.eqMid', label: 'Deck A · EQ Mid', kind: 'bipolar' }, { id: 'deckA.eqHigh', label: 'Deck A · EQ High', kind: 'bipolar' },
  { id: 'deckA.hotcue1', label: 'Deck A · Hot Cue 1', kind: 'button' }, { id: 'deckA.hotcue2', label: 'Deck A · Hot Cue 2', kind: 'button' }, { id: 'deckA.hotcue3', label: 'Deck A · Hot Cue 3', kind: 'button' }, { id: 'deckA.hotcue4', label: 'Deck A · Hot Cue 4', kind: 'button' }, { id: 'deckA.loop', label: 'Deck A · Loop', kind: 'button' },
  { id: 'deckB.play', label: 'Deck B · Play', kind: 'button' }, { id: 'deckB.cue', label: 'Deck B · Cue', kind: 'button' }, { id: 'deckB.sync', label: 'Deck B · Sync', kind: 'button' },
  { id: 'deckB.pitch', label: 'Deck B · Pitch', kind: 'bipolar' }, { id: 'deckB.volume', label: 'Deck B · Volume', kind: 'absolute' }, { id: 'deckB.filter', label: 'Deck B · Filter', kind: 'bipolar' },
  { id: 'deckB.gain', label: 'Deck B · Gain', kind: 'bipolar' },
  { id: 'deckB.eqLow', label: 'Deck B · EQ Low', kind: 'bipolar' }, { id: 'deckB.eqMid', label: 'Deck B · EQ Mid', kind: 'bipolar' }, { id: 'deckB.eqHigh', label: 'Deck B · EQ High', kind: 'bipolar' },
  { id: 'deckB.hotcue1', label: 'Deck B · Hot Cue 1', kind: 'button' }, { id: 'deckB.hotcue2', label: 'Deck B · Hot Cue 2', kind: 'button' }, { id: 'deckB.hotcue3', label: 'Deck B · Hot Cue 3', kind: 'button' }, { id: 'deckB.hotcue4', label: 'Deck B · Hot Cue 4', kind: 'button' }, { id: 'deckB.loop', label: 'Deck B · Loop', kind: 'button' },
  { id: 'mixer.crossfader', label: 'Mixer · Crossfader', kind: 'bipolar' }, { id: 'mixer.master', label: 'Mixer · Master', kind: 'absolute' }
];

const mappingKey = (profileId: string) => `sonara.dj.mapping.v2.${profileId}`;
const readMapping = (profileId: string): Mapping => { try { return JSON.parse(localStorage.getItem(mappingKey(profileId)) || '{}') as Mapping; } catch { return {}; } };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function Capability({ label, active, detail }: { label: string; active: boolean; detail: string }) {
  return <div className={`rounded-xl border p-3 ${active ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-slate-800 bg-slate-950/70'}`}><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-black text-white">{label}</span>{active ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" /> : <CircleAlert className="h-3.5 w-3.5 text-slate-600" />}</div><div className="mt-1 text-[9px] leading-4 text-slate-500">{detail}</div></div>;
}

export default function DJConnectHub() {
  const bridge = useDJBridge();
  const [devices, setDevices] = useState<DJDevice[]>([]);
  const [status, setStatus] = useState('Modalità Browser attiva. Collega una console tramite MIDI o HID.');
  const [busy, setBusy] = useState(false);
  const [eventLog, setEventLog] = useState<string[]>([]);
  const [learnAction, setLearnAction] = useState<MidiLearnAction | ''>('');
  const [activeProfile, setActiveProfile] = useState<DJDeviceProfile>(() => findDJDeviceProfile('', ''));
  const [mapping, setMapping] = useState<Mapping>(() => readMapping('generic-midi'));
  const [feedbackEnabled, setFeedbackEnabled] = useState(true);
  const [linkEnabled, setLinkEnabled] = useState(false);
  const midiAccessRef = useRef<any>(null);
  const selectedMidiOutputRef = useRef<any>(null);
  const activeProfileRef = useRef(activeProfile);
  const mappingRef = useRef(mapping);
  const learnActionRef = useRef(learnAction);

  useEffect(() => { activeProfileRef.current = activeProfile; }, [activeProfile]);
  useEffect(() => { mappingRef.current = mapping; }, [mapping]);
  useEffect(() => { learnActionRef.current = learnAction; }, [learnAction]);

  const browserCaps = useMemo(() => ({
    midi: typeof (navigator as any).requestMIDIAccess === 'function',
    hid: Boolean((navigator as any).hid),
    usb: Boolean((navigator as any).usb),
    audioOutput: typeof (HTMLMediaElement.prototype as any).setSinkId === 'function'
  }), []);

  const log = (value: string) => setEventLog(current => [value, ...current].slice(0, 60));

  const selectProfile = (profile: DJDeviceProfile) => {
    setActiveProfile(profile);
    setMapping(readMapping(profile.id));
    bridge.send({ type: 'profile.activate', profileId: profile.id });
    setStatus(`Profilo attivo: ${profile.brand} ${profile.model}`);
  };

  const emitMappedAction = (action: MidiLearnAction, data2: number) => {
    const descriptor = LEARN_ACTIONS.find(item => item.id === action);
    if (!descriptor) return;
    const pressed = data2 > 0;
    const absolute = normalizedMidiValue(data2);
    const bipolar = bipolarMidiValue(data2);
    const deck = action.startsWith('deckA.') ? 'A' : action.startsWith('deckB.') ? 'B' : null;
    const command = action.split('.')[1];
    if (deck && command === 'play' && pressed) emitDJControl({ type: 'deck.play', deck, pressed });
    if (deck && command === 'cue') emitDJControl({ type: 'deck.cue', deck, pressed });
    if (deck && command === 'sync' && pressed) emitDJControl({ type: 'deck.sync', deck, pressed });
    if (deck && command === 'pitch') emitDJControl({ type: 'deck.pitch', deck, value: bipolar * 16 });
    if (deck && command === 'volume') emitDJControl({ type: 'deck.volume', deck, value: absolute });
    if (deck && command === 'gain') emitDJControl({ type: 'deck.gain', deck, value: bipolar * 12 });
    if (deck && command === 'filter') emitDJControl({ type: 'deck.filter', deck, value: bipolar });
    if (deck && command === 'eqLow') emitDJControl({ type: 'deck.eqLow', deck, value: bipolar < 0 ? bipolar * 18 : bipolar * 9 });
    if (deck && command === 'eqMid') emitDJControl({ type: 'deck.eqMid', deck, value: bipolar < 0 ? bipolar * 18 : bipolar * 9 });
    if (deck && command === 'eqHigh') emitDJControl({ type: 'deck.eqHigh', deck, value: bipolar < 0 ? bipolar * 18 : bipolar * 9 });
    if (deck && command.startsWith('hotcue') && pressed) emitDJControl({ type: 'deck.hotcue', deck, index: Math.max(0, Number(command.replace('hotcue', '')) - 1), pressed });
    if (deck && command === 'loop' && pressed) emitDJControl({ type: 'deck.loop', deck, beats: 4, pressed });
    if (action === 'mixer.crossfader') emitDJControl({ type: 'mixer.crossfader', value: bipolar });
    if (action === 'mixer.master') emitDJControl({ type: 'mixer.master', value: absolute });
  };

  const applyMidiMessage = (statusByte: number, data1: number, data2: number) => {
    const channel = statusByte & 0x0f;
    const command = statusByte & 0xf0;
    const entries = Object.entries(mappingRef.current) as Array<[MidiLearnAction, MappingRule]>;
    const match = entries.find(([, rule]) => rule && rule.data1 === data1 && rule.channel === channel && (rule.status & 0xf0) === command);
    if (match) emitMappedAction(match[0], data2);
  };

  const handleMidiMessage = (event: any) => {
    const data = Array.from(event.data || []) as number[];
    if (data.length < 2) return;
    const [statusByte = 0, data1 = 0, data2 = 0] = data;
    const channel = statusByte & 0x0f;
    log(`MIDI · ch ${channel + 1} · 0x${statusByte.toString(16)} · ${data1} · ${data2}`);
    const learning = learnActionRef.current;
    if (learning) {
      const next: Mapping = { ...mappingRef.current, [learning]: { status: statusByte, data1, channel, outputStatus: statusByte, outputData1: data1 } };
      setMapping(next);
      mappingRef.current = next;
      localStorage.setItem(mappingKey(activeProfileRef.current.id), JSON.stringify(next));
      setStatus(`Mappato: ${LEARN_ACTIONS.find(item => item.id === learning)?.label || learning}`);
      setLearnAction('');
      learnActionRef.current = '';
      return;
    }
    applyMidiMessage(statusByte, data1, data2);
  };

  const syncMidiDevices = (access: any) => {
    const next: DJDevice[] = [];
    const outputs = Array.from(access.outputs?.values?.() || []) as any[];
    for (const input of Array.from(access.inputs?.values?.() || []) as any[]) {
      const profile = findDJDeviceProfile(input.name || '', input.manufacturer || '');
      const matchingOutput = outputs.find(output => output.name === input.name || (output.manufacturer && output.manufacturer === input.manufacturer));
      if (matchingOutput && !selectedMidiOutputRef.current) selectedMidiOutputRef.current = matchingOutput;
      input.onmidimessage = handleMidiMessage;
      next.push({ id: `midi-${input.id}`, name: input.name || 'MIDI Controller', manufacturer: input.manufacturer || 'Unknown', transport: 'midi', state: input.state === 'disconnected' ? 'disconnected' : 'connected', input, output: matchingOutput, profile });
    }
    for (const output of outputs) {
      if (next.some(item => item.output === output)) continue;
      const profile = findDJDeviceProfile(output.name || '', output.manufacturer || '');
      next.push({ id: `midi-out-${output.id}`, name: output.name || 'MIDI Output', manufacturer: output.manufacturer || 'Unknown', transport: 'midi', state: output.state === 'disconnected' ? 'disconnected' : 'connected', output, profile });
    }
    setDevices(current => [...current.filter(item => item.transport !== 'midi'), ...next]);
    const detected = next.find(item => item.profile.id !== 'generic-midi')?.profile;
    if (detected && activeProfileRef.current.id === 'generic-midi') selectProfile(detected);
  };

  const connectMidi = async () => {
    if (!browserCaps.midi || busy) { setStatus('Web MIDI non disponibile: usa Chrome/Edge desktop oppure SONARA DJ Bridge.'); return; }
    setBusy(true);
    try {
      const access = await (navigator as any).requestMIDIAccess({ sysex: false });
      midiAccessRef.current = access;
      syncMidiDevices(access);
      access.onstatechange = () => syncMidiDevices(access);
      setStatus('Console MIDI collegate. Muovi un controllo: il monitor mostrerà dati reali.');
      log('Web MIDI access granted');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Permesso MIDI non concesso.');
    } finally { setBusy(false); }
  };

  const connectHid = async () => {
    const hid = (navigator as any).hid;
    if (!hid || busy) { setStatus('WebHID non disponibile: usa SONARA DJ Bridge.'); return; }
    setBusy(true);
    try {
      const selected = await hid.requestDevice({ filters: [] });
      const next: DJDevice[] = [];
      for (const device of selected as any[]) {
        if (!device.opened) await device.open();
        const profile = findDJDeviceProfile(device.productName || '', '');
        device.oninputreport = (event: any) => {
          const bytes = Array.from(new Uint8Array(event.data?.buffer || new ArrayBuffer(0))).slice(0, 32);
          log(`HID · ${device.productName || 'device'} · report ${event.reportId} · ${bytes.join(' ')}`);
        };
        next.push({ id: `hid-${device.vendorId}-${device.productId}-${device.productName || 'device'}`, name: device.productName || 'HID DJ Controller', manufacturer: `VID ${device.vendorId.toString(16).padStart(4, '0')}`, transport: 'hid', state: 'connected', raw: device, profile });
      }
      setDevices(current => [...current.filter(item => item.transport !== 'hid'), ...next]);
      const detected = next.find(item => item.profile.id !== 'generic-midi')?.profile;
      if (detected) selectProfile(detected);
      setStatus(next.length ? `${next.length} dispositivo/i HID collegati.` : 'Nessun dispositivo HID selezionato.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Connessione HID non riuscita.');
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (!bridge.devices.length) return;
    const bridgeDevices: DJDevice[] = bridge.devices.map(device => ({
      id: `bridge-${device.id}`,
      name: device.name,
      manufacturer: device.manufacturer || device.hostApi || 'SONARA DJ Bridge',
      transport: device.transport as Transport,
      state: 'connected',
      profile: findDJDeviceProfile(device.name, device.manufacturer || ''),
      raw: device
    }));
    setDevices(current => [...current.filter(item => !item.id.startsWith('bridge-')), ...bridgeDevices]);
  }, [bridge.devices]);

  useEffect(() => onDJFeedback(feedback => {
    if (!feedbackEnabled) return;
    const output = selectedMidiOutputRef.current;
    if (!output?.send) return;
    const action = feedback.deck ? (`deck${feedback.deck}.${feedback.control}` as MidiLearnAction) : (`mixer.${feedback.control}` as MidiLearnAction);
    const rule = mappingRef.current[action];
    if (!rule) return;
    const status = rule.outputStatus ?? rule.status;
    const data1 = rule.outputData1 ?? rule.data1;
    const value = typeof feedback.value === 'boolean' ? (feedback.value ? 127 : 0) : Math.round(clamp(Number(feedback.value) || 0, 0, 1) * 127);
    try { output.send([status, data1, value]); } catch { /* controller may not accept feedback on the same message */ }
  }), [feedbackEnabled]);

  useEffect(() => () => {
    if (midiAccessRef.current) midiAccessRef.current.onstatechange = null;
  }, []);

  const resetMapping = () => {
    setMapping({}); mappingRef.current = {};
    localStorage.removeItem(mappingKey(activeProfile.id));
    setLearnAction(''); learnActionRef.current = '';
    setStatus(`Mapping ${activeProfile.model} azzerato.`);
  };

  const setLink = (enabled: boolean) => {
    setLinkEnabled(enabled);
    if (!bridge.send({ type: 'network.enable', adapter: 'ableton-link', enabled })) setStatus('Per Ableton Link avvia SONARA DJ Bridge.');
    else setStatus(enabled ? 'Ableton Link richiesto al DJ Bridge.' : 'Ableton Link disattivato.');
  };

  const connected = devices.filter(item => item.state === 'connected');
  const detectedProfileId = connected.find(item => item.profile.id !== 'generic-midi')?.profile.id;

  return <div className="space-y-5 pb-10">
    <section className="overflow-hidden rounded-3xl border border-purple-500/20 bg-[radial-gradient(circle_at_top_right,rgba(109,40,217,.22),transparent_36%),linear-gradient(145deg,#070912,#05070c)] p-5 shadow-2xl sm:p-7">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center"><div className="max-w-3xl"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-fuchsia-500/20 bg-fuchsia-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-fuchsia-200">SONARA HARDWARE SETUP</span><span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-black text-emerald-300">UNIVERSAL AUTO-DETECT</span><span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[9px] font-black text-cyan-200">{activeProfile.model}</span></div><h1 className="mt-4 text-2xl font-black tracking-tight text-white sm:text-3xl">Rilevamento professionale di controller, player e mixer DJ.</h1><p className="mt-3 max-w-2xl text-xs leading-6 text-slate-400">Un solo centro rileva MIDI, HID e dispositivi nativi tramite DJ Bridge, identifica marca e modello, carica il profilo SONARA e mantiene sincronizzati hardware, motore audio, LED compatibili e interfaccia.</p></div>
        <div className="grid min-w-[320px] grid-cols-2 gap-2"><button onClick={() => { bridge.connect(); void connectMidi(); }} disabled={busy} className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-600 via-purple-600 to-cyan-500 px-4 py-3.5 text-[10px] font-black text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <Radio className="h-4 w-4"/>} SCANSIONE AUTOMATICA COMPLETA</button><button onClick={() => void connectMidi()} disabled={busy} className="flex items-center justify-center gap-2 rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/10 px-4 py-3 text-[10px] font-black text-fuchsia-100 disabled:opacity-50"><Music2 className="h-4 w-4"/> MIDI</button><button onClick={() => void connectHid()} disabled={busy} className="flex items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-[10px] font-black text-cyan-100 disabled:opacity-50"><Usb className="h-4 w-4"/> HID</button><button onClick={bridge.connect} className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-[10px] font-black text-slate-200"><Cpu className="h-4 w-4"/> BRIDGE · {bridge.state === 'online' ? 'ONLINE' : bridge.state === 'connecting' ? 'CONNESSIONE' : 'NATIVO'}</button><button onClick={() => setLink(!linkEnabled)} disabled={bridge.state !== 'online'} className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-[10px] font-black disabled:cursor-not-allowed disabled:opacity-40 ${linkEnabled ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 bg-slate-950 text-slate-300'}`}><Link2 className="h-4 w-4"/> LINK {linkEnabled ? 'ON' : 'OFF'}</button></div></div>
      <div className="mt-5 flex items-center gap-2 rounded-xl border border-slate-800 bg-black/20 px-3 py-2 text-[10px] text-slate-400"><Radio className="h-3.5 w-3.5 shrink-0 text-purple-300"/><span>{status}</span></div>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Capability label="Web MIDI" active={browserCaps.midi} detail="MIDI input/output, MIDI Learn e feedback LED dove il controller lo espone."/><Capability label="Web HID" active={browserCaps.hid} detail="Report HID reali con consenso utente; mapping specifico solo quando documentato/testato."/><Capability label="DJ Bridge (opzionale)" active={bridge.state === 'online'} detail={bridge.state === 'online' ? `${bridge.bridgeVersion || 'v2'} · RTT ${bridge.latencyMs?.toFixed(1) || '—'} ms` : 'Componente opzionale non installato. La modalità Browser rimane attiva.'}/><Capability label="Audio Output" active={browserCaps.audioOutput} detail="Selezione uscite browser; audio professionale multicanale viene diagnosticato dal Bridge."/></section>

    <section className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]"><div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-4 sm:p-5"><div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-sm font-black text-white">Hardware collegato</h2><p className="mt-1 text-[10px] text-slate-500">Web MIDI/HID e dispositivi enumerati dal Bridge vengono unificati qui.</p></div><button onClick={() => void connectMidi()} className="rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-400"><RefreshCw className="h-4 w-4"/></button></div>{connected.length === 0 ? <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-950/50 p-5 text-center"><Cable className="h-7 w-7 text-slate-700"/><div className="mt-3 text-xs font-black text-slate-300">Nessuna console ancora rilevata</div><div className="mt-1 max-w-sm text-[10px] leading-5 text-slate-600">Collega la console via USB/MIDI. Per player standalone, network o driver audio professionali avvia il DJ Bridge.</div></div> : <div className="space-y-2">{connected.map(device => <button key={device.id} onClick={() => selectProfile(device.profile)} className="flex w-full flex-col justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-left sm:flex-row sm:items-center"><div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-purple-500/20 bg-purple-500/10 text-purple-300"><Disc3 className="h-4 w-4"/></div><div className="min-w-0"><div className="truncate text-xs font-black text-white">{device.name}</div><div className="mt-0.5 truncate text-[9px] text-slate-500">{device.profile.brand} · profilo {device.profile.model}</div></div></div><div className="flex items-center gap-2"><span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-[8px] font-black text-cyan-200">{device.transport.toUpperCase()}</span><span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[8px] font-black text-emerald-300">CONNECTED</span></div></button>)}</div>}</div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-4 sm:p-5"><div className="flex items-center justify-between"><div><h2 className="text-sm font-black text-white">Live hardware monitor</h2><p className="mt-1 text-[10px] text-slate-500">Ogni byte ricevuto viene mostrato: niente connessioni simulate.</p></div><Activity className="h-5 w-5 text-emerald-300"/></div><div className="mt-4 h-48 overflow-auto rounded-xl border border-slate-800 bg-[#03050a] p-3 font-mono text-[9px] leading-5 text-emerald-300/80">{eventLog.length ? eventLog.map((item,index)=><div key={`${item}-${index}`}>{item}</div>) : <span className="text-slate-700">In attesa di MIDI/HID input...</span>}</div><div className="mt-3 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-3 py-2"><div className="flex items-center gap-2 text-[9px] font-black text-slate-400"><Headphones className="h-3.5 w-3.5"/> MIDI OUT / LED FEEDBACK</div><button onClick={() => setFeedbackEnabled(value => !value)} className={`rounded-lg px-2 py-1 text-[8px] font-black ${feedbackEnabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-900 text-slate-600'}`}>{feedbackEnabled ? 'ON' : 'OFF'}</button></div></div></section>

    <DJProfileLibrary detectedProfileId={detectedProfileId} onSelect={selectProfile}/>
    <DJLiveMixer/>

    <section className="rounded-3xl border border-slate-800 bg-slate-900/55 p-4 sm:p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-fuchsia-300"/><h2 className="text-sm font-black text-white">Universal MIDI Learn · {activeProfile.model}</h2></div><p className="mt-1 text-[10px] text-slate-500">Il mapping viene salvato per profilo. Premi una funzione e muovi il controllo fisico corrispondente.</p></div><button onClick={resetMapping} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[9px] font-black text-slate-400">RESET PROFILE MAPPING</button></div><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">{LEARN_ACTIONS.map(action => { const rule = mapping[action.id]; const learning = learnAction === action.id; return <button key={action.id} onClick={() => { const next = learning ? '' : action.id; setLearnAction(next); learnActionRef.current = next; }} className={`rounded-xl border p-3 text-left transition ${learning ? 'border-amber-400/50 bg-amber-400/10' : rule ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-slate-800 bg-slate-950'}`}><div className="text-[9px] font-black text-white">{action.label}</div><div className={`mt-1 text-[7px] font-bold ${learning ? 'text-amber-300' : rule ? 'text-emerald-300' : 'text-slate-600'}`}>{learning ? 'MUOVI ORA IL CONTROLLO...' : rule ? `MIDI CH ${rule.channel + 1} · ${rule.data1}` : 'CLICCA PER LEARN'}</div></button>; })}</div></section>

    <DJAudioRouting/>

    <section className="rounded-3xl border border-purple-500/15 bg-purple-500/5 p-4 sm:p-5"><div className="flex items-center gap-2"><Zap className="h-4 w-4 text-fuchsia-300"/><h2 className="text-sm font-black text-white">Network & Club Sync</h2></div><div className="mt-4 grid gap-3 lg:grid-cols-3"><div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-3"><div className="text-[9px] font-black text-emerald-200">ABLETON LINK</div><p className="mt-1 text-[8px] leading-4 text-slate-500">Adapter reale nel DJ Bridge per tempo, beat, phase, transport e peer discovery.</p></div><div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><div className="text-[9px] font-black text-white">ENGINE DJ</div><p className="mt-1 text-[8px] leading-4 text-slate-500">Per hardware Engine DJ SONARA usa l’integrazione Ableton Link quando disponibile invece di inventare protocolli proprietari.</p></div><div className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-3"><div className="text-[9px] font-black text-amber-200">PRO DJ LINK / VENDOR LAN</div><p className="mt-1 text-[8px] leading-4 text-slate-500">Disabilitato nel browser. Verrà attivato solo tramite adapter ufficiale/certificato e Bridge locale isolato.</p></div></div></section>

    <DJDiagnostics/>

    <section className="rounded-2xl border border-cyan-500/15 bg-cyan-500/5 p-4 text-[10px] leading-5 text-cyan-100/80"><div className="flex items-start gap-3"><Cpu className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300"/><div><b>Architettura completa:</b> Browser = MIDI/HID + Live Deck Engine + MIDI Learn + audio device selection. DJ Bridge = MIDI nativo, HID/audio enumeration, Ableton Link e futuri adapter certificati. I protocolli proprietari non vengono dichiarati operativi finché non esiste un adapter reale e testato.</div></div></section>
  </div>;
}
