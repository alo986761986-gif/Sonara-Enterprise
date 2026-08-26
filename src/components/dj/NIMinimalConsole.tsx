import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Cable, CheckCircle2, Disc3, Download, ExternalLink, Settings2, SlidersHorizontal, Usb, XCircle } from 'lucide-react';
import DJLiveMixer from './DJLiveMixer';
import { bipolarMidiValue, emitDJControl, normalizedMidiValue } from './djRuntime';

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
  const midiAccessRef = useRef<any>(null);
  const mappingRef = useRef(mapping);
  const learningRef = useRef<CoreAction | ''>(learning);

  useEffect(() => { mappingRef.current = mapping; }, [mapping]);
  useEffect(() => { learningRef.current = learning; }, [learning]);

  const hasX1 = devices.some(device => device.family === 'X1 MK2');
  const hasZ1 = devices.some(device => device.family === 'Z1 MK2');
  const mappedCount = useMemo(() => Object.keys(mapping).length, [mapping]);

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
    const [status = 0, data1 = 0, data2 = 0] = data;
    const channel = status & 0x0f;
    const command = status & 0xf0;
    if (command === 0x80) return;
    const currentLearning = learningRef.current;
    if (currentLearning) {
      const next = { ...mappingRef.current, [currentLearning]: { sourceId, status, data1, channel } };
      mappingRef.current = next;
      setMapping(next);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setLearning('');
      learningRef.current = '';
      setStatus(`${ACTIONS.find(item => item.id === currentLearning)?.label || currentLearning} configurato.`);
      return;
    }
    const match = (Object.entries(mappingRef.current) as Array<[CoreAction, LearnRule]>).find(([, rule]) =>
      rule.sourceId === sourceId && rule.data1 === data1 && rule.channel === channel && (rule.status & 0xf0) === command
    );
    if (match) emit(match[0], data2);
  };

  const syncInputs = (access: any) => {
    const next: MIDIDeviceView[] = [];
    for (const input of Array.from(access.inputs?.values?.() || []) as any[]) {
      input.onmidimessage = (event: any) => onMessage(input.id, event);
      next.push({ id: input.id, name: input.name || 'MIDI Controller', manufacturer: input.manufacturer || 'Unknown', family: identify(input.name || '') });
    }
    setDevices(next);
    const x1 = next.some(item => item.family === 'X1 MK2');
    const z1 = next.some(item => item.family === 'Z1 MK2');
    setStatus(x1 && z1 ? 'X1 MK2 + Z1 MK2 collegati. Console pronta.' : x1 ? 'X1 MK2 rilevato. Collega anche Z1 MK2.' : z1 ? 'Z1 MK2 rilevato. Collega anche X1 MK2.' : next.length ? 'MIDI rilevato, ma non identificato come X1/Z1 MK2.' : 'Nessun controller MIDI rilevato.');
  };

  const connect = async () => {
    if (typeof (navigator as any).requestMIDIAccess !== 'function') { setStatus('Usa Chrome o Edge desktop: Web MIDI non è disponibile in questo browser.'); return; }
    try {
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
    setMapping({}); mappingRef.current = {}; localStorage.removeItem(STORAGE_KEY); setLearning(''); learningRef.current = '';
    setStatus('Configurazione X1/Z1 azzerata.');
  };

  return <div className="space-y-4" data-ni-console="true">
    <section className="rounded-2xl border border-slate-800 bg-[#080b11] p-4 shadow-xl sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2"><Disc3 className="h-4 w-4 text-cyan-300"/><h1 className="text-sm font-black text-white">SONARA DJ PRO · X1 MK2 + Z1 MK2</h1></div>
          <p className="mt-1 text-[10px] text-slate-500">X1 controlla i deck. Z1 controlla mixer, EQ, filtri, volumi e crossfader.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void connect()} className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-[9px] font-black text-black"><Usb className="h-4 w-4"/>CONNETTI X1 + Z1</button>
          <button type="button" onClick={() => window.open(NI_DRIVER_URL, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-[9px] font-black text-slate-200"><Download className="h-4 w-4"/>DRIVER NI<ExternalLink className="h-3 w-3"/></button>
          <button type="button" onClick={() => window.open(NI_MIDI_MODE_URL, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-[9px] font-black text-slate-400">MIDI MODE<ExternalLink className="h-3 w-3"/></button>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr]">
        <div className={`flex items-center justify-between rounded-xl border px-3 py-2 ${hasX1 ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-slate-800 bg-slate-950'}`}><span className="text-[9px] font-black text-white">TRAKTOR X1 MK2</span>{hasX1 ? <CheckCircle2 className="h-4 w-4 text-emerald-300"/> : <XCircle className="h-4 w-4 text-slate-700"/>}</div>
        <div className={`flex items-center justify-between rounded-xl border px-3 py-2 ${hasZ1 ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-slate-800 bg-slate-950'}`}><span className="text-[9px] font-black text-white">TRAKTOR Z1 MK2</span>{hasZ1 ? <CheckCircle2 className="h-4 w-4 text-emerald-300"/> : <XCircle className="h-4 w-4 text-slate-700"/>}</div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-[9px] text-slate-400"><Cable className="h-4 w-4 shrink-0 text-cyan-300"/><span>{status}</span></div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-900 pt-3">
        <span className="text-[8px] font-bold text-slate-600">I driver vengono installati nel sistema operativo tramite Native Instruments; SONARA non simula driver proprietari.</span>
        <button type="button" onClick={() => setAdvanced(value => !value)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-[8px] font-black text-slate-400"><Settings2 className="h-3 w-3"/>{advanced ? 'CHIUDI CONFIG' : `CONFIGURA CONTROLLI · ${mappedCount}/20`}</button>
      </div>
    </section>

    {advanced ? <section className="rounded-2xl border border-slate-800 bg-[#080b11] p-4">
      <div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-fuchsia-300"/><h2 className="text-xs font-black text-white">Configurazione una tantum X1 / Z1</h2></div><p className="mt-1 text-[9px] text-slate-600">Premi una funzione e muovi il controllo fisico corrispondente. Il messaggio MIDI reale viene salvato con il dispositivo sorgente.</p></div><button onClick={reset} className="rounded-lg border border-slate-800 px-2 py-1.5 text-[8px] font-black text-slate-500">RESET</button></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">{ACTIONS.map(action => { const rule = mapping[action.id]; const active = learning === action.id; return <button key={action.id} onClick={() => { const next = active ? '' : action.id; setLearning(next); learningRef.current = next; }} className={`rounded-xl border p-3 text-left ${active ? 'border-amber-400/40 bg-amber-400/10' : rule ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-slate-800 bg-slate-950'}`}><div className="text-[8px] font-black text-white">{action.label}</div><div className="mt-1 text-[7px] font-bold text-slate-600">{active ? `MUOVI ORA · ${action.preferred}` : rule ? `OK · ${action.preferred}` : action.preferred}</div></button>; })}</div>
    </section> : null}

    <div className="ni-decks"><DJLiveMixer/></div>
    <style>{`
      [data-ni-console] .ni-decks > section { border-radius: 18px !important; border-color: rgba(51,65,85,.75) !important; background: #05070b !important; }
      [data-ni-console] .ni-decks > section > div:first-child p { display:none; }
      [data-ni-console] .ni-decks > section > div:nth-child(2) > div { min-height: 470px; position:relative; overflow:hidden; border-color:rgba(51,65,85,.8)!important; background:linear-gradient(180deg,#090d14,#05070b)!important; }
      [data-ni-console] .ni-decks > section > div:nth-child(2) > div::after { content:''; position:absolute; right:20px; top:78px; width:126px; height:126px; border-radius:9999px; border:12px solid #111827; box-shadow:inset 0 0 0 1px #334155,0 10px 28px rgba(0,0,0,.35); background:repeating-radial-gradient(circle,#111827 0 2px,#020617 3px 5px); opacity:.72; pointer-events:none; }
      [data-ni-console] .ni-decks > section > div:nth-child(2) > div > div:nth-child(2) { margin-top:150px!important; height:110px!important; }
      [data-ni-console] input[type=range] { min-height:20px; }
      @media (max-width:1279px){ [data-ni-console] .ni-decks > section > div:nth-child(2) > div::after{width:104px;height:104px;top:82px} [data-ni-console] .ni-decks > section > div:nth-child(2) > div > div:nth-child(2){margin-top:130px!important;} }
    `}</style>
  </div>;
}
