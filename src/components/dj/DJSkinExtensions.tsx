import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ImagePlus, Layers3, Trash2, Upload } from 'lucide-react';

type SkinTarget = 'CONSOLE' | 'A' | 'B';
type SkinFit = 'contain' | 'cover' | 'fill';

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

type ActiveSkin = {
  skinId: string;
  target: SkinTarget;
  fit: SkinFit;
  imageOpacity: number;
  panelOpacity: number;
};

const DB_NAME = 'sonara-dj-skin-extensions';
const DB_VERSION = 1;
const STORE = 'skins';
const ACTIVE_KEY = (profileId: string) => `sonara.dj.skin-extension.active.v1.${profileId}`;
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

function locateDeck(target: 'A' | 'B'): HTMLElement | null {
  const direct = document.querySelector(`[data-ni-console] [data-sonara-deck="${target}"]`);
  if (direct instanceof HTMLElement) return direct;
  const section = document.querySelector('[data-ni-console] .ni-decks > section');
  const deckGrid = section?.children.item(1);
  const index = target === 'A' ? 0 : 1;
  const candidate = deckGrid?.children.item(index);
  return candidate instanceof HTMLElement ? candidate : null;
}

function clearAppliedSkin() {
  const section = document.querySelector('[data-ni-console] .ni-decks > section');
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

function applyToDom(skin: ImportedSkin | undefined, active: ActiveSkin | null) {
  clearAppliedSkin();
  if (!skin || !active) return false;
  const targetElement = active.target === 'CONSOLE'
    ? document.querySelector('[data-ni-console] .ni-decks > section')
    : locateDeck(active.target);
  if (!(targetElement instanceof HTMLElement)) return false;
  const escaped = skin.dataUrl.replace(/"/g, '%22');
  targetElement.setAttribute(active.target === 'CONSOLE' ? 'data-sonara-console-image-skin' : 'data-sonara-image-skin', 'true');
  targetElement.style.setProperty('--sonara-custom-skin-image', `url("${escaped}")`);
  targetElement.style.setProperty('--sonara-custom-image-opacity', String(active.imageOpacity));
  targetElement.style.setProperty('--sonara-custom-panel-opacity', String(active.panelOpacity));
  targetElement.style.setProperty('--sonara-custom-fit', active.fit === 'fill' ? '100% 100%' : active.fit);
  return true;
}

export default function DJSkinExtensions({ profileId }: { profileId: string }) {
  const [skins, setSkins] = useState<ImportedSkin[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [target, setTarget] = useState<SkinTarget>('CONSOLE');
  const [fit, setFit] = useState<SkinFit>('contain');
  const [imageOpacity, setImageOpacity] = useState(1);
  const [panelOpacity, setPanelOpacity] = useState(0.2);
  const [status, setStatus] = useState('Carica una PNG, JPG o WebP. La skin viene salvata nel browser e resta disponibile ai riavvii.');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const selected = useMemo(() => skins.find(item => item.id === selectedId), [skins, selectedId]);

  useEffect(() => {
    let cancelled = false;
    void listSkins(profileId).then(items => {
      if (cancelled) return;
      setSkins(items);
      const active = readActive(profileId);
      const initialId = active?.skinId && items.some(item => item.id === active.skinId) ? active.skinId : items[0]?.id || '';
      setSelectedId(initialId);
      if (active) {
        setTarget(active.target);
        setFit(active.fit);
        setImageOpacity(active.imageOpacity);
        setPanelOpacity(active.panelOpacity);
      }
    }).catch(error => setStatus(error instanceof Error ? error.message : 'Archivio skin non disponibile.'));
    return () => { cancelled = true; };
  }, [profileId]);

  useEffect(() => {
    const active = readActive(profileId);
    if (!active) return undefined;
    const timer = window.setInterval(() => {
      const skin = skins.find(item => item.id === active.skinId);
      if (applyToDom(skin, active)) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [profileId, skins]);

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
      setStatus(`Skin importata realmente: ${skin.name} · ${skin.width || '?'}x${skin.height || '?'}. Ora premi APPLICA.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Importazione skin non riuscita.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const applySelected = () => {
    if (!selected) { setStatus('Prima carica o seleziona una skin.'); return; }
    const active: ActiveSkin = { skinId: selected.id, target, fit, imageOpacity, panelOpacity };
    localStorage.setItem(ACTIVE_KEY(profileId), JSON.stringify(active));
    if (applyToDom(selected, active)) setStatus(`${selected.name} applicata a ${target === 'CONSOLE' ? 'CONSOLE COMPLETA' : `DECK ${target}`}.`);
    else setStatus('Deck Engine non ancora pronto. La skin verra applicata automaticamente appena il deck viene montato.');
  };

  const disable = () => {
    localStorage.removeItem(ACTIVE_KEY(profileId));
    clearAppliedSkin();
    setStatus('Skin immagine disattivata. Il motore DJ resta invariato.');
  };

  const deleteSelected = async () => {
    if (!selected) return;
    await removeSkin(selected.id);
    const next = skins.filter(item => item.id !== selected.id);
    setSkins(next);
    setSelectedId(next[0]?.id || '');
    const active = readActive(profileId);
    if (active?.skinId === selected.id) disable();
    setStatus('Skin rimossa dalla libreria locale.');
  };

  return <section className="rounded-2xl border border-fuchsia-500/20 bg-[linear-gradient(145deg,#09070e,#06070b)] p-4 sm:p-5" data-sonara-skin-extensions="true">
    <style>{`
      [data-sonara-image-skin="true"],[data-sonara-console-image-skin="true"]{position:relative!important;isolation:isolate!important;overflow:hidden!important}
      [data-sonara-image-skin="true"]::before{content:''!important;position:absolute!important;inset:0!important;z-index:1!important;border-radius:inherit!important;background-image:var(--sonara-custom-skin-image)!important;background-size:var(--sonara-custom-fit,contain)!important;background-position:center!important;background-repeat:no-repeat!important;opacity:var(--sonara-custom-image-opacity,1)!important;pointer-events:none!important}
      [data-sonara-image-skin="true"]::after{display:none!important}
      [data-sonara-image-skin="true"] > *{position:relative!important;z-index:5!important}
      [data-sonara-image-skin="true"]{background:rgba(2,3,5,var(--sonara-custom-panel-opacity,.18))!important}
      [data-sonara-console-image-skin="true"]::before{content:''!important;position:absolute!important;inset:0!important;z-index:0!important;background-image:var(--sonara-custom-skin-image)!important;background-size:var(--sonara-custom-fit,contain)!important;background-position:center!important;background-repeat:no-repeat!important;opacity:var(--sonara-custom-image-opacity,1)!important;pointer-events:none!important}
      [data-sonara-console-image-skin="true"] > *{position:relative!important;z-index:3!important}
      [data-sonara-console-image-skin="true"] [data-deck-skin]{background:rgba(3,4,6,var(--sonara-custom-panel-opacity,.2))!important;backdrop-filter:blur(1px)}
      [data-sonara-console-image-skin="true"] [data-deck-skin]::before,[data-sonara-console-image-skin="true"] [data-deck-skin]::after{opacity:calc(var(--sonara-custom-panel-opacity,.2) * 2)!important}
      [data-sonara-console-image-skin="true"] > div:nth-child(3){background:rgba(4,5,7,var(--sonara-custom-panel-opacity,.2))!important;backdrop-filter:blur(1px)}
    `}</style>

    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <div className="flex items-center gap-2"><Layers3 className="h-4 w-4 text-fuchsia-300"/><h2 className="text-sm font-black text-white">SKIN EXTENSIONS</h2><span className="rounded-full border border-fuchsia-400/20 bg-fuchsia-400/10 px-2 py-0.5 text-[8px] font-black text-fuchsia-200">IMAGE ENGINE</span></div>
        <p className="mt-1 max-w-3xl text-[9px] leading-5 text-slate-500">Importa immagini vere come estensioni della skin. PNG, JPG e WebP vengono conservate in IndexedDB, non in localStorage, quindi sono adatte anche a skin 1920x1080 ad alta qualita.</p>
      </div>
      <div className="flex w-full flex-col gap-2 lg:max-w-xs">
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={event => void importFile(event.target.files?.[0])}/>
        <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-fuchsia-500 px-4 py-2.5 text-[9px] font-black text-white"><Upload className="h-4 w-4"/>CARICA IMMAGINE SKIN</button>
      </div>
    </div>

    <div className="mt-4 grid gap-3 xl:grid-cols-[1.15fr_.85fr]">
      <div className="rounded-xl border border-slate-800 bg-black/20 p-3">
        <div className="mb-2 text-[8px] font-black uppercase tracking-[.16em] text-slate-600">Libreria importata</div>
        {skins.length ? <div className="grid gap-2 sm:grid-cols-2">{skins.map(skin => <button type="button" key={skin.id} onClick={() => setSelectedId(skin.id)} className={`overflow-hidden rounded-xl border text-left ${selectedId === skin.id ? 'border-fuchsia-400/45 bg-fuchsia-400/8' : 'border-slate-800 bg-slate-950'}`}>
          <div className="aspect-video bg-black bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${skin.dataUrl})` }}/>
          <div className="p-2.5"><div className="flex items-center justify-between gap-2"><span className="truncate text-[9px] font-black text-white">{skin.name}</span>{selectedId === skin.id ? <Check className="h-3.5 w-3.5 text-fuchsia-300"/> : <ImagePlus className="h-3.5 w-3.5 text-slate-700"/>}</div><div className="mt-1 text-[7px] font-bold text-slate-600">{skin.width || '?'}x{skin.height || '?'} · {(skin.size / 1024 / 1024).toFixed(1)} MB</div></div>
        </button>)}</div> : <div className="rounded-xl border border-dashed border-slate-800 px-4 py-8 text-center text-[9px] font-bold text-slate-600">Nessuna skin immagine caricata.</div>}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
        <div className="text-[8px] font-black uppercase tracking-[.16em] text-slate-600">Applicazione</div>
        <div className="mt-3 grid grid-cols-3 gap-2">{(['CONSOLE','A','B'] as SkinTarget[]).map(value => <button type="button" key={value} onClick={() => setTarget(value)} className={`rounded-lg border px-2 py-2 text-[8px] font-black ${target === value ? 'border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-100' : 'border-slate-800 bg-black/30 text-slate-500'}`}>{value === 'CONSOLE' ? 'CONSOLE' : `DECK ${value}`}</button>)}</div>
        <div className="mt-3 grid grid-cols-3 gap-2">{(['contain','cover','fill'] as SkinFit[]).map(value => <button type="button" key={value} onClick={() => setFit(value)} className={`rounded-lg border px-2 py-2 text-[8px] font-black uppercase ${fit === value ? 'border-cyan-400/35 bg-cyan-400/10 text-cyan-100' : 'border-slate-800 text-slate-600'}`}>{value}</button>)}</div>

        <label className="mt-4 block text-[8px] font-black text-slate-500">OPACITA IMMAGINE · {Math.round(imageOpacity * 100)}%</label>
        <input type="range" min="0.2" max="1" step="0.05" value={imageOpacity} onChange={event => setImageOpacity(Number(event.target.value))} className="mt-1 w-full"/>
        <label className="mt-3 block text-[8px] font-black text-slate-500">PANNELLI LIVE SOPRA LA SKIN · {Math.round(panelOpacity * 100)}%</label>
        <input type="range" min="0.05" max="0.9" step="0.05" value={panelOpacity} onChange={event => setPanelOpacity(Number(event.target.value))} className="mt-1 w-full"/>

        <div className="mt-4 grid gap-2">
          <button type="button" onClick={applySelected} className="w-full rounded-xl bg-cyan-500 px-3 py-2.5 text-[9px] font-black text-black">APPLICA SKIN REALE</button>
          <button type="button" onClick={disable} className="w-full rounded-xl border border-slate-800 px-3 py-2 text-[8px] font-black text-slate-500">DISATTIVA ESTENSIONE</button>
          <button type="button" disabled={!selected} onClick={() => void deleteSelected()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/15 px-3 py-2 text-[8px] font-black text-red-300/70 disabled:opacity-30"><Trash2 className="h-3.5 w-3.5"/>ELIMINA DALLA LIBRERIA</button>
        </div>
      </div>
    </div>

    <div className="mt-3 rounded-xl border border-slate-800 bg-black/25 px-3 py-2 text-[8px] font-bold leading-4 text-slate-500">{status}</div>
  </section>;
}
