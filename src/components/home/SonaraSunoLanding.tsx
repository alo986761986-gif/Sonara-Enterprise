import { useEffect, useRef, useState } from 'react';
import { Music2, Play, Plus, Shuffle, SlidersHorizontal, Sparkles, Upload } from 'lucide-react';
import { WORLD_MUSIC_GENRES } from '../../data/worldMusicGenres';

const HERO_IDEAS = [
  'a jazz song about midnight rain',
  'a deep house track for a neon night drive',
  'a warm 90s classic house anthem',
  'a cinematic afro house journey at sunset',
  'an old-school hip hop track with dusty drums',
  'a soulful reggae song with a summer groove'
];

type StyleMatch = {
  family: string;
  genre: string;
  subgenre?: string;
  score: number;
};

function normalize(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsPhrase(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

function inferStyle(prompt: string): StyleMatch | null {
  const text = normalize(prompt);
  if (!text) return null;
  let best: StyleMatch | null = null;

  for (const group of WORLD_MUSIC_GENRES) {
    for (const genre of group.genres) {
      const genreName = normalize(genre.name);
      if (containsPhrase(text, genreName)) {
        const score = 100 + genreName.length;
        if (!best || score > best.score) best = { family: group.family, genre: genre.name, score };
      }

      for (const subgenre of genre.subgenres) {
        const subgenreName = normalize(subgenre);
        if (!containsPhrase(text, subgenreName)) continue;
        const score = 1000 + subgenreName.length;
        if (!best || score > best.score) {
          best = { family: group.family, genre: genre.name, subgenre, score };
        }
      }
    }
  }

  return best;
}

function setControlledValue(element: HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLSelectElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function wait(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function waitForElement<T extends Element>(selector: string, timeoutMs = 6000): Promise<T | null> {
  const existing = document.querySelector(selector) as T | null;
  if (existing) return Promise.resolve(existing);

  return new Promise(resolve => {
    let settled = false;
    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timeout);
      resolve(value);
    };
    const observer = new MutationObserver(() => {
      const found = document.querySelector(selector) as T | null;
      if (found) finish(found);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timeout = window.setTimeout(() => finish(null), timeoutMs);
  });
}

async function openAppView(index: number): Promise<boolean> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const aside = document.querySelector('aside');
    const buttons = aside ? Array.from(aside.querySelectorAll(':scope > button')) as HTMLButtonElement[] : [];
    if (buttons[index]) {
      buttons[index].click();
      await wait(40);
      return true;
    }
    await wait(100);
  }
  return false;
}

async function applyPromptTaxonomy(textarea: HTMLTextAreaElement, prompt: string) {
  const match = inferStyle(prompt);
  if (!match) return;

  let card = textarea.closest('section');
  let selects = card ? Array.from(card.querySelectorAll('select')) as HTMLSelectElement[] : [];
  if (selects[0]) {
    setControlledValue(selects[0], match.family);
    await wait(70);
  }

  card = textarea.closest('section');
  selects = card ? Array.from(card.querySelectorAll('select')) as HTMLSelectElement[] : [];
  if (selects[1] && Array.from(selects[1].options).some(option => option.value === match.genre)) {
    setControlledValue(selects[1], match.genre);
    await wait(70);
  }

  if (match.subgenre) {
    card = textarea.closest('section');
    selects = card ? Array.from(card.querySelectorAll('select')) as HTMLSelectElement[] : [];
    if (selects[2] && Array.from(selects[2].options).some(option => option.value === match.subgenre)) {
      setControlledValue(selects[2], match.subgenre);
      await wait(70);
    }
  }

  card = textarea.closest('section');
  selects = card ? Array.from(card.querySelectorAll('select')) as HTMLSelectElement[] : [];
  const moodSelect = selects[3];
  if (moodSelect) {
    const promptText = normalize(prompt);
    const mood = Array.from(moodSelect.options)
      .map(option => option.value)
      .filter(Boolean)
      .sort((a, b) => normalize(b).length - normalize(a).length)
      .find(value => containsPhrase(promptText, normalize(value)));
    if (mood) setControlledValue(moodSelect, mood);
  }
}

async function selectCreatorTab(label: 'Simple' | 'Advanced' | 'Sounds') {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const target = buttons.find(button => button.textContent?.trim().toLowerCase() === label.toLowerCase());
    if (target) {
      target.click();
      return;
    }
    await wait(80);
  }
}

async function triggerRealGeneration(): Promise<boolean> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const button = document.querySelector<HTMLButtonElement>('[data-sonara-eleven-generator-host] button');
    if (button && !button.disabled) {
      button.click();
      return true;
    }
    await wait(100);
  }

  const textarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
  const card = textarea?.closest('section');
  const fallback = card
    ? Array.from(card.querySelectorAll<HTMLButtonElement>('button')).find(button => {
        const className = String(button.className || '');
        return className.includes('bg-gradient-to-r') && className.includes('w-full') && !button.disabled;
      })
    : null;
  fallback?.click();
  return Boolean(fallback);
}

export default function SonaraSunoLanding() {
  const [visible, setVisible] = useState(true);
  const [ideaIndex, setIdeaIndex] = useState(0);
  const [prompt, setPrompt] = useState('');
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [bridgeError, setBridgeError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!visible || prompt.trim()) return;
    const timer = window.setInterval(() => setIdeaIndex(index => (index + 1) % HERO_IDEAS.length), 5200);
    return () => window.clearInterval(timer);
  }, [visible, prompt]);

  useEffect(() => {
    document.body.dataset.sonaraLanding = visible ? 'true' : 'false';
    return () => { delete document.body.dataset.sonaraLanding; };
  }, [visible]);

  const openCreator = async (mode: 'Simple' | 'Advanced' | 'Sounds', generateNow = false) => {
    if (bridgeBusy) return;
    setBridgeBusy(true);
    setBridgeError('');

    const opened = await openAppView(1);
    if (!opened) {
      setBridgeError('Music Creator SONARA non disponibile. Riprova tra un istante.');
      setBridgeBusy(false);
      return;
    }

    const textarea = await waitForElement<HTMLTextAreaElement>('#sonara-prompt');
    if (!textarea) {
      setBridgeError('Il campo di creazione SONARA non si è aperto correttamente.');
      setBridgeBusy(false);
      return;
    }

    if (prompt.trim()) {
      setControlledValue(textarea, prompt.trim());
      await applyPromptTaxonomy(textarea, prompt.trim());
    }

    await selectCreatorTab(mode);
    setVisible(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (generateNow) {
      const started = await triggerRealGeneration();
      if (!started) {
        setVisible(true);
        setBridgeError('Il comando Create non è ancora pronto. Apri Advanced e riprova.');
      }
    } else {
      window.setTimeout(() => textarea.focus(), 220);
    }

    setBridgeBusy(false);
  };

  const importAudio = async (files: FileList | null) => {
    if (!files?.length || bridgeBusy) return;
    setBridgeBusy(true);
    setBridgeError('');
    const opened = await openAppView(2);
    if (!opened) {
      setBridgeError('Production Suite SONARA non disponibile.');
      setBridgeBusy(false);
      return;
    }

    setVisible(false);
    const input = await waitForElement<HTMLInputElement>('main input[type="file"][accept*="audio"]');
    if (input) {
      try {
        const transfer = new DataTransfer();
        Array.from(files).forEach(file => transfer.items.add(file));
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } catch {
        input.click();
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setBridgeBusy(false);
  };

  if (!visible) return null;

  return (
    <div className="sonara-suno-landing" role="dialog" aria-label="SONARA Create home">
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a,.aac"
        multiple
        className="hidden"
        onChange={event => void importAudio(event.currentTarget.files)}
      />

      <div className="sonara-suno-ambient sonara-suno-ambient-a" />
      <div className="sonara-suno-ambient sonara-suno-ambient-b" />
      <div className="sonara-suno-grain" />

      <div className="sonara-suno-cover sonara-suno-cover-left" aria-hidden="true">
        <div className="sonara-suno-cover-art sonara-suno-art-left">
          <span className="sonara-suno-cover-wave">SONARA</span>
          <div className="sonara-suno-cover-play"><Play /></div>
        </div>
        <div className="sonara-suno-cover-meta"><strong>Midnight Sessions</strong><span>Deep · Soulful · Original</span></div>
      </div>

      <div className="sonara-suno-cover sonara-suno-cover-right" aria-hidden="true">
        <div className="sonara-suno-cover-art sonara-suno-art-right">
          <Music2 />
          <div className="sonara-suno-cover-play"><Play /></div>
        </div>
        <div className="sonara-suno-cover-meta"><strong>Neon Motion</strong><span>Electronic · Future · SONARA</span></div>
      </div>

      <header className="sonara-suno-topbar">
        <button type="button" className="sonara-suno-wordmark" onClick={() => setPrompt('')} aria-label="SONARA home">SONARA</button>
        <button type="button" className="sonara-suno-top-create" onClick={() => void openCreator('Simple')}>Create</button>
      </header>

      <main className="sonara-suno-main">
        <div className="sonara-suno-copy">
          <h1>Make {HERO_IDEAS[ideaIndex]}</h1>
          <p>Start with a simple prompt or open the professional SONARA editing tools. Your next track is one step away.</p>
        </div>

        <div className="sonara-suno-composer">
          <textarea
            value={prompt}
            onChange={event => setPrompt(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (prompt.trim()) void openCreator('Simple', true);
              }
            }}
            rows={2}
            placeholder="Chat to make music"
            aria-label="Chat to make music"
          />

          <div className="sonara-suno-actions">
            <div className="sonara-suno-actions-left">
              <button
                type="button"
                className="sonara-suno-circle"
                onClick={() => fileInputRef.current?.click()}
                title="Importa audio o stems reali"
                aria-label="Importa audio o stems reali"
              >
                <Plus />
              </button>
              <button type="button" className="sonara-suno-advanced" onClick={() => void openCreator('Advanced')}>
                <SlidersHorizontal /> <span>Advanced</span>
              </button>
            </div>

            <div className="sonara-suno-actions-right">
              <button
                type="button"
                className="sonara-suno-random"
                onClick={() => {
                  const next = (ideaIndex + 1 + Math.floor(Math.random() * (HERO_IDEAS.length - 1))) % HERO_IDEAS.length;
                  setIdeaIndex(next);
                  setPrompt(`Create ${HERO_IDEAS[next]}`);
                }}
                title="Idea casuale"
                aria-label="Idea casuale"
              >
                <Shuffle />
              </button>
              <button
                type="button"
                className="sonara-suno-create"
                disabled={!prompt.trim() || bridgeBusy}
                onClick={() => void openCreator('Simple', true)}
              >
                <Sparkles /> <span>{bridgeBusy ? 'Opening…' : 'Create'}</span>
              </button>
            </div>
          </div>

          {bridgeError && <div className="sonara-suno-error">{bridgeError}</div>}
        </div>

        <div className="sonara-suno-footnote">
          <span><Sparkles /> Real SONARA generation</span>
          <span><Upload /> Audio import</span>
          <span><SlidersHorizontal /> Advanced studio</span>
        </div>
      </main>

      <style>{`
        body[data-sonara-landing="true"]{overflow:hidden!important;background:#130c07!important}
        .sonara-suno-landing{position:fixed;inset:0;z-index:10000;overflow:auto;background:#130c07;color:#fff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;isolation:isolate}
        .sonara-suno-landing *{box-sizing:border-box}
        .sonara-suno-ambient{position:absolute;inset:auto;pointer-events:none;filter:blur(10px);opacity:.92}
        .sonara-suno-ambient-a{left:-8%;top:-18%;width:78%;height:88%;background:radial-gradient(circle at 45% 40%,rgba(242,147,22,.64),rgba(137,54,12,.42) 38%,rgba(28,13,7,0) 72%)}
        .sonara-suno-ambient-b{right:-12%;top:-15%;width:80%;height:90%;background:radial-gradient(circle at 48% 40%,rgba(191,29,84,.55),rgba(115,30,19,.4) 40%,rgba(24,13,7,0) 73%)}
        .sonara-suno-grain{position:absolute;inset:0;pointer-events:none;opacity:.26;background-image:radial-gradient(rgba(255,255,255,.17) .55px,transparent .55px);background-size:4px 4px;mix-blend-mode:soft-light}
        .sonara-suno-topbar{position:relative;z-index:6;display:flex;align-items:center;justify-content:space-between;padding:30px 34px}
        .sonara-suno-wordmark{border:0;background:transparent;color:white;font-size:28px;font-weight:950;letter-spacing:.07em;text-shadow:0 2px 18px rgba(0,0,0,.25)}
        .sonara-suno-top-create{border:1px solid rgba(255,255,255,.5);border-radius:12px;background:#fff;color:#16110d;padding:13px 22px;font-size:15px;font-weight:800;box-shadow:0 10px 30px rgba(0,0,0,.18);transition:.18s ease}
        .sonara-suno-top-create:hover{transform:translateY(-1px);background:#f7f5f2}
        .sonara-suno-main{position:relative;z-index:5;min-height:calc(100vh - 102px);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 24px 82px}
        .sonara-suno-copy{width:min(980px,82vw);text-align:center;text-shadow:0 4px 24px rgba(0,0,0,.28)}
        .sonara-suno-copy h1{margin:0 auto;max-width:940px;font-size:clamp(44px,5.5vw,86px);line-height:1.03;letter-spacing:-.045em;font-weight:760}
        .sonara-suno-copy p{max-width:670px;margin:26px auto 0;color:rgba(255,255,255,.86);font-size:clamp(15px,1.45vw,19px);line-height:1.55;font-weight:520}
        .sonara-suno-composer{width:min(980px,82vw);margin-top:34px;border:1px solid rgba(255,255,255,.08);border-radius:28px;background:rgba(28,20,15,.88);box-shadow:0 22px 70px rgba(0,0,0,.36),inset 0 1px 0 rgba(255,255,255,.025);backdrop-filter:blur(24px);padding:18px 18px 16px}
        .sonara-suno-composer textarea{display:block;width:100%;min-height:70px;resize:none;border:0;outline:0;background:transparent;color:#fff;padding:4px 12px 10px;font:500 18px/1.5 inherit;caret-color:#ff4f8b}
        .sonara-suno-composer textarea::placeholder{color:rgba(255,255,255,.48)}
        .sonara-suno-actions{display:flex;align-items:center;justify-content:space-between;gap:14px}
        .sonara-suno-actions-left,.sonara-suno-actions-right{display:flex;align-items:center;gap:10px}
        .sonara-suno-circle,.sonara-suno-random{display:grid;place-items:center;width:44px;height:44px;border:0;border-radius:999px;background:rgba(255,255,255,.075);color:rgba(255,255,255,.84);transition:.18s ease}
        .sonara-suno-circle:hover,.sonara-suno-random:hover{background:rgba(255,255,255,.14);color:#fff;transform:translateY(-1px)}
        .sonara-suno-circle svg{width:23px;height:23px}.sonara-suno-random svg{width:19px;height:19px}
        .sonara-suno-advanced{display:inline-flex;align-items:center;gap:8px;min-height:44px;border:0;border-radius:999px;background:rgba(255,255,255,.075);color:#f1ede9;padding:0 17px;font-size:14px;font-weight:720;transition:.18s ease}
        .sonara-suno-advanced:hover{background:rgba(255,255,255,.14)}.sonara-suno-advanced svg{width:16px;height:16px}
        .sonara-suno-create{display:inline-flex;align-items:center;justify-content:center;gap:9px;min-height:48px;border:0;border-radius:999px;background:linear-gradient(100deg,#f43f91,#ff5f48 52%,#ff7a35);color:white;padding:0 24px;font-size:15px;font-weight:850;box-shadow:0 10px 32px rgba(225,47,97,.28);transition:.18s ease}
        .sonara-suno-create:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.07)}.sonara-suno-create:disabled{cursor:not-allowed;opacity:.42;box-shadow:none}.sonara-suno-create svg{width:18px;height:18px}
        .sonara-suno-error{margin:12px 8px 0;border-top:1px solid rgba(255,255,255,.06);padding:11px 4px 2px;color:#ffd4d9;font-size:12px}
        .sonara-suno-footnote{display:flex;flex-wrap:wrap;justify-content:center;gap:16px 24px;margin-top:18px;color:rgba(255,255,255,.48);font-size:10px;font-weight:720;letter-spacing:.05em;text-transform:uppercase}
        .sonara-suno-footnote span{display:inline-flex;align-items:center;gap:6px}.sonara-suno-footnote svg{width:12px;height:12px}
        .sonara-suno-cover{position:absolute;z-index:2;width:260px;border-radius:24px;overflow:hidden;background:rgba(16,12,10,.68);box-shadow:0 28px 70px rgba(0,0,0,.42);opacity:.84;pointer-events:none}
        .sonara-suno-cover-left{left:-56px;top:43%;transform:translateY(-50%) rotate(-10deg)}.sonara-suno-cover-right{right:-44px;top:44%;transform:translateY(-50%) rotate(8deg)}
        .sonara-suno-cover-art{position:relative;height:340px;display:flex;align-items:center;justify-content:center;overflow:hidden}
        .sonara-suno-art-left{background:radial-gradient(circle at 50% 33%,#76543e 0 14%,#31261d 15% 25%,#0f1517 26% 47%,#20140f 48% 100%)}
        .sonara-suno-art-left::before{content:'';position:absolute;left:40px;right:40px;bottom:36px;height:160px;border-radius:80px 80px 20px 20px;background:linear-gradient(180deg,#273137,#0d1113);box-shadow:0 -28px 90px rgba(255,181,96,.12)}
        .sonara-suno-art-right{background:linear-gradient(155deg,#101b18,#10271d 35%,#8a4b18 72%,#d16a1d)}
        .sonara-suno-art-right::before,.sonara-suno-art-right::after{content:'';position:absolute;border-radius:999px;background:rgba(95,255,98,.7);box-shadow:35px 22px 0 rgba(255,211,71,.8),-42px 36px 0 rgba(255,90,75,.62),20px -43px 0 rgba(97,192,255,.55)}
        .sonara-suno-art-right::before{width:18px;height:18px;top:82px;left:98px}.sonara-suno-art-right::after{width:11px;height:11px;top:150px;right:76px}
        .sonara-suno-art-right>svg{position:absolute;width:150px;height:150px;color:rgba(12,19,17,.78)}
        .sonara-suno-cover-wave{position:absolute;left:20px;bottom:18px;color:rgba(255,255,255,.22);font-size:26px;font-weight:950;letter-spacing:.12em}
        .sonara-suno-cover-play{position:absolute;left:50%;top:52%;display:grid;place-items:center;width:64px;height:64px;transform:translate(-50%,-50%);border-radius:999px;background:rgba(7,7,7,.62);backdrop-filter:blur(8px);color:white;box-shadow:0 8px 28px rgba(0,0,0,.28)}
        .sonara-suno-cover-play svg{width:25px;height:25px;fill:currentColor;margin-left:3px}
        .sonara-suno-cover-meta{padding:14px 16px 17px;background:rgba(8,7,6,.86)}.sonara-suno-cover-meta strong{display:block;font-size:13px}.sonara-suno-cover-meta span{display:block;margin-top:3px;color:rgba(255,255,255,.46);font-size:9px}
        @media(max-width:1100px){.sonara-suno-cover{opacity:.34}.sonara-suno-cover-left{left:-125px}.sonara-suno-cover-right{right:-120px}.sonara-suno-copy,.sonara-suno-composer{width:min(900px,90vw)}}
        @media(max-width:760px){.sonara-suno-topbar{padding:20px}.sonara-suno-wordmark{font-size:22px}.sonara-suno-top-create{padding:10px 16px}.sonara-suno-main{justify-content:flex-start;padding:96px 16px 52px}.sonara-suno-copy,.sonara-suno-composer{width:100%}.sonara-suno-copy h1{font-size:clamp(38px,12vw,56px)}.sonara-suno-copy p{margin-top:18px;font-size:14px}.sonara-suno-composer{margin-top:28px;border-radius:22px;padding:14px}.sonara-suno-composer textarea{min-height:90px;font-size:16px;padding-left:7px;padding-right:7px}.sonara-suno-actions{align-items:flex-end}.sonara-suno-actions-left{gap:7px}.sonara-suno-advanced span{display:none}.sonara-suno-advanced{width:44px;padding:0;justify-content:center}.sonara-suno-create{padding:0 18px}.sonara-suno-cover{display:none}.sonara-suno-footnote{gap:10px 14px;font-size:8px}}
      `}</style>
    </div>
  );
}
