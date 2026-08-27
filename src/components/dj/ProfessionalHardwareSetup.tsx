import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Cable, CheckCircle2, Cpu, RefreshCw, Settings2, ShieldCheck, Usb, Zap } from 'lucide-react';
import { findDJDeviceProfile, type DJDeviceProfile } from './deviceProfiles';
import { getFactoryMidiMapping, hasFactoryMidiMapping } from './factoryMappings';
import { bipolarMidiValue, emitDJControl, normalizedMidiValue } from './djRuntime';
import { useDJBridge } from './useDJBridge';

type DeviceState = 'ready' | 'limited' | 'offline';
type DetectedDevice = {
  id: string;
  name: string;
  manufacturer: string;
  transport: 'MIDI' | 'HID' | 'BRIDGE' | 'AUDIO' | 'NETWORK';
  state: DeviceState;
  profile: DJDeviceProfile;
  input?: any;
  output?: any;
};

type MidiRule = { status: number; data1: number; channel: number; outputStatus?: number; outputData1?: number };
type MidiMapping = Record<string, MidiRule>;

const mappingKey = (profileId: string) => `sonara.dj.mapping.v2.${profileId}`;

function readUserMapping(profileId: string): MidiMapping {
  try {
    return JSON.parse(localStorage.getItem(mappingKey(profileId)) || '{}') as MidiMapping;
  } catch {
    return {};
  }
}

function effectiveMapping(profileId: string): MidiMapping {
  return { ...getFactoryMidiMapping(profileId), ...readUserMapping(profileId) };
}

function emitAction(action: string, data2: number) {
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
  if (action === 'mixer.crossfader') emitDJControl({ type: 'mixer.crossfader', value: bipolar });
  if (action === 'mixer.master') emitDJControl({ type: 'mixer.master', value: absolute });
}

function StatusPill({ state }: { state: DeviceState }) {
  const label = state === 'ready' ? 'PRONTO' : state === 'limited' ? 'PARZIALE' : 'OFFLINE';
  const style = state === 'ready'
    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
    : state === 'limited'
      ? 'border-amber-500/25 bg-amber-500/10 text-amber-300'
      : 'border-slate-700 bg-slate-900 text-slate-500';
  return <span className={`rounded-full border px-2 py-1 text-[8px] font-black tracking-wider ${style}`}>{label}</span>;
}

export default function ProfessionalHardwareSetup() {
  const bridge = useDJBridge();
  const [devices, setDevices] = useState<DetectedDevice[]>([]);
  const [scanning, setScanning] = useState(true);
  const [status, setStatus] = useState('SONARA sta cercando automaticamente l’hardware DJ collegato…');
  const [events, setEvents] = useState<string[]>([]);
  const [advanced, setAdvanced] = useState(false);
  const midiAccessRef = useRef<any>(null);
  const mappingRef = useRef<Record<string, MidiMapping>>({});
  const activeProfileRef = useRef<DJDeviceProfile>(findDJDeviceProfile('', ''));

  const browserCaps = useMemo(() => ({
    midi: typeof (navigator as any).requestMIDIAccess === 'function',
    hid: Boolean((navigator as any).hid),
    usb: Boolean((navigator as any).usb)
  }), []);

  const log = useCallback((message: string) => {
    setEvents(current => [`${new Date().toLocaleTimeString()}  ${message}`, ...current].slice(0, 40));
  }, []);

  const activateProfile = useCallback((profile: DJDeviceProfile) => {
    activeProfileRef.current = profile;
    mappingRef.current[profile.id] = effectiveMapping(profile.id);
    bridge.send({ type: 'profile.activate', profileId: profile.id });
  }, [bridge]);

  const handleMidiMessage = useCallback((profile: DJDeviceProfile, event: any) => {
    const bytes = Array.from(event.data || []) as number[];
    if (bytes.length < 2) return;
    const [statusByte = 0, data1 = 0, data2 = 0] = bytes;
    const channel = statusByte & 0x0f;
    const command = statusByte & 0xf0;
    const mapping = mappingRef.current[profile.id] || effectiveMapping(profile.id);
    mappingRef.current[profile.id] = mapping;
    const match = Object.entries(mapping).find(([, rule]) => rule && rule.data1 === data1 && rule.channel === channel && (rule.status & 0xf0) === command);
    if (match) emitAction(match[0], data2);
    log(`${profile.model} · MIDI CH ${channel + 1} · ${data1} · ${data2}${match ? ` · ${match[0]}` : ''}`);
  }, [log]);

  const syncMidi = useCallback((access: any) => {
    const outputs = Array.from(access.outputs?.values?.() || []) as any[];
    const next: DetectedDevice[] = [];
    for (const input of Array.from(access.inputs?.values?.() || []) as any[]) {
      const profile = findDJDeviceProfile(input.name || '', input.manufacturer || '');
      const output = outputs.find(item => item.name === input.name || (item.manufacturer && item.manufacturer === input.manufacturer));
      mappingRef.current[profile.id] = effectiveMapping(profile.id);
      input.onmidimessage = (event: any) => handleMidiMessage(profile, event);
      next.push({
        id: `midi-${input.id}`,
        name: input.name || 'MIDI Controller',
        manufacturer: input.manufacturer || profile.brand,
        transport: 'MIDI',
        state: input.state === 'disconnected' ? 'offline' : 'ready',
        profile,
        input,
        output
      });
    }
    setDevices(current => [...current.filter(item => item.transport !== 'MIDI'), ...next]);
    const preferred = next.find(item => item.profile.id !== 'generic-midi') || next[0];
    if (preferred) activateProfile(preferred.profile);
    if (next.length) {
      setStatus(`${next.length} dispositivo/i MIDI rilevati e configurati automaticamente.`);
      log(`AUTO-DETECT MIDI: ${next.map(item => item.name).join(', ')}`);
    }
  }, [activateProfile, handleMidiMessage, log]);

  const scanAuthorizedHid = useCallback(async () => {
    const hid = (navigator as any).hid;
    if (!hid?.getDevices) return;
    try {
      const authorized = await hid.getDevices();
      const next: DetectedDevice[] = [];
      for (const device of authorized as any[]) {
        if (!device.opened) await device.open();
        const profile = findDJDeviceProfile(device.productName || '', '');
        device.oninputreport = (event: any) => {
          const bytes = Array.from(new Uint8Array(event.data?.buffer || new ArrayBuffer(0))).slice(0, 24);
          log(`${profile.model} · HID report ${event.reportId} · ${bytes.join(' ')}`);
        };
        next.push({
          id: `hid-${device.vendorId}-${device.productId}-${device.productName || 'device'}`,
          name: device.productName || 'HID DJ Controller',
          manufacturer: `VID ${Number(device.vendorId).toString(16).padStart(4, '0')}`,
          transport: 'HID',
          state: profile.mapping === 'bridge-native' ? 'limited' : 'ready',
          profile
        });
      }
      setDevices(current => [...current.filter(item => item.transport !== 'HID'), ...next]);
      const preferred = next.find(item => item.profile.id !== 'generic-midi');
      if (preferred) activateProfile(preferred.profile);
      if (next.length) log(`AUTO-DETECT HID: ${next.map(item => item.name).join(', ')}`);
    } catch (error) {
      log(`HID: ${error instanceof Error ? error.message : 'errore rilevamento'}`);
    }
  }, [activateProfile, log]);

  const scanAll = useCallback(async () => {
    setScanning(true);
    setStatus('Scansione automatica: MIDI, HID autorizzati e SONARA DJ Bridge…');
    bridge.connect();
    const tasks: Promise<unknown>[] = [scanAuthorizedHid()];
    if (browserCaps.midi) {
      tasks.push((async () => {
        try {
          const access = await (navigator as any).requestMIDIAccess({ sysex: false });
          midiAccessRef.current = access;
          syncMidi(access);
          access.onstatechange = () => syncMidi(access);
        } catch (error) {
          log(`MIDI: ${error instanceof Error ? error.message : 'permesso non disponibile'}`);
        }
      })());
    }
    await Promise.allSettled(tasks);
    setScanning(false);
  }, [bridge, browserCaps.midi, log, scanAuthorizedHid, syncMidi]);

  const authorizeNewHid = useCallback(async () => {
    const hid = (navigator as any).hid;
    if (!hid?.requestDevice) {
      setStatus('WebHID non disponibile in questo browser. Usa Chrome/Edge desktop o SONARA DJ Bridge.');
      return;
    }
    try {
      await hid.requestDevice({ filters: [] });
      await scanAuthorizedHid();
      setStatus('Nuovo dispositivo autorizzato. SONARA lo gestirà automaticamente dalle prossime aperture.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Autorizzazione HID annullata.');
    }
  }, [scanAuthorizedHid]);

  useEffect(() => {
    void scanAll();
    const timer = window.setInterval(() => {
      if (midiAccessRef.current) syncMidi(midiAccessRef.current);
      void scanAuthorizedHid();
    }, 2500);
    return () => {
      window.clearInterval(timer);
      if (midiAccessRef.current) midiAccessRef.current.onstatechange = null;
    };
  }, [scanAll, scanAuthorizedHid, syncMidi]);

  useEffect(() => {
    const bridgeDevices: DetectedDevice[] = bridge.devices.map(device => {
      const profile = findDJDeviceProfile(device.name, device.manufacturer || '');
      return {
        id: `bridge-${device.id}`,
        name: device.name,
        manufacturer: device.manufacturer || device.hostApi || 'SONARA DJ Bridge',
        transport: device.transport === 'audio' ? 'AUDIO' : device.transport === 'network' ? 'NETWORK' : 'BRIDGE',
        state: 'ready',
        profile
      };
    });
    setDevices(current => [...current.filter(item => !item.id.startsWith('bridge-')), ...bridgeDevices]);
    const preferred = bridgeDevices.find(item => item.profile.id !== 'generic-midi');
    if (preferred) activateProfile(preferred.profile);
    if (bridge.state === 'online') setStatus(`DJ Bridge online${bridgeDevices.length ? ` · ${bridgeDevices.length} dispositivo/i nativi rilevati` : ''}.`);
  }, [activateProfile, bridge.devices, bridge.state]);

  const connected = devices.filter(item => item.state !== 'offline');
  const recognized = connected.filter(item => item.profile.id !== 'generic-midi').length;
  const factoryReady = connected.filter(item => hasFactoryMidiMapping(item.profile.id)).length;

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-3xl border border-cyan-500/20 bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,.16),transparent_38%),linear-gradient(145deg,#070a10,#03050a)] p-5 shadow-2xl sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1 text-[9px] font-black tracking-[0.16em] text-cyan-200">SONARA AUTO HARDWARE</span>
              <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-black text-emerald-300">ZERO-CONFIG</span>
              <span className="rounded-full border border-purple-500/25 bg-purple-500/10 px-2.5 py-1 text-[9px] font-black text-purple-200">REAL INPUT</span>
            </div>
            <h1 className="mt-4 text-2xl font-black tracking-tight text-white sm:text-3xl">Collega la console. SONARA fa il resto.</h1>
            <p className="mt-2 max-w-2xl text-xs leading-6 text-slate-400">Rilevamento continuo, riconoscimento marca/modello, profilo automatico, mapping persistente, controllo del motore DJ e sincronizzazione dell’interfaccia con l’hardware reale.</p>
          </div>
          <div className="grid min-w-[300px] grid-cols-2 gap-2">
            <div className="rounded-xl border border-slate-800 bg-black/30 p-3"><div className="text-[8px] font-black text-slate-500">RILEVATI</div><div className="mt-1 text-xl font-black text-white">{connected.length}</div></div>
            <div className="rounded-xl border border-slate-800 bg-black/30 p-3"><div className="text-[8px] font-black text-slate-500">RICONOSCIUTI</div><div className="mt-1 text-xl font-black text-emerald-300">{recognized}</div></div>
            <button onClick={() => void scanAll()} disabled={scanning} className="col-span-2 flex items-center justify-center gap-2 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-3 text-[10px] font-black text-cyan-100 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${scanning ? 'animate-spin' : ''}`} /> {scanning ? 'SCANSIONE IN CORSO' : 'RISCANSIONA ORA'}</button>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-800 bg-black/25 px-3 py-2 text-[10px] text-slate-400"><Activity className="h-3.5 w-3.5 text-emerald-300" /><span>{status}</span></div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-4"><Cable className="h-4 w-4 text-cyan-300"/><div className="mt-3 text-[9px] font-black text-white">MIDI AUTO</div><div className="mt-1 text-[9px] leading-4 text-slate-500">{browserCaps.midi ? 'Attivo. Hot-plug e messaggi reali monitorati.' : 'Non disponibile nel browser.'}</div></div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-4"><Usb className="h-4 w-4 text-purple-300"/><div className="mt-3 text-[9px] font-black text-white">HID AUTO</div><div className="mt-1 text-[9px] leading-4 text-slate-500">{browserCaps.hid ? 'Dispositivi già autorizzati rilevati automaticamente.' : 'Non disponibile nel browser.'}</div></div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-4"><Cpu className="h-4 w-4 text-emerald-300"/><div className="mt-3 text-[9px] font-black text-white">DJ BRIDGE</div><div className="mt-1 text-[9px] leading-4 text-slate-500">{bridge.state === 'online' ? `${bridge.bridgeVersion || 'online'} · ${bridge.latencyMs?.toFixed(1) || '—'} ms` : 'Ricerca automatica helper nativo.'}</div></div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-4"><ShieldCheck className="h-4 w-4 text-amber-300"/><div className="mt-3 text-[9px] font-black text-white">FACTORY PROFILES</div><div className="mt-1 text-[9px] leading-4 text-slate-500">{factoryReady} dispositivo/i con mapping factory immediato; gli altri usano profilo o fallback persistente.</div></div>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/55 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-black text-white">Device Manager</h2><p className="mt-1 text-[10px] text-slate-500">Nessuna procedura guidata: SONARA mantiene aggiornato questo elenco in tempo reale.</p></div><button onClick={() => void authorizeNewHid()} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-[9px] font-black text-slate-300">AUTORIZZA NUOVO HID</button></div>
        <div className="mt-4 grid gap-2 lg:grid-cols-2">
          {connected.length === 0 ? <div className="col-span-full flex min-h-36 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-black/20 p-5 text-center"><Cable className="h-7 w-7 text-slate-700"/><div className="mt-3 text-xs font-black text-slate-300">Collega una console USB/MIDI</div><div className="mt-1 text-[10px] text-slate-600">Appena il sistema operativo la espone, SONARA la rileva e carica il profilo disponibile.</div></div> : connected.map(device => (
            <div key={device.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
              <div className="min-w-0"><div className="truncate text-xs font-black text-white">{device.name}</div><div className="mt-1 truncate text-[9px] text-slate-500">{device.profile.brand} · {device.profile.model} · {device.transport}</div><div className="mt-2 flex flex-wrap gap-1">{hasFactoryMidiMapping(device.profile.id) && <span className="rounded-full bg-cyan-500/10 px-2 py-1 text-[7px] font-black text-cyan-300">FACTORY MAPPING</span>}{device.profile.id === 'generic-midi' && <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[7px] font-black text-amber-300">UNIVERSAL FALLBACK</span>}</div></div>
              <StatusPill state={device.state}/>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-500/15 bg-emerald-500/5 p-4"><div className="flex items-start gap-3"><Zap className="mt-0.5 h-4 w-4 text-emerald-300"/><div><div className="text-[10px] font-black text-emerald-200">HARDWARE → SONARA DJ PRO</div><p className="mt-1 text-[9px] leading-5 text-slate-400">Quando un mapping è disponibile, ogni movimento fisico viene convertito subito in comandi del motore DJ: gain, EQ, filter, fader, crossfader, cue e altri controlli supportati. L’interfaccia riceve gli stessi eventi del motore, quindi il controllo software segue l’hardware in tempo reale.</p></div></div></section>

      <button onClick={() => setAdvanced(value => !value)} className="flex w-full items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-left"><span className="flex items-center gap-2 text-[10px] font-black text-slate-300"><Settings2 className="h-4 w-4"/> DIAGNOSTICA AVANZATA</span><span className="text-[9px] text-slate-600">{advanced ? 'NASCONDI' : 'APRI'}</span></button>
      {advanced && <section className="rounded-2xl border border-slate-800 bg-[#03050a] p-4"><div className="mb-3 text-[9px] font-black text-slate-400">LIVE HARDWARE EVENTS</div><div className="h-44 overflow-auto font-mono text-[9px] leading-5 text-emerald-300/80">{events.length ? events.map((item, index) => <div key={`${item}-${index}`}>{item}</div>) : <span className="text-slate-700">Nessun evento ricevuto.</span>}</div></section>}
    </div>
  );
}
