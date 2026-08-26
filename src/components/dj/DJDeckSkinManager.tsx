import React, { useEffect, useMemo, useState } from 'react';
import { Check, Cable, CircleAlert, Disc3, Layers3, Palette, Sparkles, Usb } from 'lucide-react';

type DeckSkinId = 'club' | 'carbon' | 'neon' | 'festival' | 'vinyl' | 'minimal';
type DeckSkinState = { A: DeckSkinId; B: DeckSkinId };

type SkinDefinition = {
  id: DeckSkinId;
  name: string;
  description: string;
  swatch: string;
};

const SKINS: SkinDefinition[] = [
  { id: 'club', name: 'Classic Club', description: 'Nero club con cyan professionale', swatch: 'linear-gradient(135deg,#05070c,#102a38,#22d3ee)' },
  { id: 'carbon', name: 'Dark Carbon', description: 'Carbonio scuro e dettagli metallici', swatch: 'linear-gradient(135deg,#020305,#171b21,#64748b)' },
  { id: 'neon', name: 'Neon Blue', description: 'Blu elettrico per performance live', swatch: 'linear-gradient(135deg,#020617,#0c4a6e,#38bdf8)' },
  { id: 'festival', name: 'Festival', description: 'Rosso e ambra ad alta visibilità', swatch: 'linear-gradient(135deg,#120406,#7f1d1d,#f59e0b)' },
  { id: 'vinyl', name: 'Vinyl Gold', description: 'Look giradischi nero e oro', swatch: 'linear-gradient(135deg,#050505,#29230d,#facc15)' },
  { id: 'minimal', name: 'Minimal Pro', description: 'Interfaccia pulita e neutra', swatch: 'linear-gradient(135deg,#0b0d10,#1e293b,#e2e8f0)' }
];

const DEFAULT_SKINS: DeckSkinState = { A: 'club', B: 'club' };
const storageKey = (profileId: string) => `sonara.dj.deck-skins.v2.${profileId || 'generic-midi'}`;

function readSaved(profileId: string): DeckSkinState {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(profileId)) || '{}') as Partial<DeckSkinState>;
    const ids = new Set(SKINS.map(skin => skin.id));
    return {
      A: parsed.A && ids.has(parsed.A) ? parsed.A : DEFAULT_SKINS.A,
      B: parsed.B && ids.has(parsed.B) ? parsed.B : DEFAULT_SKINS.B
    };
  } catch {
    return DEFAULT_SKINS;
  }
}

function annotateLiveDecks(skins: DeckSkinState) {
  const headings = Array.from(document.querySelectorAll('h2'));
  const heading = headings.find(node => node.textContent?.trim() === 'SONARA LIVE DECK ENGINE');
  const section = heading?.closest('section');
  if (!(section instanceof HTMLElement)) return false;
  section.dataset.sonaraDeckEngine = 'true';
  const deckGrid = Array.from(section.children).find(node => node instanceof HTMLElement && node.classList.contains('mt-5') && node.classList.contains('grid')) as HTMLElement | undefined;
  if (!deckGrid) return false;
  deckGrid.dataset.sonaraDeckGrid = 'true';
  const decks = Array.from(deckGrid.children).filter(node => node instanceof HTMLElement) as HTMLElement[];
  if (decks[0]) { decks[0].dataset.sonaraDeck = 'A'; decks[0].dataset.deckSkin = skins.A; }
  if (decks[1]) { decks[1].dataset.sonaraDeck = 'B'; decks[1].dataset.deckSkin = skins.B; }
  return Boolean(decks[0] && decks[1]);
}

export default function DJDeckSkinManager({ profileId, profileName }: { profileId: string; profileName: string }) {
  const [skins, setSkins] = useState<DeckSkinState>(() => readSaved(profileId));
  const [target, setTarget] = useState<'A' | 'B' | 'ALL'>('ALL');
  const [midiStatus, setMidiStatus] = useState('Collega X1 MK2 e Z1 MK2 via USB, mettili in MIDI Mode e premi CONNETTI X1 + Z1.');

  useEffect(() => {
    const next = readSaved(profileId);
    setSkins(next);
    annotateLiveDecks(next);
  }, [profileId]);

  useEffect(() => {
    localStorage.setItem(storageKey(profileId), JSON.stringify(skins));
    annotateLiveDecks(skins);
    const observer = new MutationObserver(() => annotateLiveDecks(skins));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [profileId, skins]);

  const activeLabel = useMemo(() => target === 'ALL' ? `A ${skins.A} · B ${skins.B}` : `${target} ${skins[target]}`, [skins, target]);

  const applySkin = (skin: DeckSkinId) => {
    setSkins(current => target === 'ALL' ? { A: skin, B: skin } : { ...current, [target]: skin });
  };

  const connectNI = () => {
    const midiButton = (Array.from(document.querySelectorAll('button')) as HTMLButtonElement[])
      .find(button => button.textContent?.trim() === 'MIDI');
    if (!midiButton) {
      setMidiStatus('Motore MIDI DJ non trovato nella pagina. Chiudi e riapri DJ PRO, poi riprova.');
      return;
    }
    midiButton.click();
    setMidiStatus('Richiesta MIDI inviata al motore DJ principale. Autorizza Chrome/Edge; poi controlla “Hardware collegato” e “Live hardware monitor” sotto. RILEVA NI non apre più un secondo listener MIDI.');
  };

  return <div className="space-y-4">
    <style>{`
      [data-sonara-deck-engine="true"] { border-color:rgba(34,211,238,.18)!important;background:linear-gradient(180deg,#030507,#060913)!important; }
      [data-sonara-deck-grid="true"] { align-items:stretch; }
      [data-sonara-deck-engine="true"] [data-deck-skin] { position:relative;overflow:hidden;min-height:500px;padding:18px!important;border-radius:26px!important;transition:background .18s ease,border-color .18s ease,box-shadow .18s ease;isolation:isolate; }
      [data-sonara-deck-engine="true"] [data-deck-skin]::before { content:'';position:absolute;right:22px;top:72px;width:178px;height:178px;border-radius:999px;background:repeating-radial-gradient(circle,#0a0d12 0 3px,#111722 3px 6px);border:8px solid #05070a;box-shadow:0 0 0 1px rgba(255,255,255,.08),0 22px 60px rgba(0,0,0,.55),inset 0 0 0 25px rgba(255,255,255,.02);z-index:-1; }
      [data-sonara-deck-engine="true"] [data-deck-skin]::after { content:attr(data-sonara-deck);position:absolute;right:80px;top:132px;width:62px;height:62px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:#070a10;border:1px solid rgba(255,255,255,.12);font:900 24px/1 system-ui;color:white;box-shadow:inset 0 0 18px rgba(255,255,255,.03);z-index:-1; }
      [data-sonara-deck-engine="true"] [data-deck-skin="club"] { background:linear-gradient(155deg,#04070b,#07101a 72%,#06202a)!important;border-color:rgba(34,211,238,.28)!important;box-shadow:0 18px 55px rgba(0,0,0,.42),inset 0 1px rgba(34,211,238,.08)!important; }
      [data-sonara-deck-engine="true"] [data-deck-skin="club"] .text-cyan-300 { color:#67e8f9!important; }
      [data-sonara-deck-engine="true"] [data-deck-skin="carbon"] { background:linear-gradient(145deg,#050607,#11151a 55%,#08090b)!important;border-color:rgba(148,163,184,.28)!important;box-shadow:inset 0 1px rgba(255,255,255,.06),0 18px 50px rgba(0,0,0,.5)!important; }
      [data-sonara-deck-engine="true"] [data-deck-skin="carbon"] .text-cyan-300 { color:#cbd5e1!important; }
      [data-sonara-deck-engine="true"] [data-deck-skin="neon"] { background:radial-gradient(circle at 86% 10%,rgba(14,165,233,.22),transparent 34%),linear-gradient(155deg,#020617,#07152a)!important;border-color:rgba(56,189,248,.42)!important;box-shadow:0 0 30px rgba(14,165,233,.12),0 18px 50px rgba(0,0,0,.45)!important; }
      [data-sonara-deck-engine="true"] [data-deck-skin="neon"] .text-cyan-300 { color:#7dd3fc!important;text-shadow:0 0 12px rgba(56,189,248,.45); }
      [data-sonara-deck-engine="true"] [data-deck-skin="festival"] { background:radial-gradient(circle at 90% 5%,rgba(245,158,11,.2),transparent 32%),linear-gradient(155deg,#120407,#2c090b)!important;border-color:rgba(248,113,113,.38)!important;box-shadow:0 0 30px rgba(239,68,68,.1),0 18px 50px rgba(0,0,0,.46)!important; }
      [data-sonara-deck-engine="true"] [data-deck-skin="festival"] .text-cyan-300 { color:#fbbf24!important; }
      [data-sonara-deck-engine="true"] [data-deck-skin="vinyl"] { background:radial-gradient(circle at 88% 8%,rgba(250,204,21,.16),transparent 35%),linear-gradient(155deg,#030303,#12100a)!important;border-color:rgba(250,204,21,.28)!important;box-shadow:inset 0 1px rgba(250,204,21,.08),0 18px 50px rgba(0,0,0,.52)!important; }
      [data-sonara-deck-engine="true"] [data-deck-skin="vinyl"] .text-cyan-300 { color:#fde047!important; }
      [data-sonara-deck-engine="true"] [data-deck-skin="minimal"] { background:linear-gradient(155deg,#0b0d10,#10151c)!important;border-color:rgba(226,232,240,.18)!important;box-shadow:0 14px 40px rgba(0,0,0,.32)!important; }
      [data-sonara-deck-engine="true"] [data-deck-skin="minimal"] .text-cyan-300 { color:#e2e8f0!important; }
      [data-sonara-deck-engine="true"] [data-deck-skin] > div:nth-of-type(2) { margin-top:190px!important;height:112px!important;background:#020409!important;border-color:rgba(255,255,255,.09)!important;box-shadow:inset 0 0 26px rgba(0,0,0,.7); }
      [data-sonara-deck-engine="true"] [data-deck-skin] button { min-height:42px; }
      [data-sonara-deck-engine="true"] [data-deck-skin] input[type="range"] { height:18px; }
      @media (max-width:640px) { [data-sonara-deck-engine="true"] [data-deck-skin]::before { width:132px;height:132px;right:16px;top:78px; } [data-sonara-deck-engine="true"] [data-deck-skin]::after { right:52px;top:119px;width:58px;height:58px; } [data-sonara-deck-engine="true"] [data-deck-skin] > div:nth-of-type(2) { margin-top:148px!important; } }
    `}</style>

    <section className="rounded-3xl border border-amber-500/20 bg-[linear-gradient(145deg,#100b04,#07090d)] p-4 sm:p-5" data-sonara-ni-hardware-setup="true">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2"><Usb className="h-4 w-4 text-amber-300"/><h2 className="text-sm font-black text-white">NATIVE INSTRUMENTS · X1 MK2 + Z1 MK2</h2><span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[8px] font-black text-cyan-200">SINGLE MIDI OWNER</span></div>
          <p className="mt-2 text-[10px] leading-5 text-slate-400">X1 MK2: entra/esci dal MIDI Mode con SHIFT + LOAD LEFT + LOAD RIGHT. Su Windows installa i driver Native Instruments quando Windows non espone i dispositivi come MIDI/audio.</p>
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-slate-800 bg-black/25 px-3 py-2 text-[9px] leading-4 text-slate-400"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300"/><span>Correzione importante: questo pulsante ora usa il medesimo motore MIDI di DJConnectHub. Non assegna più <code>onmidimessage</code> separati e quindi non può disattivare Play/Cue/EQ/MIDI Learn.</span></div>
        </div>
        <button onClick={connectNI} className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-3 text-[10px] font-black text-black shadow-lg shadow-orange-950/20"><Cable className="h-4 w-4"/>CONNETTI X1 + Z1</button>
      </div>
      <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-[9px] text-slate-400">{midiStatus}</div>
    </section>

    <section className="rounded-3xl border border-cyan-500/15 bg-[linear-gradient(145deg,#071018,#05070b)] p-4 sm:p-5" data-sonara-deck-skin-manager="true">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <div className="flex items-center gap-2"><Palette className="h-4 w-4 text-cyan-300"/><h2 className="text-sm font-black text-white">DECK SKIN ENGINE</h2><span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[8px] font-black text-emerald-300">PRO DECK UI</span></div>
          <p className="mt-1 text-[10px] leading-5 text-slate-500">Le skin restano solo grafiche. Playback, Web Audio e MIDI appartengono al Live Deck Engine e al DJConnectHub.</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-[9px] text-slate-400"><span className="font-black text-white">Profilo:</span> {profileName} · {activeLabel}</div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {(['A','B','ALL'] as const).map(value => <button key={value} onClick={() => setTarget(value)} className={`rounded-xl border px-3 py-2 text-[9px] font-black ${target === value ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100' : 'border-slate-800 bg-slate-950 text-slate-500'}`}>{value === 'ALL' ? <span className="inline-flex items-center gap-1"><Layers3 className="h-3 w-3"/>TUTTI I DECK</span> : `DECK ${value}`}</button>)}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {SKINS.map(skin => {
          const selected = target === 'ALL' ? skins.A === skin.id && skins.B === skin.id : skins[target] === skin.id;
          return <button key={skin.id} onClick={() => applySkin(skin.id)} className={`group rounded-2xl border p-2 text-left transition hover:-translate-y-0.5 ${selected ? 'border-cyan-400/50 bg-cyan-400/5' : 'border-slate-800 bg-slate-950/70'}`}>
            <div className="relative h-14 rounded-xl border border-white/5" style={{ background: skin.swatch }}>{selected ? <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-black"><Check className="h-3 w-3"/></span> : <Sparkles className="absolute right-2 top-2 h-3.5 w-3.5 text-white/45"/>}</div>
            <div className="mt-2 text-[9px] font-black text-white">{skin.name}</div><div className="mt-0.5 text-[7px] leading-3 text-slate-600">{skin.description}</div>
          </button>;
        })}
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-xl border border-fuchsia-500/15 bg-fuchsia-500/5 px-3 py-2 text-[9px] text-slate-500"><Disc3 className="h-3.5 w-3.5 text-fuchsia-300"/><span><strong className="text-slate-300">Nota:</strong> il platter mostrato da queste skin è ancora visuale. Il jog interattivo vero va implementato direttamente nel Live Deck Engine, non tramite CSS.</span></div>
    </section>
  </div>;
}
