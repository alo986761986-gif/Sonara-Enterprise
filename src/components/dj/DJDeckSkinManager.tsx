import React, { useEffect, useMemo, useState } from 'react';
import { Check, Layers3, Palette, Sparkles } from 'lucide-react';

type DeckSkinId = 'virtually' | 'prime' | 'prowave' | 'battle' | 'broadcast' | 'club' | 'carbon' | 'neon' | 'stage' | 'vinyl' | 'minimal';
type DeckSkinState = { A: DeckSkinId; B: DeckSkinId };

type SkinDefinition = {
  id: DeckSkinId;
  name: string;
  description: string;
  layout: string;
  swatch: string;
  fullConsole?: boolean;
};

const SKINS: SkinDefinition[] = [
  { id: 'virtually', name: 'Virtually Pioneer LIVE', description: 'Ricostruzione LIVE della skin caricata: doppi platter, waveform superiori e mixer centrale.', layout: 'FULL CONSOLE', fullConsole: true, swatch: 'radial-gradient(circle at 22% 68%,#2483ff 0 7%,#07090b 8% 23%,transparent 24%),radial-gradient(circle at 78% 68%,#2483ff 0 7%,#07090b 8% 23%,transparent 24%),linear-gradient(90deg,#050607 0 38%,#111315 38% 62%,#050607 62% 100%)' },
  { id: 'prime', name: 'Sonara Club Prime', description: 'Platter grande, waveform panoramica e transport da club.', layout: 'CLUB PRIME', swatch: 'radial-gradient(circle at 75% 42%,#22d3ee 0 5%,#07111d 6% 24%,#02040a 25% 100%)' },
  { id: 'prowave', name: 'Sonara Pro Wave', description: 'Waveform dominante, controlli rapidi e lettura immediata.', layout: 'PRO WAVE', swatch: 'linear-gradient(135deg,#020617,#0c4a6e 55%,#22d3ee)' },
  { id: 'battle', name: 'Sonara Battle', description: 'Pad e transport maggiorati per performance e scratch workflow.', layout: 'BATTLE', swatch: 'linear-gradient(135deg,#09090b,#3f0b22,#e11d48)' },
  { id: 'broadcast', name: 'Sonara Broadcast', description: 'Layout tecnico pulito con dati, waveform e mixer molto leggibili.', layout: 'BROADCAST', swatch: 'linear-gradient(135deg,#030712,#1e293b,#38bdf8)' },
  { id: 'club', name: 'Club Hardware', description: 'Impostazione hardware tradizionale con platter e waveform centrale.', layout: 'CLUB', swatch: 'linear-gradient(135deg,#03060a,#0b2330,#22d3ee)' },
  { id: 'carbon', name: 'Carbon Studio', description: 'Deck tecnico compatto con controlli ravvicinati e finitura scura.', layout: 'STUDIO', swatch: 'linear-gradient(135deg,#050607,#20252b,#94a3b8)' },
  { id: 'neon', name: 'Neon Performance', description: 'Performance pad in evidenza e illuminazione da live set.', layout: 'PERFORMANCE', swatch: 'linear-gradient(135deg,#020617,#0c4a6e,#a21caf)' },
  { id: 'stage', name: 'Stage RGB', description: 'Transport e pad grandi per alta visibilita su palco.', layout: 'STAGE', swatch: 'linear-gradient(135deg,#160407,#7f1d1d,#f59e0b)' },
  { id: 'vinyl', name: 'Vinyl Turntable', description: 'Impostazione turntable con platter visuale maggiorato.', layout: 'TURNTABLE', swatch: 'linear-gradient(135deg,#020202,#2a2308,#facc15)' },
  { id: 'minimal', name: 'Waveform Focus', description: 'Waveform protagonista e controlli essenziali senza distrazioni.', layout: 'WAVEFORM', swatch: 'linear-gradient(135deg,#0b0d10,#172033,#e2e8f0)' }
];

const DEFAULT_SKINS: DeckSkinState = { A: 'virtually', B: 'virtually' };
const storageKey = (profileId: string) => `sonara.dj.real-skins.v5.${profileId || 'generic-midi'}`;

function readSaved(profileId: string): DeckSkinState {
  if (typeof window === 'undefined') return DEFAULT_SKINS;
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
  if (typeof document === 'undefined') return false;
  const section = document.querySelector('[data-ni-console] .ni-decks > section');
  if (!(section instanceof HTMLElement)) return false;
  section.dataset.sonaraDeckEngine = 'true';
  section.dataset.consoleSkin = skins.A === 'virtually' && skins.B === 'virtually' ? 'virtually' : 'standard';
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
    if (typeof window !== 'undefined') localStorage.setItem(storageKey(profileId), JSON.stringify(skins));
    annotateLiveDecks(skins);
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return undefined;
    const observer = new MutationObserver(() => annotateLiveDecks(skins));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [profileId, skins]);

  const activeLabel = useMemo(() => target === 'ALL' ? `A ${skins.A} · B ${skins.B}` : `${target} ${skins[target]}`, [skins, target]);
  const applySkin = (skin: DeckSkinId) => setSkins(current => skin === 'virtually' || target === 'ALL' ? { A: skin, B: skin } : { ...current, [target]: skin });

  return <section className="rounded-2xl border border-cyan-500/15 bg-[linear-gradient(145deg,#071018,#05070b)] p-4 sm:p-5" data-sonara-deck-skin-manager="true">
    <style>{`
      [data-sonara-deck-grid="true"]{align-items:stretch}
      [data-sonara-deck-engine="true"] [data-deck-skin]{
        --accent:#67e8f9;position:relative!important;isolation:isolate;overflow:hidden!important;min-height:650px!important;
        display:grid!important;gap:12px!important;padding:18px!important;border-radius:24px!important;
        grid-template-areas:'head head' 'wave wave' 'transport transport' 'pads pads' 'tempo tempo' 'eq eq';
        grid-template-columns:1fr 1fr;grid-template-rows:auto 126px auto auto auto auto;
        transition:background .18s ease,border-color .18s ease,box-shadow .18s ease;
        box-shadow:0 24px 70px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.035)
      }
      [data-deck-skin] > div:nth-of-type(1){grid-area:head;position:relative;z-index:5}
      [data-deck-skin] > div:nth-of-type(2){grid-area:wave;margin:0!important;height:auto!important;min-height:112px;position:relative;z-index:4;background:#010308!important;border-color:rgba(255,255,255,.09)!important;box-shadow:inset 0 0 30px rgba(0,0,0,.82)}
      [data-deck-skin] > div:nth-of-type(3){grid-area:transport;position:relative;z-index:5;margin:0!important}
      [data-deck-skin] > div:nth-of-type(4){display:none!important}
      [data-deck-skin] > div:nth-of-type(5){grid-area:pads;position:relative;z-index:5;margin:0!important}
      [data-deck-skin] > div:nth-of-type(6){grid-area:tempo;position:relative;z-index:5;margin:0!important}
      [data-deck-skin] > div:nth-of-type(7){grid-area:eq;position:relative;z-index:5;margin:0!important}
      [data-deck-skin]::before{content:'';position:absolute;border-radius:999px;background:repeating-radial-gradient(circle,#080d13 0 3px,#151d27 3px 6px);border:10px solid #020407;box-shadow:0 0 0 1px rgba(255,255,255,.08),0 24px 60px rgba(0,0,0,.62),inset 0 0 0 26px rgba(255,255,255,.025);pointer-events:none;z-index:1}
      [data-deck-skin]::after{content:'DECK ' attr(data-sonara-deck);position:absolute;display:flex;align-items:center;justify-content:center;border-radius:999px;background:#05070b;border:1px solid rgba(255,255,255,.12);font:900 12px/1 system-ui;letter-spacing:.12em;color:white;pointer-events:none;z-index:2}
      [data-deck-skin] button{min-height:44px;border-radius:10px!important;transition:transform .08s ease,filter .08s ease}
      [data-deck-skin] button:active{transform:translateY(1px);filter:brightness(1.16)}
      [data-deck-skin] input[type=range]{min-height:20px}
      [data-deck-skin] .text-cyan-300{color:var(--accent)!important}

      /* FULL CONSOLE skin reconstructed from the user supplied 1920x1080 reference. */
      [data-sonara-deck-engine="true"][data-console-skin="virtually"]{
        position:relative!important;overflow:hidden!important;padding:14px!important;border-radius:8px!important;
        border:1px solid #2b2d30!important;background:
          repeating-linear-gradient(0deg,rgba(255,255,255,.012) 0 1px,transparent 1px 4px),
          linear-gradient(180deg,#050607 0,#111315 30%,#08090a 31%,#0b0c0d 100%)!important;
        box-shadow:0 28px 90px rgba(0,0,0,.66),inset 0 1px 0 rgba(255,255,255,.05)!important
      }
      [data-sonara-deck-engine="true"][data-console-skin="virtually"] > div:first-child{
        position:relative;z-index:20;margin:0 0 12px!important;padding:9px 12px!important;border:1px solid #25282b;border-radius:5px;background:#030405!important
      }
      [data-sonara-deck-engine="true"][data-console-skin="virtually"] [data-sonara-deck-grid="true"]{
        display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;gap:300px!important;margin-top:0!important;position:relative;z-index:3
      }
      [data-sonara-deck-engine="true"][data-console-skin="virtually"] > div:nth-child(3){
        position:absolute!important;z-index:14!important;left:50%!important;transform:translateX(-50%)!important;top:92px!important;width:270px!important;min-height:690px!important;
        margin:0!important;padding:14px 12px!important;border-radius:4px!important;border:1px solid #303235!important;
        background:
          linear-gradient(90deg,transparent 0 18%,rgba(255,153,0,.05) 18% 19%,transparent 19% 81%,rgba(255,153,0,.05) 81% 82%,transparent 82%),
          repeating-linear-gradient(0deg,rgba(255,255,255,.015) 0 1px,transparent 1px 4px),#08090a!important;
        box-shadow:0 18px 45px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.035)!important
      }
      [data-sonara-deck-engine="true"][data-console-skin="virtually"] > div:nth-child(3)::before{
        content:'SONARA  DJ  MIXER';display:block;margin:0 0 14px;padding:8px 4px;text-align:center;color:#f97316;font:900 14px/1 system-ui;letter-spacing:.08em;border-bottom:1px solid #26282a
      }
      [data-sonara-deck-engine="true"][data-console-skin="virtually"] > div:nth-child(3)::after{
        content:'';display:block;height:112px;margin:14px auto 4px;max-width:86px;border-radius:3px;
        background:repeating-linear-gradient(0deg,#22c55e 0 5px,transparent 5px 8px),linear-gradient(90deg,transparent 0 12%,#22c55e 12% 42%,transparent 42% 58%,#f59e0b 58% 88%,transparent 88%);
        opacity:.75;box-shadow:0 0 18px rgba(34,197,94,.12)
      }
      [data-deck-skin="virtually"]{
        --accent:#2d8cff;min-height:760px!important;padding:218px 16px 18px!important;border-radius:4px!important;border:1px solid #2d2f32!important;
        background:
          repeating-linear-gradient(0deg,rgba(255,255,255,.012) 0 1px,transparent 1px 4px),
          radial-gradient(circle at 50% 40%,rgba(45,140,255,.055),transparent 31%),#070809!important;
        grid-template-areas:'transport transport' 'pads pads' 'tempo tempo' 'eq eq'!important;grid-template-rows:auto auto auto auto!important;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.035),0 20px 50px rgba(0,0,0,.45)!important
      }
      [data-deck-skin="virtually"] > div:nth-of-type(1){position:absolute!important;left:12px;right:12px;top:12px;z-index:7;padding:0 2px 8px;border-bottom:1px solid #282a2d}
      [data-deck-skin="virtually"] > div:nth-of-type(2){position:absolute!important;left:12px;right:12px;top:58px;height:132px!important;min-height:132px!important;z-index:6;border-radius:2px!important;border-color:#24272a!important;background:linear-gradient(180deg,#020305,#05080d)!important;box-shadow:inset 0 0 30px rgba(0,0,0,.95)!important}
      [data-deck-skin="virtually"] > div:nth-of-type(3){grid-area:transport!important;margin-top:325px!important}
      [data-deck-skin="virtually"] > div:nth-of-type(5){grid-area:pads!important}
      [data-deck-skin="virtually"] > div:nth-of-type(6){grid-area:tempo!important}
      [data-deck-skin="virtually"] > div:nth-of-type(7){grid-area:eq!important;border-top:1px solid #232528;padding-top:12px}
      [data-deck-skin="virtually"]::before{
        width:282px!important;height:282px!important;left:50%!important;transform:translateX(-50%)!important;top:208px!important;border:15px solid #17191c!important;
        background:
          radial-gradient(circle,#020305 0 16%,#2d8cff 17% 20%,#fbbf24 21% 24%,#f4f4f5 25% 28%,#111827 29% 35%,transparent 36%),
          repeating-radial-gradient(circle,#0c0e10 0 7px,#181a1d 7px 12px)!important;
        box-shadow:0 0 0 2px #73777c,0 0 0 11px #0c0d0f,0 22px 55px rgba(0,0,0,.78),inset 0 0 0 36px rgba(0,0,0,.24)!important
      }
      [data-deck-skin="virtually"]::after{
        width:88px!important;height:88px!important;left:50%!important;transform:translateX(-50%)!important;top:305px!important;border:2px solid #3b82f6!important;background:#010204!important;color:#fff!important;font-size:10px!important;box-shadow:0 0 0 8px rgba(45,140,255,.16),0 0 22px rgba(45,140,255,.22)!important
      }
      [data-deck-skin="virtually"][data-sonara-deck="B"]{--accent:#22c55e}
      [data-deck-skin="virtually"][data-sonara-deck="B"]::before{
        background:radial-gradient(circle,#020305 0 16%,#2d8cff 17% 20%,#fbbf24 21% 24%,#f4f4f5 25% 28%,#111827 29% 35%,transparent 36%),repeating-radial-gradient(circle,#0c0e10 0 7px,#181a1d 7px 12px)!important
      }
      [data-deck-skin="virtually"] button{border-radius:4px!important;border-color:#303236!important;background-color:#0c1014!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.045)!important}
      [data-deck-skin="virtually"] > div:nth-of-type(3) button:first-child{border-color:#22c55e!important;box-shadow:inset 0 0 0 1px rgba(34,197,94,.35),0 0 12px rgba(34,197,94,.08)!important}
      [data-deck-skin="virtually"] > div:nth-of-type(5) button{background:linear-gradient(180deg,#163154,#0a1727)!important;border-color:#1d385a!important}

      [data-deck-skin="prime"]{--accent:#67e8f9;background:radial-gradient(circle at 82% 15%,rgba(34,211,238,.14),transparent 26%),linear-gradient(155deg,#02060a,#07121c 62%,#03070d)!important;border-color:rgba(34,211,238,.38)!important;padding-top:246px!important}
      [data-deck-skin="prime"]::before{width:194px;height:194px;right:26px;top:34px;border-width:13px}
      [data-deck-skin="prime"]::after{width:72px;height:72px;right:87px;top:95px;color:#a5f3fc}
      [data-deck-skin="prime"] > div:nth-of-type(2){min-height:142px}

      [data-deck-skin="prowave"]{--accent:#38bdf8;background:linear-gradient(155deg,#020617,#071527 55%,#03101a)!important;border-color:rgba(56,189,248,.38)!important;grid-template-areas:'head head' 'wave wave' 'wave wave' 'transport pads' 'tempo pads' 'eq eq';grid-template-columns:.82fr 1.18fr;grid-template-rows:auto 116px 116px auto auto auto}
      [data-deck-skin="prowave"]::before{width:92px;height:92px;right:20px;top:18px;border-width:7px}
      [data-deck-skin="prowave"]::after{width:38px;height:38px;right:47px;top:45px;font-size:8px}
      [data-deck-skin="prowave"] > div:nth-of-type(2){min-height:244px}

      [data-deck-skin="battle"]{--accent:#fb7185;background:linear-gradient(150deg,#080508,#180711 64%,#090307)!important;border-color:rgba(244,63,94,.36)!important;grid-template-areas:'head head' 'wave pads' 'wave pads' 'transport pads' 'tempo tempo' 'eq eq';grid-template-columns:1.12fr .88fr;grid-template-rows:auto 100px 100px auto auto auto;padding-top:168px!important}
      [data-deck-skin="battle"]::before{width:132px;height:132px;left:26px;top:24px}
      [data-deck-skin="battle"]::after{width:50px;height:50px;left:67px;top:65px;font-size:9px}
      [data-deck-skin="battle"] > div:nth-of-type(2){min-height:212px}

      [data-deck-skin="broadcast"]{--accent:#7dd3fc;background:linear-gradient(150deg,#030712,#0b1220 60%,#050914)!important;border-color:rgba(125,211,252,.24)!important;grid-template-areas:'head head' 'wave wave' 'transport pads' 'tempo pads' 'eq eq';grid-template-columns:.9fr 1.1fr;grid-template-rows:auto 166px auto auto auto}
      [data-deck-skin="broadcast"]::before{width:76px;height:76px;right:18px;top:18px;border-width:6px;opacity:.5}
      [data-deck-skin="broadcast"]::after{width:30px;height:30px;right:41px;top:41px;font-size:7px}

      [data-deck-skin="club"]{--accent:#67e8f9;background:linear-gradient(155deg,#03070b,#07131e 72%,#06202a)!important;border-color:rgba(34,211,238,.3)!important;padding-top:218px!important}
      [data-deck-skin="club"]::before{width:164px;height:164px;right:24px;top:42px}
      [data-deck-skin="club"]::after{width:66px;height:66px;right:73px;top:91px}

      [data-deck-skin="carbon"]{--accent:#cbd5e1;background:linear-gradient(145deg,#050607,#11151a 58%,#08090b)!important;border-color:rgba(148,163,184,.28)!important;grid-template-areas:'head head' 'wave transport' 'wave pads' 'tempo pads' 'eq eq';grid-template-columns:1.18fr .82fr;grid-template-rows:auto 116px auto auto auto}
      [data-deck-skin="carbon"]::before{width:116px;height:116px;right:26px;top:20px;opacity:.38}
      [data-deck-skin="carbon"]::after{width:48px;height:48px;right:70px;top:54px;font-size:9px}

      [data-deck-skin="neon"]{--accent:#e879f9;background:radial-gradient(circle at 85% 8%,rgba(217,70,239,.2),transparent 32%),linear-gradient(155deg,#020617,#07152a)!important;border-color:rgba(232,121,249,.34)!important;grid-template-areas:'head head' 'wave wave' 'pads pads' 'transport transport' 'tempo eq';grid-template-rows:auto 156px auto auto auto}
      [data-deck-skin="neon"]::before{width:112px;height:112px;right:22px;top:20px}
      [data-deck-skin="neon"]::after{width:46px;height:46px;right:65px;top:53px;font-size:9px}

      [data-deck-skin="stage"]{--accent:#fbbf24;background:linear-gradient(155deg,#140406,#31090d)!important;border-color:rgba(248,113,113,.4)!important;grid-template-areas:'head head' 'transport transport' 'wave wave' 'pads pads' 'tempo tempo' 'eq eq';grid-template-rows:auto auto 132px auto auto auto}
      [data-deck-skin="stage"]::before{width:100px;height:100px;right:24px;top:22px;opacity:.45}
      [data-deck-skin="stage"]::after{width:42px;height:42px;right:63px;top:51px;font-size:8px}

      [data-deck-skin="vinyl"]{--accent:#fde047;background:linear-gradient(155deg,#030303,#151207)!important;border-color:rgba(250,204,21,.3)!important;padding-top:286px!important}
      [data-deck-skin="vinyl"]::before{width:230px;height:230px;left:50%;transform:translateX(-50%);top:42px;border-width:14px}
      [data-deck-skin="vinyl"]::after{width:80px;height:80px;left:50%;transform:translateX(-50%);top:117px;color:#fde047}

      [data-deck-skin="minimal"]{--accent:#e2e8f0;background:linear-gradient(155deg,#0b0d10,#10151c)!important;border-color:rgba(226,232,240,.18)!important;grid-template-areas:'head head' 'wave wave' 'wave wave' 'transport pads' 'tempo pads' 'eq eq';grid-template-columns:.8fr 1.2fr;grid-template-rows:auto 100px 100px auto auto auto}
      [data-deck-skin="minimal"]::before,[data-deck-skin="minimal"]::after{display:none}
      [data-deck-skin="minimal"] > div:nth-of-type(2){min-height:212px}

      @media(max-width:1180px){
        [data-sonara-deck-engine="true"][data-console-skin="virtually"] [data-sonara-deck-grid="true"]{gap:230px!important}
        [data-sonara-deck-engine="true"][data-console-skin="virtually"] > div:nth-child(3){width:205px!important}
        [data-deck-skin="virtually"]::before{width:230px!important;height:230px!important;top:230px!important}
        [data-deck-skin="virtually"]::after{top:306px!important}
      }
      @media(max-width:900px){
        [data-sonara-deck-engine="true"][data-console-skin="virtually"] [data-sonara-deck-grid="true"]{display:block!important}
        [data-sonara-deck-engine="true"][data-console-skin="virtually"] > div:nth-child(3){position:relative!important;left:auto!important;top:auto!important;transform:none!important;width:auto!important;min-height:0!important;margin-top:14px!important}
        [data-deck-skin="virtually"]{margin-bottom:14px!important}
      }
      @media(max-width:760px){
        [data-sonara-deck-engine="true"] [data-deck-skin]{display:block!important;min-height:0!important;padding:14px!important}
        [data-deck-skin] > div{margin-top:12px!important}
        [data-deck-skin] > div:nth-of-type(1){margin-top:0!important;padding-right:94px}
        [data-deck-skin]::before{width:76px!important;height:76px!important;right:14px!important;left:auto!important;top:14px!important;transform:none!important;border-width:7px!important;display:block!important}
        [data-deck-skin]::after{width:32px!important;height:32px!important;right:36px!important;left:auto!important;top:36px!important;transform:none!important;font-size:7px!important;display:flex!important}
        [data-deck-skin="minimal"]::before,[data-deck-skin="minimal"]::after{display:none!important}
        [data-deck-skin] > div:nth-of-type(2){position:relative!important;left:auto!important;right:auto!important;top:auto!important;min-height:110px!important;height:110px!important}
        [data-deck-skin="virtually"] > div:nth-of-type(1){position:relative!important;left:auto!important;right:auto!important;top:auto!important}
        [data-deck-skin="virtually"] > div:nth-of-type(3){margin-top:12px!important}
      }
    `}</style>

    <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2"><Palette className="h-4 w-4 text-cyan-300"/><h2 className="text-sm font-black text-white">SONARA PRO DECK SKINS</h2><span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[8px] font-black text-emerald-300">LIVE STRUCTURAL UI</span></div>
        <p className="mt-1 text-[10px] leading-5 text-slate-500">La skin Virtually Pioneer LIVE usa la tua immagine come modello visivo ma ricostruisce l'interfaccia con controlli Sonara reali, non con una fotografia statica.</p>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-[9px] text-slate-400"><span className="font-black text-white">Profilo:</span> {profileName} · {activeLabel}</div>
    </div>

    <div className="mt-4 flex flex-wrap gap-2">
      {(['A','B','ALL'] as const).map(value => <button key={value} onClick={() => setTarget(value)} className={`rounded-xl border px-3 py-2 text-[9px] font-black ${target === value ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100' : 'border-slate-800 bg-slate-950 text-slate-500'}`}>{value === 'ALL' ? 'DECK A + B' : `DECK ${value}`}</button>)}
    </div>

    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {SKINS.map(skin => {
        const selected = target === 'ALL' ? skins.A === skin.id && skins.B === skin.id : skins[target] === skin.id;
        return <button key={skin.id} onClick={() => applySkin(skin.id)} className={`group overflow-hidden rounded-2xl border text-left transition ${selected ? 'border-cyan-300/55 bg-cyan-400/5 shadow-lg shadow-cyan-950/20' : 'border-slate-800 bg-slate-950 hover:border-slate-700'}`}>
          <div className="relative h-20 overflow-hidden border-b border-white/5" style={{ background: skin.swatch }}><div className="absolute bottom-2 left-2 rounded-md border border-white/10 bg-black/55 px-2 py-1 text-[7px] font-black tracking-[.14em] text-white/80">{skin.layout}</div>{skin.fullConsole ? <div className="absolute right-2 top-2 rounded-md bg-orange-500 px-1.5 py-1 text-[6px] font-black text-black">FULL</div> : null}</div>
          <div className="p-3"><div className="flex items-center justify-between gap-2"><span className="text-[9px] font-black text-white">{skin.name}</span>{selected ? <Check className="h-3.5 w-3.5 text-cyan-300"/> : <Layers3 className="h-3.5 w-3.5 text-slate-700"/>}</div><div className="mt-1 text-[8px] leading-4 text-slate-600">{skin.description}</div></div>
        </button>;
      })}
    </div>

    <div className="mt-3 flex items-start gap-2 rounded-xl border border-slate-800 bg-black/20 px-3 py-2 text-[8px] leading-4 text-slate-500"><Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300"/><span>Virtually Pioneer LIVE viene applicata contemporaneamente a Deck A + B per ricreare la console completa. Play, Cue, Loop, Hot Cue, EQ, Filter, waveform, crossfader e Master restano controlli reali del Live Deck Engine.</span></div>
  </section>;
}