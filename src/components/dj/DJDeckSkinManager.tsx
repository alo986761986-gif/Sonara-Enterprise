import React, { useEffect, useMemo, useState } from 'react';
import { Check, Layers3, Palette, Sparkles } from 'lucide-react';

type DeckSkinId = 'club' | 'carbon' | 'neon' | 'festival' | 'vinyl' | 'minimal';
type DeckSkinState = { A: DeckSkinId; B: DeckSkinId };

type SkinDefinition = {
  id: DeckSkinId;
  name: string;
  description: string;
  layout: string;
  swatch: string;
};

const SKINS: SkinDefinition[] = [
  { id: 'club', name: 'Club Hardware', description: 'Platter dominante, waveform centrale, controlli da club.', layout: 'CLUB', swatch: 'linear-gradient(135deg,#03060a,#0b2330,#22d3ee)' },
  { id: 'carbon', name: 'Carbon Studio', description: 'Deck tecnico compatto con controlli e letture ravvicinate.', layout: 'STUDIO', swatch: 'linear-gradient(135deg,#050607,#20252b,#94a3b8)' },
  { id: 'neon', name: 'Neon Performance', description: 'Performance pad in evidenza e waveform panoramica.', layout: 'PERFORMANCE', swatch: 'linear-gradient(135deg,#020617,#0c4a6e,#38bdf8)' },
  { id: 'festival', name: 'Festival RGB', description: 'Transport e pad grandi per alta visibilita live.', layout: 'STAGE', swatch: 'linear-gradient(135deg,#160407,#7f1d1d,#f59e0b)' },
  { id: 'vinyl', name: 'Vinyl Turntable', description: 'Impostazione turntable con platter visuale maggiorato.', layout: 'TURNTABLE', swatch: 'linear-gradient(135deg,#020202,#2a2308,#facc15)' },
  { id: 'minimal', name: 'Waveform Focus', description: 'Waveform protagonista, controlli essenziali e puliti.', layout: 'WAVEFORM', swatch: 'linear-gradient(135deg,#0b0d10,#172033,#e2e8f0)' }
];

const DEFAULT_SKINS: DeckSkinState = { A: 'club', B: 'club' };
const storageKey = (profileId: string) => `sonara.dj.real-skins.v3.${profileId || 'generic-midi'}`;

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
  const section = document.querySelector('[data-ni-console] .ni-decks > section');
  if (!(section instanceof HTMLElement)) return false;
  section.dataset.sonaraDeckEngine = 'true';
  const deckGrid = section.children.item(1);
  if (!(deckGrid instanceof HTMLElement)) return false;
  deckGrid.dataset.sonaraDeckGrid = 'true';
  const decks = Array.from(deckGrid.children).filter(node => node instanceof HTMLElement) as HTMLElement[];
  if (decks[0]) { decks[0].dataset.sonaraDeck = 'A'; decks[0].dataset.deckSkin = skins.A; }
  if (decks[1]) { decks[1].dataset.sonaraDeck = 'B'; decks[1].dataset.deckSkin = skins.B; }
  return Boolean(decks[0] && decks[1]);
}

export default function DJDeckSkinManager({ profileId, profileName }: { profileId: string; profileName: string }) {
  const [skins, setSkins] = useState<DeckSkinState>(() => readSaved(profileId));
  const [target, setTarget] = useState<'A' | 'B' | 'ALL'>('ALL');

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
  const applySkin = (skin: DeckSkinId) => setSkins(current => target === 'ALL' ? { A: skin, B: skin } : { ...current, [target]: skin });

  return <section className="rounded-2xl border border-cyan-500/15 bg-[linear-gradient(145deg,#071018,#05070b)] p-4 sm:p-5" data-sonara-deck-skin-manager="true">
    <style>{`
      [data-sonara-deck-grid="true"] { align-items:stretch; }
      [data-sonara-deck-engine="true"] [data-deck-skin] {
        --accent:#67e8f9; --accent-soft:rgba(34,211,238,.14); --panel:#050910;
        position:relative!important; isolation:isolate; overflow:hidden!important; min-height:620px!important;
        display:grid!important; gap:12px!important; padding:18px!important; border-radius:24px!important;
        grid-template-areas:'head head' 'wave wave' 'transport transport' 'pads pads' 'tempo tempo' 'eq eq';
        grid-template-columns:1fr 1fr; grid-template-rows:auto 126px auto auto auto auto;
        transition:background .18s ease,border-color .18s ease,box-shadow .18s ease;
      }
      [data-deck-skin] > div:nth-of-type(1){grid-area:head;position:relative;z-index:3}
      [data-deck-skin] > div:nth-of-type(2){grid-area:wave;margin:0!important;height:auto!important;min-height:112px;position:relative;z-index:2;background:#020409!important;border-color:rgba(255,255,255,.09)!important;box-shadow:inset 0 0 28px rgba(0,0,0,.78)}
      [data-deck-skin] > div:nth-of-type(3){grid-area:transport;position:relative;z-index:3;margin:0!important}
      [data-deck-skin] > div:nth-of-type(4){display:none!important}
      [data-deck-skin] > div:nth-of-type(5){grid-area:pads;position:relative;z-index:3;margin:0!important}
      [data-deck-skin] > div:nth-of-type(6){grid-area:tempo;position:relative;z-index:3;margin:0!important}
      [data-deck-skin] > div:nth-of-type(7){grid-area:eq;position:relative;z-index:3;margin:0!important}
      [data-deck-skin]::before{content:'';position:absolute;border-radius:999px;background:repeating-radial-gradient(circle,#0b1017 0 3px,#151c27 3px 6px);border:10px solid #030507;box-shadow:0 0 0 1px rgba(255,255,255,.08),0 24px 60px rgba(0,0,0,.6),inset 0 0 0 26px rgba(255,255,255,.025);pointer-events:none;z-index:0}
      [data-deck-skin]::after{content:'DECK ' attr(data-sonara-deck);position:absolute;display:flex;align-items:center;justify-content:center;border-radius:999px;background:#05070b;border:1px solid rgba(255,255,255,.12);font:900 12px/1 system-ui;letter-spacing:.12em;color:white;pointer-events:none;z-index:1}
      [data-deck-skin] button{min-height:44px}
      [data-deck-skin] input[type=range]{min-height:20px}

      [data-deck-skin="club"]{--accent:#67e8f9;background:linear-gradient(155deg,#03070b,#07131e 72%,#06202a)!important;border-color:rgba(34,211,238,.3)!important;grid-template-areas:'head head' 'wave wave' 'transport transport' 'pads pads' 'tempo tempo' 'eq eq';padding-top:218px!important}
      [data-deck-skin="club"]::before{width:164px;height:164px;right:24px;top:42px}
      [data-deck-skin="club"]::after{width:66px;height:66px;right:73px;top:91px}

      [data-deck-skin="carbon"]{--accent:#cbd5e1;background:linear-gradient(145deg,#050607,#11151a 58%,#08090b)!important;border-color:rgba(148,163,184,.28)!important;grid-template-areas:'head head' 'wave transport' 'wave pads' 'tempo pads' 'eq eq';grid-template-columns:1.18fr .82fr;grid-template-rows:auto 116px auto auto auto}
      [data-deck-skin="carbon"]::before{width:116px;height:116px;right:26px;top:20px;opacity:.38}
      [data-deck-skin="carbon"]::after{width:48px;height:48px;right:70px;top:54px;font-size:9px}

      [data-deck-skin="neon"]{--accent:#7dd3fc;background:radial-gradient(circle at 85% 8%,rgba(14,165,233,.24),transparent 32%),linear-gradient(155deg,#020617,#07152a)!important;border-color:rgba(56,189,248,.42)!important;grid-template-areas:'head head' 'wave wave' 'pads pads' 'transport transport' 'tempo eq';grid-template-columns:1fr 1fr;grid-template-rows:auto 156px auto auto auto}
      [data-deck-skin="neon"]::before{width:112px;height:112px;right:22px;top:20px;box-shadow:0 0 40px rgba(56,189,248,.24),inset 0 0 0 22px rgba(56,189,248,.03)}
      [data-deck-skin="neon"]::after{width:46px;height:46px;right:65px;top:53px;font-size:9px}
      [data-deck-skin="neon"] > div:nth-of-type(5) button{min-height:54px;box-shadow:0 0 18px rgba(217,70,239,.06)}

      [data-deck-skin="festival"]{--accent:#fbbf24;background:radial-gradient(circle at 88% 5%,rgba(245,158,11,.2),transparent 30%),linear-gradient(155deg,#140406,#31090d)!important;border-color:rgba(248,113,113,.4)!important;grid-template-areas:'head head' 'transport transport' 'wave wave' 'pads pads' 'tempo tempo' 'eq eq';grid-template-rows:auto auto 132px auto auto auto}
      [data-deck-skin="festival"]::before{width:100px;height:100px;right:24px;top:22px;opacity:.45}
      [data-deck-skin="festival"]::after{width:42px;height:42px;right:63px;top:51px;font-size:8px}
      [data-deck-skin="festival"] > div:nth-of-type(3) button{min-height:56px;font-size:11px!important}
      [data-deck-skin="festival"] > div:nth-of-type(5) button{min-height:58px}

      [data-deck-skin="vinyl"]{--accent:#fde047;background:radial-gradient(circle at 75% 7%,rgba(250,204,21,.13),transparent 34%),linear-gradient(155deg,#030303,#151207)!important;border-color:rgba(250,204,21,.3)!important;grid-template-areas:'head head' 'wave wave' 'transport transport' 'pads pads' 'tempo tempo' 'eq eq';padding-top:286px!important}
      [data-deck-skin="vinyl"]::before{width:230px;height:230px;left:50%;transform:translateX(-50%);top:42px;border-width:14px;box-shadow:0 0 0 1px rgba(250,204,21,.14),0 30px 70px rgba(0,0,0,.7),inset 0 0 0 38px rgba(250,204,21,.025)}
      [data-deck-skin="vinyl"]::after{width:80px;height:80px;left:50%;transform:translateX(-50%);top:117px;border-color:rgba(250,204,21,.24);color:#fde047}

      [data-deck-skin="minimal"]{--accent:#e2e8f0;background:linear-gradient(155deg,#0b0d10,#10151c)!important;border-color:rgba(226,232,240,.18)!important;grid-template-areas:'head head' 'wave wave' 'wave wave' 'transport pads' 'tempo pads' 'eq eq';grid-template-columns:.8fr 1.2fr;grid-template-rows:auto 100px 100px auto auto auto}
      [data-deck-skin="minimal"]::before,[data-deck-skin="minimal"]::after{display:none}
      [data-deck-skin="minimal"] > div:nth-of-type(2){min-height:212px}

      [data-deck-skin] .text-cyan-300{color:var(--accent)!important}
      @media(max-width:760px){
        [data-sonara-deck-engine="true"] [data-deck-skin]{display:block!important;min-height:0!important;padding:14px!important}
        [data-deck-skin] > div{margin-top:12px!important}
        [data-deck-skin] > div:nth-of-type(1){margin-top:0!important;padding-right:94px}
        [data-deck-skin]::before{width:76px!important;height:76px!important;right:14px!important;left:auto!important;top:14px!important;transform:none!important;border-width:7px!important;display:block!important}
        [data-deck-skin]::after{width:32px!important;height:32px!important;right:36px!important;left:auto!important;top:36px!important;transform:none!important;font-size:7px!important;display:flex!important}
        [data-deck-skin="minimal"]::before,[data-deck-skin="minimal"]::after{display:none!important}
        [data-deck-skin] > div:nth-of-type(2){min-height:104px!important;height:104px!important}
      }
    `}</style>

    <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2"><Palette className="h-4 w-4 text-cyan-300"/><h2 className="text-sm font-black text-white">REAL DECK SKINS</h2><span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[8px] font-black text-emerald-300">STRUCTURAL UI</span></div>
        <p className="mt-1 text-[10px] leading-5 text-slate-500">Ogni skin cambia geometria, priorita e disposizione reale di waveform, transport, pad, tempo ed EQ. Il motore audio e MIDI resta unico.</p>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-[9px] text-slate-400"><span className="font-black text-white">Profilo:</span> {profileName} · {activeLabel}</div>
    </div>

    <div className="mt-4 flex flex-wrap gap-2">
      {(['A','B','ALL'] as const).map(value => <button key={value} onClick={() => setTarget(value)} className={`rounded-xl border px-3 py-2 text-[9px] font-black ${target === value ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100' : 'border-slate-800 bg-slate-950 text-slate-500'}`}>{value === 'ALL' ? 'DECK A + B' : `DECK ${value}`}</button>)}
    </div>

    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {SKINS.map(skin => {
        const selected = target === 'ALL' ? skins.A === skin.id && skins.B === skin.id : skins[target] === skin.id;
        return <button key={skin.id} onClick={() => applySkin(skin.id)} className={`group overflow-hidden rounded-2xl border text-left transition ${selected ? 'border-cyan-300/55 bg-cyan-400/5 shadow-lg shadow-cyan-950/20' : 'border-slate-800 bg-slate-950 hover:border-slate-700'}`}>
          <div className="h-14 border-b border-white/5" style={{ background: skin.swatch }} />
          <div className="p-3"><div className="flex items-center justify-between gap-2"><span className="text-[9px] font-black text-white">{skin.name}</span>{selected ? <Check className="h-3.5 w-3.5 text-cyan-300"/> : <Layers3 className="h-3.5 w-3.5 text-slate-700"/>}</div><div className="mt-1 text-[7px] font-black tracking-[.16em] text-cyan-300/70">{skin.layout}</div><div className="mt-1 text-[8px] leading-4 text-slate-600">{skin.description}</div></div>
        </button>;
      })}
    </div>

    <div className="mt-3 flex items-start gap-2 rounded-xl border border-slate-800 bg-black/20 px-3 py-2 text-[8px] leading-4 text-slate-500"><Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300"/><span>Le skin non simulano funzioni inesistenti: Play, Cue, Loop, Hot Cue, EQ, Filter, Echo e waveform restano collegati al Live Deck Engine reale.</span></div>
  </section>;
}
