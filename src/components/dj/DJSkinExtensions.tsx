import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Eye, EyeOff, ImagePlus, Layers3, MousePointer2, RotateCcw, Trash2, Upload, Zap } from 'lucide-react';
import { DJControlAction, DJDeckId, emitDJControl, onDJFeedback } from './djRuntime';

type ImportedSkin = {
  id: string;
  profileId: string;
  name: string;
  mime: string;
  size: number;
  width: number;
  height: number;
  dataUrl: string;
  createdAt: number;
};

type InteractionMap = 'none' | 'dual-deck-1920';

type ActiveSkin = {
  skinId: string;
  interactionMap: InteractionMap;
};

const DB_NAME = 'sonara-dj-skin-extensions';
const DB_VERSION = 1;
const STORE = 'skins';
const ACTIVE_KEY = (profileId: string) => `sonara.dj.skin-extension.active.v2.${profileId}`;
const LEGACY_ACTIVE_KEY = (profileId: string) => `sonara.dj.skin-extension.active.v1.${profileId}`;
const SONARA_SKIN_KEY = (profileId: string) => `sonara.dj.real-skins.v5.${profileId || 'generic-midi'}`;
const SUPPORTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BYTES = 18 * 1024 * 1024;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB non disponibile'));
  });
}

async function listSkins(profileId: string): Promise<ImportedSkin[]> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => resolve((request.result as ImportedSkin[]).filter(item => item.profileId === profileId).sort((a, b) => b.createdAt - a.createdAt));
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function saveSkin(skin: ImportedSkin) {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(skin);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function removeSkin(id: string) {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Impossibile leggere il file'));
    reader.readAsDataURL(file);
  });
}

function readDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 0, height: image.naturalHeight || 0 });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = dataUrl;
  });
}

function readActive(profileId: string): ActiveSkin | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(localStorage.getItem(ACTIVE_KEY(profileId)) || 'null') as ActiveSkin | null;
    if (!value?.skinId) return null;
    return value;
  } catch {
    return null;
  }
}

function getDeckSection() {
  const section = document.querySelector('[data-ni-console] .ni-decks > section');
  return section instanceof HTMLElement ? section : null;
}

function locateDeck(target: DJDeckId): HTMLElement | null {
  const direct = document.querySelector(`[data-ni-console] [data-sonara-deck="${target}"]`);
  if (direct instanceof HTMLElement) return direct;
  const section = getDeckSection();
  const deckGrid = section?.children.item(1);
  const candidate = deckGrid?.children.item(target === 'A' ? 0 : 1);
  return candidate instanceof HTMLElement ? candidate : null;
}

function clearLegacyDom() {
  const section = getDeckSection();
  const deckA = locateDeck('A');
  const deckB = locateDeck('B');
  for (const element of [section, deckA, deckB]) {
    if (!(element instanceof HTMLElement)) continue;
    element.removeAttribute('data-sonara-image-skin');
    element.removeAttribute('data-sonara-console-image-skin');
    element.style.removeProperty('--sonara-custom-skin-image');
    element.style.removeProperty('--sonara-custom-image-opacity');
    element.style.removeProperty('--sonara-custom-panel-opacity');
    element.style.removeProperty('--sonara-custom-fit');
  }
}

function setImageMode(enabled: boolean) {
  const section = getDeckSection();
  if (!section) return false;
  if (enabled) section.setAttribute('data-sonara-image-live', 'true');
  else section.removeAttribute('data-sonara-image-live');
  return true;
}

function autoInteractionMap(skin?: ImportedSkin): InteractionMap {
  if (!skin) return 'none';
  const name = skin.name.toLowerCase();
  if (skin.width === 1920 && skin.height === 1080 && (name.includes('pioneer') || name.includes('virtually'))) return 'dual-deck-1920';
  return 'none';
}

function clickDeckFileInput(deck: DJDeckId) {
  const input = locateDeck(deck)?.querySelector('input[type="file"]');
  if (input instanceof HTMLInputElement) {
    input.click();
    return true;
  }
  return false;
}

function HotButton({ label, left, top, width, height, debug, onClick, onPointerDown, onPointerUp }: {
  label: string;
  left: string;
  top: string;
  width: string;
  height: string;
  debug: boolean;
  onClick?: () => void;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
}) {
  return <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    onPointerDown={onPointerDown}
    onPointerUp={onPointerUp}
    onPointerCancel={onPointerUp}
    onPointerLeave={event => { if (event.buttons) onPointerUp?.(); }}
    className={`absolute z-30 rounded-md ${debug ? 'border border-cyan-300 bg-cyan-300/15 text-[8px] font-black text-white' : 'border border-transparent bg-transparent text-transparent'}`}
    style={{ left, top, width, height }}
  >{debug ? label : <span className="sr-only">{label}</span>}</button>;
}

function VerticalRange({ label, left, top, width, height, min, max, step, defaultValue, debug, onValue }: {
  label: string;
  left: string;
  top: string;
  width: string;
  height: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  debug: boolean;
  onValue: (value: number) => void;
}) {
  return <input
    type="range"
    aria-label={label}
    title={label}
    min={min}
    max={max}
    step={step}
    defaultValue={defaultValue}
    onChange={event => onValue(Number(event.currentTarget.value))}
    className="absolute z-30 cursor-pointer"
    style={{ left, top, width, height, writingMode: 'vertical-lr', direction: 'rtl', opacity: debug ? 0.75 : 0.015 }}
  />;
}

function HorizontalRange({ label, left, top, width, height, min, max, step, defaultValue, debug, onValue }: {
  label: string;
  left: string;
  top: string;
  width: string;
  height: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  debug: boolean;
  onValue: (value: number) => void;
}) {
  return <input
    type="range"
    aria-label={label}
    title={label}
    min={min}
    max={max}
    step={step}
    defaultValue={defaultValue}
    onChange={event => onValue(Number(event.currentTarget.value))}
    className="absolute z-30 cursor-pointer"
    style={{ left, top, width, height, opacity: debug ? 0.75 : 0.015 }}
  />;
}

function DualDeckInteractiveMap({ debug, send, loadDeck }: {
  debug: boolean;
  send: (action: DJControlAction, label: string) => void;
  loadDeck: (deck: DJDeckId) => void;
}) {
  const hotCueA = [7.25, 12.45, 17.62, 22.78];
  const hotCueB = [73.35, 78.50, 83.68, 88.85];
  return <>
    <HotButton label="LOAD A" left="0.4%" top="6.3%" width="5.2%" height="8.8%" debug={debug} onClick={() => loadDeck('A')} />
    <HotButton label="LOAD B" left="72.1%" top="6.3%" width="5.2%" height="8.8%" debug={debug} onClick={() => loadDeck('B')} />

    <HotButton label="PLAY A" left="0.45%" top="88.1%" width="5.5%" height="9.5%" debug={debug} onClick={() => send({ type: 'deck.play', deck: 'A', pressed: true }, 'PLAY A')} />
    <HotButton label="CUE A" left="0.55%" top="77.1%" width="5.2%" height="9.2%" debug={debug} onPointerDown={() => send({ type: 'deck.cue', deck: 'A', pressed: true }, 'CUE A')} onPointerUp={() => emitDJControl({ type: 'deck.cue', deck: 'A', pressed: false })} />
    <HotButton label="SYNC A" left="29.05%" top="53.6%" width="2.25%" height="3.5%" debug={debug} onClick={() => send({ type: 'deck.sync', deck: 'A', pressed: true }, 'SYNC A')} />
    <HotButton label="LOOP A" left="12.1%" top="86.1%" width="5.6%" height="2.7%" debug={debug} onClick={() => send({ type: 'deck.loop', deck: 'A', beats: 4, pressed: true }, 'LOOP A')} />

    <HotButton label="PLAY B" left="67.05%" top="88.1%" width="5.5%" height="9.5%" debug={debug} onClick={() => send({ type: 'deck.play', deck: 'B', pressed: true }, 'PLAY B')} />
    <HotButton label="CUE B" left="67.15%" top="77.1%" width="5.2%" height="9.2%" debug={debug} onPointerDown={() => send({ type: 'deck.cue', deck: 'B', pressed: true }, 'CUE B')} onPointerUp={() => emitDJControl({ type: 'deck.cue', deck: 'B', pressed: false })} />
    <HotButton label="SYNC B" left="95.55%" top="53.6%" width="2.25%" height="3.5%" debug={debug} onClick={() => send({ type: 'deck.sync', deck: 'B', pressed: true }, 'SYNC B')} />
    <HotButton label="LOOP B" left="78.65%" top="86.1%" width="5.6%" height="2.7%" debug={debug} onClick={() => send({ type: 'deck.loop', deck: 'B', beats: 4, pressed: true }, 'LOOP B')} />

    {hotCueA.map((left, index) => <HotButton key={`a-${index}`} label={`HOT ${index + 1} A`} left={`${left}%`} top="89.1%" width="4.65%" height="7.6%" debug={debug} onClick={() => send({ type: 'deck.hotcue', deck: 'A', index, pressed: true }, `HOT ${index + 1} A`)} />)}
    {hotCueB.map((left, index) => <HotButton key={`b-${index}`} label={`HOT ${index + 1} B`} left={`${left}%`} top="89.1%" width="4.65%" height="7.6%" debug={debug} onClick={() => send({ type: 'deck.hotcue', deck: 'B', index, pressed: true }, `HOT ${index + 1} B`)} />)}

    <VerticalRange label="PITCH A" left="28.75%" top="66.0%" width="2.5%" height="25.3%" min={-16} max={16} step={0.1} defaultValue={0} debug={debug} onValue={value => send({ type: 'deck.pitch', deck: 'A', value }, 'PITCH A')} />
    <VerticalRange label="PITCH B" left="95.25%" top="66.0%" width="2.5%" height="25.3%" min={-16} max={16} step={0.1} defaultValue={0} debug={debug} onValue={value => send({ type: 'deck.pitch', deck: 'B', value }, 'PITCH B')} />
    <VerticalRange label="VOLUME A" left="41.65%" top="78.1%" width="2.8%" height="18.2%" min={0} max={1} step={0.01} defaultValue={0.9} debug={debug} onValue={value => send({ type: 'deck.volume', deck: 'A', value }, 'VOLUME A')} />
    <VerticalRange label="VOLUME B" left="55.35%" top="78.1%" width="2.8%" height="18.2%" min={0} max={1} step={0.01} defaultValue={0.9} debug={debug} onValue={value => send({ type: 'deck.volume', deck: 'B', value }, 'VOLUME B')} />
    <HorizontalRange label="CROSSFADER" left="45.1%" top="95.0%" width="9.8%" height="3.4%" min={-1} max={1} step={0.01} defaultValue={0} debug={debug} onValue={value => send({ type: 'mixer.crossfader', value }, 'CROSSFADER')} />
  </>;
}

export default function DJSkinExtensions({ profileId }: { profileId: string }) {
  const [skins, setSkins] = useState<ImportedSkin[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [interactionMap, setInteractionMap] = useState<InteractionMap>('none');
  const [active, setActive] = useState<ActiveSkin | null>(null);
  const [deckHost, setDeckHost] = useState<HTMLElement | null>(null);
  const [debugHotspots, setDebugHotspots] = useState(false);
  const [status, setStatus] = useState('Scegli una sola modalita: SONARA LIVE oppure IMMAGINE LIVE. Le due interfacce non vengono piu sovrapposte.');
  const [lastCommand, setLastCommand] = useState('');
  const [lastFeedback, setLastFeedback] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const selected = useMemo(() => skins.find(item => item.id === selectedId), [skins, selectedId]);
  const activeSkin = useMemo(() => active ? skins.find(item => item.id === active.skinId) : undefined, [active, skins]);

  useEffect(() => onDJFeedback(feedback => {
    const deck = feedback.deck ? ` DECK ${feedback.deck}` : '';
    setLastFeedback(`${feedback.control.toUpperCase()}${deck}`);
  }), []);

  useEffect(() => {
    clearLegacyDom();
    localStorage.removeItem(LEGACY_ACTIVE_KEY(profileId));
    const syncHost = () => setDeckHost(current => {
      const next = getDeckSection();
      return current === next ? current : next;
    });
    syncHost();
    const timer = window.setInterval(syncHost, 350);
    return () => window.clearInterval(timer);
  }, [profileId]);

  useEffect(() => {
    let cancelled = false;
    void listSkins(profileId).then(items => {
      if (cancelled) return;
      setSkins(items);
      const saved = readActive(profileId);
      const validSaved = saved && items.some(item => item.id === saved.skinId) ? saved : null;
      setActive(validSaved);
      const initialId = validSaved?.skinId || items[0]?.id || '';
      setSelectedId(initialId);
      const initialSkin = items.find(item => item.id === initialId);
      setInteractionMap(validSaved?.interactionMap || autoInteractionMap(initialSkin));
    }).catch(error => setStatus(error instanceof Error ? error.message : 'Archivio skin non disponibile.'));
    return () => { cancelled = true; };
  }, [profileId]);

  useEffect(() => {
    if (!deckHost) return;
    setImageMode(Boolean(active && activeSkin));
    return () => { deckHost.removeAttribute('data-sonara-image-live'); };
  }, [deckHost, active, activeSkin]);

  useEffect(() => {
    if (!selected) return;
    if (!active || active.skinId !== selected.id) setInteractionMap(autoInteractionMap(selected));
  }, [selectedId]);

  const importFile = async (file?: File) => {
    if (!file) return;
    if (!SUPPORTED_TYPES.has(file.type)) { setStatus('Formato non supportato. Usa PNG, JPG/JPEG oppure WebP.'); return; }
    if (file.size > MAX_BYTES) { setStatus('Immagine troppo grande. Limite: 18 MB.'); return; }
    try {
      setStatus('Importazione skin in corso...');
      const dataUrl = await readFile(file);
      const dimensions = await readDimensions(dataUrl);
      const skin: ImportedSkin = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        profileId,
        name: file.name.replace(/\.[^.]+$/, '') || 'Custom Skin',
        mime: file.type,
        size: file.size,
        width: dimensions.width,
        height: dimensions.height,
        dataUrl,
        createdAt: Date.now()
      };
      await saveSkin(skin);
      const next = [skin, ...skins];
      setSkins(next);
      setSelectedId(skin.id);
      setInteractionMap(autoInteractionMap(skin));
      setStatus(`Skin caricata: ${skin.name} · ${skin.width || '?'}x${skin.height || '?'}. Premi USA IMMAGINE LIVE.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Importazione skin non riuscita.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const useImageLive = () => {
    if (!selected) { setStatus('Prima carica o seleziona una skin.'); return; }
    const next: ActiveSkin = { skinId: selected.id, interactionMap };
    localStorage.setItem(ACTIVE_KEY(profileId), JSON.stringify(next));
    localStorage.removeItem(LEGACY_ACTIVE_KEY(profileId));
    clearLegacyDom();
    setActive(next);
    setImageMode(true);
    setStatus(`${selected.name}: IMMAGINE LIVE attiva. La vecchia UI e nascosta, ma il motore audio resta acceso dietro la skin.`);
  };

  const useCleanSonara = () => {
    localStorage.removeItem(ACTIVE_KEY(profileId));
    localStorage.removeItem(LEGACY_ACTIVE_KEY(profileId));
    localStorage.setItem(SONARA_SKIN_KEY(profileId), JSON.stringify({ A: 'prime', B: 'prime' }));
    clearLegacyDom();
    setImageMode(false);
    setActive(null);
    setStatus('Ripristino SONARA LIVE PRIME in corso...');
    window.setTimeout(() => window.location.reload(), 80);
  };

  const disableImage = () => {
    localStorage.removeItem(ACTIVE_KEY(profileId));
    clearLegacyDom();
    setImageMode(false);
    setActive(null);
    setStatus('IMMAGINE LIVE disattivata. Il motore DJ resta disponibile nella UI Sonara.');
  };

  const deleteSelected = async () => {
    if (!selected) return;
    await removeSkin(selected.id);
    const next = skins.filter(item => item.id !== selected.id);
    setSkins(next);
    setSelectedId(next[0]?.id || '');
    if (active?.skinId === selected.id) disableImage();
    setStatus('Skin rimossa dalla libreria locale.');
  };

  const send = (action: DJControlAction, label: string) => {
    setLastCommand(label);
    emitDJControl(action);
  };

  const loadDeck = (deck: DJDeckId) => {
    setLastCommand(`LOAD ${deck}`);
    if (clickDeckFileInput(deck)) setStatus(`Seleziona ora il file audio per DECK ${deck}.`);
    else setStatus(`Input DECK ${deck} non ancora pronto. Riprova tra un secondo.`);
  };

  const stage = deckHost && activeSkin && active ? createPortal(
    <div
      data-sonara-live-image-stage="true"
      className="relative z-20 mx-auto min-w-[960px] overflow-hidden bg-black"
      style={{ width: '100%', aspectRatio: `${activeSkin.width || 16} / ${activeSkin.height || 9}` }}
    >
      <img src={activeSkin.dataUrl} alt={activeSkin.name} draggable={false} className="absolute inset-0 h-full w-full select-none object-fill" />
      {active.interactionMap === 'dual-deck-1920' ? <DualDeckInteractiveMap debug={debugHotspots} send={send} loadDeck={loadDeck} /> : null}
      {debugHotspots ? <div className="pointer-events-none absolute left-1/2 top-2 z-40 -translate-x-1/2 rounded-full bg-black/80 px-3 py-1 text-[9px] font-black text-cyan-200">ZONE INTERATTIVE DI TEST</div> : null}
    </div>, deckHost
  ) : null;

  return <section className="rounded-2xl border border-fuchsia-500/20 bg-[linear-gradient(145deg,#09070e,#06070b)] p-4 sm:p-5" data-sonara-skin-extensions="true">
    <style>{`
      [data-ni-console] .ni-decks > section[data-sonara-image-live="true"]{
        display:block!important;position:relative!important;min-height:0!important;height:auto!important;padding:0!important;margin:0!important;overflow:auto!important;
        border:1px solid rgba(148,163,184,.22)!important;border-radius:12px!important;background:#000!important;box-shadow:0 22px 70px rgba(0,0,0,.55)!important
      }
      [data-ni-console] .ni-decks > section[data-sonara-image-live="true"] > div:not([data-sonara-live-image-stage="true"]){
        position:absolute!important;inset:0 auto auto 0!important;width:1px!important;height:1px!important;min-width:0!important;min-height:0!important;max-width:1px!important;max-height:1px!important;
        margin:0!important;padding:0!important;overflow:hidden!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important;transform:none!important;z-index:-1!important
      }
      [data-ni-console] .ni-decks > section[data-sonara-image-live="true"] [data-deck-skin]::before,
      [data-ni-console] .ni-decks > section[data-sonara-image-live="true"] [data-deck-skin]::after{display:none!important}
      [data-sonara-live-image-stage="true"] button:focus-visible,[data-sonara-live-image-stage="true"] input:focus-visible{outline:2px solid #67e8f9;outline-offset:1px}
    `}</style>

    {stage}

    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2"><Layers3 className="h-4 w-4 text-fuchsia-300"/><h2 className="text-sm font-black text-white">SKIN EXTENSIONS · EXCLUSIVE MODE</h2><span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[8px] font-black text-emerald-200">NO OVERLAP</span></div>
        <p className="mt-1 max-w-3xl text-[9px] leading-5 text-slate-500">Una sola interfaccia alla volta. IMMAGINE LIVE nasconde completamente la console grafica precedente, ma lascia montato il vero Deck Engine per audio, MIDI X1/Z1 e comandi.</p>
      </div>
      <div className="grid w-full gap-2 sm:grid-cols-2 xl:max-w-xl">
        <button type="button" onClick={useCleanSonara} className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-4 py-2.5 text-[9px] font-black text-cyan-100"><RotateCcw className="h-4 w-4"/>SONARA LIVE PULITA</button>
        <button type="button" onClick={useImageLive} className="inline-flex items-center justify-center gap-2 rounded-xl bg-fuchsia-500 px-4 py-2.5 text-[9px] font-black text-white"><Zap className="h-4 w-4"/>USA IMMAGINE LIVE</button>
      </div>
    </div>

    <div className="mt-4 grid gap-3 xl:grid-cols-[1.15fr_.85fr]">
      <div className="rounded-xl border border-slate-800 bg-black/20 p-3">
        <div className="mb-2 flex items-center justify-between gap-2"><span className="text-[8px] font-black uppercase tracking-[.16em] text-slate-600">Libreria immagini</span><div><input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={event => void importFile(event.target.files?.[0])}/><button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-fuchsia-400/25 px-3 py-2 text-[8px] font-black text-fuchsia-200"><Upload className="h-3.5 w-3.5"/>CARICA</button></div></div>
        {skins.length ? <div className="grid gap-2 sm:grid-cols-2">{skins.map(skin => <button type="button" key={skin.id} onClick={() => { setSelectedId(skin.id); setInteractionMap(active?.skinId === skin.id ? active.interactionMap : autoInteractionMap(skin)); }} className={`overflow-hidden rounded-xl border text-left ${selectedId === skin.id ? 'border-fuchsia-400/45 bg-fuchsia-400/8' : 'border-slate-800 bg-slate-950'}`}>
          <div className="aspect-video bg-black bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${skin.dataUrl})` }}/>
          <div className="p-2.5"><div className="flex items-center justify-between gap-2"><span className="truncate text-[9px] font-black text-white">{skin.name}</span>{selectedId === skin.id ? <Check className="h-3.5 w-3.5 text-fuchsia-300"/> : <ImagePlus className="h-3.5 w-3.5 text-slate-700"/>}</div><div className="mt-1 text-[7px] font-bold text-slate-600">{skin.width || '?'}x{skin.height || '?'} · {(skin.size / 1024 / 1024).toFixed(1)} MB</div></div>
        </button>)}</div> : <div className="rounded-xl border border-dashed border-slate-800 px-4 py-8 text-center text-[9px] font-bold text-slate-600">Nessuna immagine caricata.</div>}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
        <div className="text-[8px] font-black uppercase tracking-[.16em] text-slate-600">Interazione reale</div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setInteractionMap('none')} className={`rounded-lg border px-2 py-2 text-[8px] font-black ${interactionMap === 'none' ? 'border-slate-500 bg-slate-800 text-white' : 'border-slate-800 text-slate-600'}`}>SOLO IMMAGINE</button>
          <button type="button" onClick={() => setInteractionMap('dual-deck-1920')} className={`rounded-lg border px-2 py-2 text-[8px] font-black ${interactionMap === 'dual-deck-1920' ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100' : 'border-slate-800 text-slate-600'}`}>2 DECK 1920x1080</button>
        </div>
        <p className="mt-2 text-[8px] leading-4 text-slate-600">La mappa 2 DECK rende cliccabili le zone della skin che hai passato: caricamento tracce, PLAY, CUE, SYNC, LOOP, HOT CUE, pitch, volume e crossfader.</p>

        <button type="button" onClick={() => setDebugHotspots(value => !value)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-[8px] font-black text-slate-400">{debugHotspots ? <EyeOff className="h-3.5 w-3.5"/> : <Eye className="h-3.5 w-3.5"/>}{debugHotspots ? 'NASCONDI ZONE DI TEST' : 'MOSTRA ZONE DI TEST'}</button>

        <div className="mt-3 rounded-lg border border-slate-800 bg-black/30 p-3">
          <div className="flex items-center gap-2 text-[8px] font-black text-slate-500"><MousePointer2 className="h-3.5 w-3.5"/>TEST COLLEGAMENTO SKIN → ENGINE</div>
          <div className="mt-2 text-[9px] font-black text-white">ULTIMO COMANDO: {lastCommand || '—'}</div>
          <div className={`mt-1 text-[9px] font-black ${lastFeedback ? 'text-emerald-300' : 'text-slate-600'}`}>FEEDBACK ENGINE: {lastFeedback || 'attesa di PLAY/crossfader'}</div>
        </div>

        <div className="mt-3 grid gap-2">
          <button type="button" onClick={disableImage} className="w-full rounded-xl border border-slate-800 px-3 py-2 text-[8px] font-black text-slate-500">DISATTIVA SOLO IMMAGINE</button>
          <button type="button" disabled={!selected} onClick={() => void deleteSelected()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/15 px-3 py-2 text-[8px] font-black text-red-300/70 disabled:opacity-30"><Trash2 className="h-3.5 w-3.5"/>ELIMINA DALLA LIBRERIA</button>
        </div>
      </div>
    </div>

    <div className="mt-3 rounded-xl border border-slate-800 bg-black/25 px-3 py-2 text-[8px] font-bold leading-4 text-slate-500">{status}</div>
  </section>;
}
