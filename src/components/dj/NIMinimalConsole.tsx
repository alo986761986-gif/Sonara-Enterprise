import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Cable, CheckCircle2, Disc3, Download, ExternalLink, Settings2, SlidersHorizontal, Usb, XCircle } from 'lucide-react';
import DJLiveMixer from './DJLiveMixer';
import DJAudioRouting from './DJAudioRouting';
import DJDeckSkinManager from './DJDeckSkinManager';
import { bipolarMidiValue, emitDJControl, normalizedMidiValue, onDJFeedback } from './djRuntime';

type CoreAction =
  | 'deckA.play' | 'deckA.cue' | 'deckA.sync' | 'deckA.loop'
  | 'deckB.play' | 'deckB.cue' | 'deckB.sync' | 'deckB.loop'
  | 'deckA.volume' | 'deckA.eqLow' | 'deckA.eqMid' | 'deckA.eqHigh' | 'deckA.filter'
  | 'deckB.volume' | 'deckB.eqLow' | 'deckB.eqMid' | 'deckB.eqHigh' | 'deckB.filter'
  | 'mixer.crossfader' | 'mixer.master';

type LearnRule = { sourceId: string; status: number; data1: number; channel: number };
type Mapping = Partial<Record<CoreAction, LearnRule>>;
type MIDIDeviceView = { id: string; name: string; manufacturer: string; family: 'X1 MK2' | 'Z1 MK2' | 'MIDI' };

const STORAGE_KEY = 'sonara.dj.ni-x1mk2-z1mk2.mapping.v1';
const NI_DRIVER_URL = 'https://support.native-instruments.com/hc/en-us/articles/209570629-Drivers-Other-Files';
const NI_MIDI_MODE_URL = 'https://support.native-instruments.com/support/solutions/articles/69000880031-native-instruments-switching-your-controller-to-midi-mode';

const ACTIONS: Array<{ id: CoreAction; label: string; preferred: 'X1 MK2' | 'Z1 MK2'; kind: 'button' | 'absolute' | 'bipolar' }> = [
  { id: 'deckA.play', label: 'Deck A · Play', preferred: 'X1 MK2', kind: 'button' },
  { id: 'deckA.cue', label: 'Deck A · Cue', preferred: 'X1 MK2', kind: 'button' },
  { id: 'deckA.sync', label: 'Deck A · Sync', preferred: 'X1 MK2', kind: 'button' },
  { id: 'deckA.loop', label: 'Deck A · Loop', preferred: 'X1 MK2', kind: 'button' },
  { id: 'deckB.play', label: 'Deck B · Play', preferred: 'X1 MK2', kind: 'button' },
  { id: 'deckB.cue', label: 'Deck B · Cue', preferred: 'X1 MK2', kind: 'button' },
  { id: 'deckB.sync', label: 'Deck B · Sync', preferred: 'X1 MK2', kind: 'button' },
  { id: 'deckB.loop', label: 'Deck B · Loop', preferred: 'X1 MK2', kind: 'button' },
  { id: 'deckA.volume', label: 'Canale A · Volume', preferred: 'Z1 MK2', kind: 'absolute' },
  { id: 'deckA.eqLow', label: 'Canale A · Low', preferred: 'Z1 MK2', kind: 'bipolar' },
  { id: 'deckA.eqMid', label: 'Canale A · Mid', preferred: 'Z1 MK2', kind: 'bipolar' },
  { id: 'deckA.eqHigh', label: 'Canale A · High', preferred: 'Z1 MK2', kind: 'bipolar' },
  { id: 'deckA.filter', label: 'Canale A · Filter', preferred: 'Z1 MK2', kind: 'bipolar' },
  { id: 'deckB.volume', label: 'Canale B · Volume', preferred: 'Z1 MK2', kind: 'absolute' },
  { id: 'deckB.eqLow', label: 'Canale B · Low', preferred: 'Z1 MK2', kind: 'bipolar' },
  { id: 'deckB.eqMid', label: 'Canale B · Mid', preferred: 'Z1 MK2', kind: 'bipolar' },
  { id: 'deckB.eqHigh', label: 'Canale B · High', preferred: 'Z1 MK2', kind: 'bipolar' },
  { id: 'deckB.filter', label: 'Canale B · Filter', preferred: 'Z1 MK2', kind: 'bipolar' },
  { id: 'mixer.crossfader', label: 'Mixer · Crossfader', preferred: 'Z1 MK2', kind: 'bipolar' },
  { id: 'mixer.master', label: 'Mixer · Master', preferred: 'Z1 MK2', kind: 'absolute' }
];

const readMapping = (): Mapping => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Mapping; } catch { return {}; }
};

const identify = (name = ''): MIDIDeviceView['family'] => {
  const value = name.toLowerCase();
  if (value.includes('x1') && value.includes('mk2')) return 'X1 MK2';
  if (value.includes('z1') && value.includes('mk2')) return 'Z1 MK2';
  return 'MIDI';
};

export default function NIMinimalConsole() {
  const [devices, setDevices] = useState<MIDIDeviceView[]>([]);
  const [status, setStatus] = useState('Collega X1 MK2 e Z1 MK2 via USB, poi premi CONNETTI.');
  const [mapping, setMapping] = useState<Mapping>(readMapping);
  const [learning, setLearning] = useState<CoreAction | ''>('');
  const [advanced, setAdvanced] = useState(false);
  const [signalByDevice, setSignalByDevice] = useState<Record<string, number>>({});
  const [lastMappedAction, setLastMappedAction] = useState<CoreAction | ''>('');
  const [lastMappedAt, setLastMappedAt] = useState(0);
  const [lastEngineReply, setLastEngineReply] = useState('');
  const [lastEngineAt, setLastEngineAt] = useState(0);
  const midiAccessRef = useRef<any>(null);
  const mappingRef = useRef(mapping);
  const learningRef = useRef<CoreAction | ''>(learning);

  useEffect(() => { mappingRef.current = mapping; }, [mapping]);
  useEffect(() => { learningRef.current = learning; }, [learning]);
  useEffect(() => onDJFeedback(feedback => {
    const deck = feedback.deck ? ` · DECK ${feedback.deck}` : '';
    setLastEngineReply(`${feedback.control}${deck}`);
    setLastEngineAt(Date.now());
  }), []);

  const hasX1 = devices.some(device => device.family === 'X1 MK2');
  const hasZ1 = devices.some(device => device.family === 'Z1 MK2');
  const x1Signal = devices.some(device => device.family === 'X1 MK2' && (signalByDevice[device.id] || 0) > 0);
  const z1Signal = devices.some(device => device.family === 'Z1 MK2' && (signalByDevice[device.id] || 0) > 0);
  const anySignal = Object.values(signalByDevice).some(count => count > 0);
  const mappedCount = useMemo(() => Object.keys(mapping).length, [mapping]);
  const lastMappedLabel = ACTIONS.find(item => item.id === lastMappedAction)?.label || lastMappedAction;
  const engineConfirmed = lastMappedAt > 0 && lastEngineAt >= lastMappedAt && lastEngineAt - lastMappedAt < 5000;

  const linkStatus = !devices.length
    ? 'NON COLLEGATO · premi CONNETTI X1 + Z1'
    : !anySignal
      ? 'USB/MIDI RILEVATO · premi un tasto X1 o muovi una manopola Z1'
      : mappedCount === 0
        ? 'SEGNALE MIDI REALE OK · configura almeno un controllo'
        : !lastMappedAction
          ? 'SEGNALE MIDI OK · muovi un controllo già configurato'
          : engineConfirmed
            ? `COLLEGAMENTO REALE CONFERMATO · ${lastMappedLabel}`
            : `COMANDO DJ PRO RICEVUTO · ${lastMappedLabel}`;

  const emit = (action: CoreAction, value: number) => {
    const pressed = value > 0;
    const absolute = normalizedMidiValue(value);
    const bipolar = bipolarMidiValue(value);
    const deck = action.startsWith('deckA.') ? 'A' : action.startsWith('deckB.') ? 'B' : null;
    const command = action.split('.')[1];
    if (deck && command === 'play' && pressed) emitDJControl({ type: 'deck.play', deck, pressed: true });
    if (deck && command === 'cue') emitDJControl({ type: 'deck.cue', deck, pressed });
    if (deck && command === 'sync' && pressed) emitDJControl({ type: 'deck.sync', deck, pressed: true });
    if (deck && command === 'loop' && pressed) emitDJControl({ type: 'deck.loop', deck, beats: 4, pressed: true });
    if (deck && command === 'volume') emitDJControl({ type: 'deck.volume', deck, value: absolute });
    if (deck && command === 'filter') emitDJControl({ type: 'deck.filter', deck, value: bipolar });
    if (deck && command === 'eqLow') emitDJControl({ type: 'deck.eqLow', deck, value: bipolar < 0 ? bipolar * 18 : bipolar * 9 });
    if (deck && command === 'eqMid') emitDJControl({ type: 'deck.eqMid', deck, value: bipolar < 0 ? bipolar * 18 : bipolar * 9 });
    if (deck && command === 'eqHigh') emitDJControl({ type: 'deck.eqHigh', deck, value: bipolar < 0 ? bipolar * 18 : bipolar * 9 });
    if (action === 'mixer.crossfader') emitDJControl({ type: 'mixer.crossfader', value: bipolar });
    if (action === 'mixer.master') emitDJControl({ type: 'mixer.master', value: absolute });
  };

  const onMessage = (sourceId: string, event: any) => {
    const data = Array.from(event.data || []) as number[];
    if (data.length < 2) return;
    setSignalByDevice(current => ({ ...current, [sourceId]: (current[sourceId] || 0) + 1 }));
    const [statusByte = 0, data1 = 0, data2 = 0] = data;
    const channel = statusByte & 0x0f;
    const command = statusByte & 0xf0;
    if (command === 0x80) return;
    const currentLearning = learningRef.current;
    if (currentLearning) {
      const next = { ...mappingRef.current, [currentLearning]: { sourceId, status: statusByte, data1, channel } };
      mappingRef.current = next;
      setMapping(next);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setLearning('');
      learningRef.current = '';
      setStatus(`${ACTIONS.find(item => item.id === currentLearning)?.label || currentLearning} configurato con un messaggio MIDI reale.`);
      return;
    }
    const match = (Object.entries(mappingRef.current) as Array<[CoreAction, LearnRule]>).find(([, rule]) =>
      rule.sourceId === sourceId && rule.data1 === data1 && rule.channel === channel && (rule.status & 0xf0) === command
    );
    if (match) {
      setLastMappedAction(match[0]);
      setLastMappedAt(Date.now());
      emit(match[0], data2);
    }
  };

  const syncInputs = (access: any) => {
    const next: MIDIDeviceView[] = [];
    for (const input of Array.from(access.inputs?.values?.() || []) as any[]) {
      if (typeof input.open === 'function' && input.connection !== 'open') void input.open().catch(() => undefined);
      input.onmidimessage = (event: any) => onMessage(input.id, event);
      next.push({ id: input.id, name: input.name || 'MIDI Controller', manufacturer: input.manufacturer || 'Unknown', family: identify(input.name || '') });
    }
    setDevices(next);
    const x1 = next.some(item => item.family === 'X1 MK2');
    const z1 = next.some(item => item.family === 'Z1 MK2');
    setStatus(x1 && z1 ? 'X1 MK2 + Z1 MK2 rilevati via Web MIDI. Ora muovi un controllo fisico per verificare il collegamento reale.' : x1 ? 'X1 MK2 rilevato. Collega anche Z1 MK2.' : z1 ? 'Z1 MK2 rilevato. Collega anche X1 MK2.' : next.length ? 'MIDI rilevato, ma non identificato come X1/Z1 MK2.' : 'Nessun controller MIDI rilevato.');
  };

  const connect = async () => {
    if (typeof (navigator as any).requestMIDIAccess !== 'function') { setStatus('Usa Chrome o Edge desktop: Web MIDI non è disponibile in questo browser.'); return; }
    try {
      setSignalByDevice({});
      setLastMappedAction('');
      setLastMappedAt(0);
      setLastEngineReply('');
      setLastEngineAt(0);
      const access = await (navigator as any).requestMIDIAccess({ sysex: false });
      midiAccessRef.current = access;
      syncInputs(access);
      access.onstatechange = () => syncInputs(access);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Permesso MIDI non concesso.');
    }
  };

  useEffect(() => () => {
    const access = midiAccessRef.current;
    if (!access) return;
    access.onstatechange = null;
    for (const input of Array.from(access.inputs?.values?.() || []) as any[]) input.onmidimessage = null;
  }, []);

  const reset = () => {
    setMapping({});
    mappingRef.current = {};
    localStorage.removeItem(STORAGE_KEY);
    setLearning('');
    learningRef.current = '';
    setLastMappedAction('');
    setLastMappedAt(0);
    setStatus('Configurazione X1/Z1 azzerata.');
  };

  return <div className="space-y-4" data-ni-console="true">
    <section className="rounded-2xl border border-slate-800 bg-[#080b11] p-4 shadow-xl sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2"><Disc3 className="h-4 w-4 text-cyan-300"/><h1 className="text-sm font-black text-white">SONARA DJ PRO · X1 MK2 + Z1 MK2</h1></div>
          <p className="mt-1 text-[10px] text-slate-500">X1 controlla i deck. Z1 controlla mixer e fornisce la scheda audio: selezionala nel blocco AUDIO Z1 MK2.</p>
        </div>
        <div className="flex w-full flex-col gap-2 lg:max-w-xs">
          <button type="button" onClick={() => void connect()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-[9px] font-black text-black"><Usb className="h-4 w-4"/>CONNETTI X1 + Z1</button>
          <button type="button" onClick={() => window.open(NI_DRIVER_URL, '_blank', 'noopener,noreferrer')} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-[9px] font-black text-slate-200"><Download className="h-4 w-4"/>DRIVER NI<ExternalLink className="h-3 w-3"/></button>
          <button type="button" onClick={() => window.open(NI_MIDI_MODE_URL, '_blank', 'noopener,noreferrer')} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-[9px] font-black text-slate-400">MIDI MODE<ExternalLink className="h-3 w-3"/></button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2">
        <div className={`flex items-center justify-between rounded-xl border px-3 py-3 ${hasX1 ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-slate-800 bg-slate-950'}`}><div><div className="text-[9px] font-black text-white">TRAKTOR X1 MK2</div><div className={`mt-1 text-[8px] font-bold ${x1Signal ? 'text-emerald-300' : 'text-slate-600'}`}>{hasX1 ? (x1Signal ? 'SEGNALE MIDI FISICO ATTIVO' : 'RILEVATO · PREMI UN TASTO X1') : 'NON RILEVATO'}</div></div>{hasX1 ? <CheckCircle2 className="h-4 w-4 text-emerald-300"/> : <XCircle className="h-4 w-4 text-slate-700"/>}</div>
        <div className={`flex items-center justify-between rounded-xl border px-3 py-3 ${hasZ1 ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-slate-800 bg-slate-950'}`}><div><div className="text-[9px] font-black text-white">TRAKTOR Z1 MK2</div><div className={`mt-1 text-[8px] font-bold ${z1Signal ? 'text-emerald-300' : 'text-slate-600'}`}>{hasZ1 ? (z1Signal ? 'SEGNALE MIDI FISICO ATTIVO' : 'RILEVATO · MUOVI UNA MANOPOLA Z1') : 'NON RILEVATO'}</div></div>{hasZ1 ? <CheckCircle2 className="h-4 w-4 text-emerald-300"/> : <XCircle className="h-4 w-4 text-slate-700"/>}</div>
        <div className={`rounded-xl border px-3 py-3 ${engineConfirmed ? 'border-emerald-400/35 bg-emerald-400/10' : lastMappedAction ? 'border-cyan-400/30 bg-cyan-400/10' : 'border-slate-800 bg-slate-950'}`}>
          <div className="flex items-start gap-2"><Cable className={`mt-0.5 h-4 w-4 shrink-0 ${engineConfirmed ? 'text-emerald-300' : 'text-cyan-300'}`}/><div><div className="text-[8px] font-black uppercase tracking-[0.16em] text-slate-500">DJ PRO LINK TEST</div><div className={`mt-1 text-[9px] font-black ${engineConfirmed ? 'text-emerald-200' : lastMappedAction ? 'text-cyan-100' : 'text-slate-400'}`}>{linkStatus}</div>{lastEngineReply ? <div className="mt-1 text-[8px] font-bold text-slate-600">Ultima risposta engine: {lastEngineReply}</div> : null}</div></div>
        </div>
      </div>

      <div className="mt-3 flex flex-col items-stretch gap-3 border-t border-slate-900 pt-3">
        <div className="text-[8px] font-bold text-slate-600">TEST REALE: premi PLAY/CUE su X1 oppure muovi crossfader/volume su Z1. “Segnale MIDI fisico attivo” prova che il controller sta parlando con Sonara; “Comando DJ Pro ricevuto” prova che il mapping sta comandando DJ Pro.</div>
        <div className="text-[8px] font-bold text-slate-600">X1 non è una scheda audio. Il Master deve uscire dallo Z1 MK2 oppure dall'uscita Windows scelta.</div>
        <button type="button" onClick={() => setAdvanced(value => !value)} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-2 text-[8px] font-black text-slate-400"><Settings2 className="h-3 w-3"/>{advanced ? 'CHIUDI CONFIG' : `CONFIGURA CONTROLLI · ${mappedCount}/20`}</button>
      </div>
      <div className="mt-3 rounded-xl border border-slate-800 bg-black/20 px-3 py-2 text-[9px] text-slate-500">{status}</div>
    </section>

    <div className="ni-audio"><DJAudioRouting/></div>

    {advanced ? <section className="rounded-2xl border border-slate-800 bg-[#080b11] p-4">
      <div className="flex flex-col items-stretch gap-3"><div><div className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-fuchsia-300"/><h2 className="text-xs font-black text-white">Configurazione una tantum X1 / Z1</h2></div><p className="mt-1 text-[9px] text-slate-600">Premi una funzione e muovi il controllo fisico corrispondente. Il messaggio MIDI reale viene salvato con il dispositivo sorgente.</p></div><button onClick={reset} className="w-full rounded-lg border border-slate-800 px-2 py-2 text-[8px] font-black text-slate-500">RESET</button></div>
      <div className="mt-3 grid grid-cols-1 gap-2">{ACTIONS.map(action => { const rule = mapping[action.id]; const active = learning === action.id; return <button key={action.id} onClick={() => { const next = active ? '' : action.id; setLearning(next); learningRef.current = next; }} className={`w-full rounded-xl border p-3 text-left ${active ? 'border-amber-400/40 bg-amber-400/10' : rule ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-slate-800 bg-slate-950'}`}><div className="text-[8px] font-black text-white">{action.label}</div><div className="mt-1 text-[7px] font-bold text-slate-600">{active ? `MUOVI ORA · ${action.preferred}` : rule ? `OK · ${action.preferred}` : action.preferred}</div></button>; })}</div>
    </section> : null}

    <DJDeckSkinManager profileId="ni-x1mk2-z1mk2" profileName="X1 MK2 + Z1 MK2" />
    <div className="ni-decks"><DJLiveMixer/></div>
    <style>{`
      [data-ni-console] .ni-audio > section { border-radius:18px!important; background:#080b11!important; border-color:rgba(34,211,238,.18)!important; }
      [data-ni-console] .ni-audio > section > div:first-child { flex-direction:column!important; align-items:stretch!important; }
      [data-ni-console] .ni-audio > section > div:first-child p { display:none; }
      [data-ni-console] .ni-audio > section > div:first-child h2::after { content:' · Z1 MK2'; color:#67e8f9; }
      [data-ni-console] .ni-audio > section > div:nth-child(2) { grid-template-columns:1fr!important; }
      [data-ni-console] .ni-audio > section > div:nth-child(2) > label:nth-child(2),
      [data-ni-console] .ni-audio > section > div:nth-child(2) > label:nth-child(3),
      [data-ni-console] .ni-audio > section > div:nth-child(3) { display:none!important; }
      [data-ni-console] .ni-audio button { width:100%!important; min-height:42px; justify-content:center; }
      [data-ni-console] .ni-decks > section { border-radius:18px!important; border-color:rgba(51,65,85,.75)!important; background:#05070b!important; }
      [data-ni-console] .ni-decks > section > div:first-child p { display:none; }
      [data-ni-console] .ni-decks .grid:has(> button) { grid-template-columns:minmax(0,1fr)!important; }
      [data-ni-console] .ni-decks .flex:has(> button) { flex-direction:column!important; align-items:stretch!important; }
      [data-ni-console] .ni-decks button { width:100%!important; min-height:44px; justify-content:center; }
      [data-ni-console] input[type=range] { min-height:20px; }
    `}</style>
  </div>;
}
