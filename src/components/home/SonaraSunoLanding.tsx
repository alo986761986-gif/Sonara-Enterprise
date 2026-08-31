import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CreditCard,
  Download,
  Library,
  Music,
  Pause,
  Play,
  Plus,
  Rocket,
  Settings2,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Store,
  UploadCloud,
  Users,
  Volume2
} from 'lucide-react';
import { WORLD_MUSIC_GENRES } from '../../data/worldMusicGenres';
import { getAtmospheresForSelection } from '../../musicStyleIntelligence';

const HERO_IDEAS = [
  'a jazz song about waterin',
  'a deep house track for a neon night drive',
  'a warm 90s classic house anthem',
  'a cinematic afro house journey at sunset',
  'an old-school hip hop track with dusty drums',
  'a soulful reggae song with a summer groove'
];

const DURATION_OPTIONS = [30, 60, 90, 120, 180, 240, 300, 360, 420, 480];
const FALLBACK_MOODS = ['Relaxed', 'Deep', 'Emotional', 'Energetic', 'Dark', 'Uplifting', 'Cinematic'];

type SelectedTrack = {
  variationId?: string;
  jobId?: string;
  audioUrl: string;
  audioFormat?: string;
};

function wait(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function setControlledValue(element: HTMLTextAreaElement | HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function waitForElement<T extends Element>(selector: string, timeoutMs = 7000): Promise<T | null> {
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
  for (let attempt = 0; attempt < 35; attempt += 1) {
    const aside = document.querySelector('aside');
    const buttons = aside ? Array.from(aside.querySelectorAll(':scope > button')) as HTMLButtonElement[] : [];
    if (buttons[index]) {
      buttons[index].click();
      await wait(70);
      return true;
    }
    await wait(100);
  }
  return false;
}

async function selectCreatorTab(label: 'Simple' | 'Advanced' | 'Sounds') {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const target = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
      .find(button => button.textContent?.trim().toLowerCase() === label.toLowerCase());
    if (target) {
      target.click();
      return;
    }
    await wait(80);
  }
}

async function triggerRealGeneration(): Promise<boolean> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
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

function readStoredTrack(): SelectedTrack | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem('sonara.selectedGeneratedTrack') || 'null');
    return parsed?.audioUrl ? parsed as SelectedTrack : null;
  } catch {
    return null;
  }
}

function safeFileName(value: string) {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9-_ ]+/g, '').trim().replace(/\s+/g, '-') || 'sonara-track';
}

export default function SonaraSunoLanding() {
  const flattenedGenres = useMemo(() => WORLD_MUSIC_GENRES.flatMap(group => group.genres.map(genre => ({
    family: group.family,
    name: genre.name,
    subgenres: genre.subgenres
  }))), []);
  const preferredJazz = flattenedGenres.find(item => /jazz/i.test(item.name)) || flattenedGenres.find(item => /house/i.test(item.name)) || flattenedGenres[0];

  const [visible, setVisible] = useState(true);
  const [ideaIndex, setIdeaIndex] = useState(0);
  const [prompt, setPrompt] = useState('');
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [bridgeError, setBridgeError] = useState('');
  const [genre, setGenre] = useState(preferredJazz?.name || 'Jazz');
  const [subgenre, setSubgenre] = useState(preferredJazz?.subgenres?.[0] || preferredJazz?.name || 'Jazz');
  const [mood, setMood] = useState('Relaxed');
  const [bpm, setBpm] = useState(120);
  const [bpmMode, setBpmMode] = useState<'auto' | 'manual'>('auto');
  const [durationSec, setDurationSec] = useState(240);
  const [selectedTrack, setSelectedTrack] = useState<SelectedTrack | null>(readStoredTrack);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.78);
  const [liked, setLiked] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const genreEntry = useMemo(() => flattenedGenres.find(item => item.name === genre) || preferredJazz, [flattenedGenres, genre, preferredJazz]);
  const genreFamily = genreEntry?.family || WORLD_MUSIC_GENRES[0]?.family || 'Electronic / Dance';
  const subgenreOptions = genreEntry?.subgenres?.length ? genreEntry.subgenres : [genre];
  const moodOptions = useMemo(() => {
    const values = getAtmospheresForSelection(genreFamily, genre, subgenre);
    return values.length ? values : FALLBACK_MOODS;
  }, [genreFamily, genre, subgenre]);

  useEffect(() => {
    if (!subgenreOptions.includes(subgenre)) setSubgenre(subgenreOptions[0] || genre);
  }, [genre, subgenre, subgenreOptions]);

  useEffect(() => {
    if (!moodOptions.includes(mood)) setMood(moodOptions[0] || 'Relaxed');
  }, [mood, moodOptions]);

  useEffect(() => {
    if (!visible || prompt.trim()) return;
    const timer = window.setInterval(() => setIdeaIndex(index => (index + 1) % HERO_IDEAS.length), 5600);
    return () => window.clearInterval(timer);
  }, [visible, prompt]);

  useEffect(() => {
    document.body.dataset.sonaraLanding = visible ? 'true' : 'false';
    return () => { delete document.body.dataset.sonaraLanding; };
  }, [visible]);

  useEffect(() => {
    const onSelected = (event: Event) => {
      const detail = (event as CustomEvent<SelectedTrack>).detail;
      if (detail?.audioUrl) setSelectedTrack(detail);
    };
    window.addEventListener('sonara:generated-track-selected', onSelected);
    return () => window.removeEventListener('sonara:generated-track-selected', onSelected);
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    setPlaying(false);
  }, [selectedTrack?.audioUrl]);

  const applyLandingControls = async (textarea: HTMLTextAreaElement) => {
    let card = textarea.closest('section');
    let selects = card ? Array.from(card.querySelectorAll('select')) as HTMLSelectElement[] : [];

    if (selects[0]) {
      setControlledValue(selects[0], genreFamily);
      await wait(80);
    }
    card = textarea.closest('section');
    selects = card ? Array.from(card.querySelectorAll('select')) as HTMLSelectElement[] : [];
    if (selects[1] && Array.from(selects[1].options).some(option => option.value === genre)) {
      setControlledValue(selects[1], genre);
      await wait(80);
    }
    card = textarea.closest('section');
    selects = card ? Array.from(card.querySelectorAll('select')) as HTMLSelectElement[] : [];
    if (selects[2] && Array.from(selects[2].options).some(option => option.value === subgenre)) {
      setControlledValue(selects[2], subgenre);
      await wait(80);
    }
    card = textarea.closest('section');
    selects = card ? Array.from(card.querySelectorAll('select')) as HTMLSelectElement[] : [];
    if (selects[3] && Array.from(selects[3].options).some(option => option.value === mood)) {
      setControlledValue(selects[3], mood);
    }
    if (selects[5] && Array.from(selects[5].options).some(option => Number(option.value) === durationSec)) {
      setControlledValue(selects[5], String(durationSec));
    }

    const bpmInput = card?.querySelector('input[aria-label="BPM preferiti"]') as HTMLInputElement | null;
    if (bpmInput) {
      bpmInput.dataset.sonaraBpmMode = bpmMode;
      if (card instanceof HTMLElement) card.dataset.sonaraBpmMode = bpmMode;
      setControlledValue(bpmInput, String(bpm));
    }

    const bpmBlock = bpmInput?.closest('div');
    const modeButton = bpmBlock
      ? Array.from(bpmBlock.querySelectorAll<HTMLButtonElement>('button')).find(button => {
          const text = button.textContent?.trim().toLowerCase() || '';
          return bpmMode === 'auto' ? text === 'auto' : text === 'manual' || text === 'man';
        })
      : null;
    modeButton?.click();
  };

  const openCreator = async (mode: 'Simple' | 'Advanced' | 'Sounds', generateNow = false, focusTarget?: 'lyrics' | 'voice') => {
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

    const creatorPrompt = prompt.trim() || `Create an original ${subgenre} track with a ${mood.toLowerCase()} atmosphere.`;
    setControlledValue(textarea, creatorPrompt);
    await applyLandingControls(textarea);
    await selectCreatorTab(mode);
    setVisible(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (focusTarget === 'lyrics') {
      const female = document.querySelector<HTMLButtonElement>('button[data-sonara-vocal-mode="female"]');
      if (female && female.getAttribute('aria-pressed') !== 'true') female.click();
      const lyrics = await waitForElement<HTMLTextAreaElement>('#sonara-lyrics');
      lyrics?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => lyrics?.focus(), 250);
    } else if (focusTarget === 'voice') {
      const voice = document.querySelector<HTMLButtonElement>('button[data-sonara-vocal-mode="female"]');
      voice?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (!generateNow) {
      window.setTimeout(() => textarea.focus(), 220);
    }

    if (generateNow) {
      const started = await triggerRealGeneration();
      if (!started) {
        setVisible(true);
        setBridgeError('Il comando Create non è ancora pronto. Apri Advanced e riprova.');
      }
    }

    setBridgeBusy(false);
  };

  const openSection = async (index: number) => {
    if (bridgeBusy) return;
    setBridgeBusy(true);
    setBridgeError('');
    const opened = await openAppView(index);
    if (opened) {
      setVisible(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setBridgeError('Sezione SONARA non disponibile.');
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

  const randomPrompt = () => {
    const next = (ideaIndex + 1 + Math.floor(Math.random() * (HERO_IDEAS.length - 1))) % HERO_IDEAS.length;
    setIdeaIndex(next);
    setPrompt(`Create ${HERO_IDEAS[next]}`);
  };

  const togglePlayer = async () => {
    if (!selectedTrack?.audioUrl) {
      await openSection(4);
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const downloadSelectedTrack = async () => {
    if (!selectedTrack?.audioUrl) return;
    try {
      const response = await fetch(selectedTrack.audioUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${safeFileName(`sonara-${selectedTrack.variationId || 'track'}`)}.${selectedTrack.audioFormat || 'mp3'}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    } catch {
      window.open(selectedTrack.audioUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const shareSelectedTrack = async () => {
    if (!selectedTrack?.audioUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'SONARA generated track', url: selectedTrack.audioUrl });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(selectedTrack.audioUrl);
      }
    } catch {
      // Sharing is optional and user-cancelable.
    }
  };

  if (!visible) return null;

  return (
    <div className="sonara-violet-landing" role="dialog" aria-label="SONARA AI Music Creator home">
      <input ref={fileInputRef} type="file" accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a,.aac" multiple className="hidden" onChange={event => void importAudio(event.currentTarget.files)} />
      {selectedTrack?.audioUrl && (
        <audio
          ref={audioRef}
          src={selectedTrack.audioUrl}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          className="hidden"
        />
      )}

      <div className="sonara-violet-bg" />
      <div className="sonara-violet-grid" />
      <div className="sonara-violet-orb sonara-violet-orb-a" />
      <div className="sonara-violet-orb sonara-violet-orb-b" />

      <header className="sonara-violet-nav">
        <button type="button" className="sonara-violet-brand" onClick={() => void openSection(0)} aria-label="SONARA Home">
          <img src="/sonara-ai-icon.png" alt="SONARA" />
          <span>SONARA</span>
        </button>

        <nav aria-label="SONARA main navigation" className="sonara-violet-nav-links">
          <button type="button" data-active="true" onClick={() => void openSection(0)}><Sparkles />Home</button>
          <button type="button" onClick={() => void openSection(2)}><SlidersHorizontal />Studio</button>
          <button type="button" onClick={() => void openCreator('Simple')}><Music />Creator</button>
          <button type="button" onClick={() => void openSection(4)}><Library />Library</button>
          <button type="button" onClick={() => void openSection(5)}><Store />Marketplace</button>
          <button type="button" onClick={() => void openSection(10)}><Users />Community</button>
        </nav>

        <div className="sonara-violet-account">
          <button type="button" className="sonara-violet-credit" onClick={() => void openSection(12)}><CreditCard />Credits</button>
          <button type="button" className="sonara-violet-upgrade" onClick={() => void openSection(12)}>Upgrade</button>
          <button type="button" className="sonara-violet-settings" onClick={() => void openSection(13)} aria-label="Account settings"><Settings2 /></button>
          <button type="button" className="sonara-violet-avatar" onClick={() => void openSection(13)}>ME</button>
        </div>
      </header>

      <main className="sonara-violet-main">
        <div className="sonara-violet-card sonara-violet-card-left" aria-hidden="true">
          <div className="sonara-violet-art sonara-violet-art-left">
            <span className="sonara-violet-moon" />
            <span className="sonara-violet-sax">♪</span>
            <span className="sonara-violet-play"><Play /></span>
          </div>
          <div className="sonara-violet-card-copy">
            <strong>Midnight Blue</strong>
            <div><span>Jazz</span><span>Chill</span><span>Smooth</span></div>
            <small>SONARA AI</small>
          </div>
        </div>

        <section className="sonara-violet-hero">
          <div className="sonara-violet-badge"><Sparkles /> AI MUSIC CREATOR</div>
          <h1>Make <span>{HERO_IDEAS[ideaIndex]}</span></h1>
          <p>Start with a simple prompt or dive into our pro editing tools,<br />your next track is just a step away.</p>

          <div className="sonara-violet-composer">
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
              placeholder="Chat to make music..."
              aria-label="Chat to make music"
            />
            <div className="sonara-violet-composer-actions">
              <div>
                <button type="button" className="sonara-violet-plus" onClick={() => fileInputRef.current?.click()} title="Upload audio"><Plus /></button>
                <button type="button" className="sonara-violet-advanced" onClick={() => void openCreator('Advanced')}><SlidersHorizontal /> Advanced</button>
              </div>
              <div>
                <button type="button" className="sonara-violet-random" onClick={randomPrompt} title="Random prompt"><Shuffle /></button>
                <button type="button" className="sonara-violet-upload" onClick={() => fileInputRef.current?.click()} title="Upload audio"><UploadCloud /></button>
                <button type="button" className="sonara-violet-create" disabled={bridgeBusy} onClick={() => void openCreator('Simple', true)}><Music />{bridgeBusy ? 'Opening…' : 'Create'}</button>
              </div>
            </div>
            {bridgeError && <div className="sonara-violet-error">{bridgeError}</div>}
          </div>

          <div className="sonara-violet-quick-actions">
            <button type="button" onClick={randomPrompt}><Shuffle /><span><strong>Random Prompt</strong><small>Ispirazione casuale</small></span></button>
            <button type="button" onClick={() => void openCreator('Simple')}><Sparkles /><span><strong>Text to Song</strong><small>Scrivi la tua idea</small></span></button>
            <button type="button" onClick={() => fileInputRef.current?.click()}><UploadCloud /><span><strong>Upload Audio</strong><small>Usa un tuo audio</small></span></button>
            <button type="button" onClick={() => void openCreator('Advanced', false, 'lyrics')}><Rocket /><span><strong>Lyrics Mode</strong><small>Aggiungi testo</small></span></button>
            <button type="button" onClick={() => void openCreator('Advanced', false, 'voice')}><Volume2 /><span><strong>Voice & Style</strong><small>Scegli voce e stile</small></span></button>
          </div>
        </section>

        <div className="sonara-violet-card sonara-violet-card-right" aria-hidden="true">
          <div className="sonara-violet-art sonara-violet-art-right">
            <span className="sonara-violet-sun" />
            <span className="sonara-violet-crystals" />
            <span className="sonara-violet-play"><Play /></span>
          </div>
          <div className="sonara-violet-card-copy">
            <strong>Ocean Breeze</strong>
            <div><span>Jazz</span><span>Ambient</span><span>Relax</span></div>
            <small>SONARA AI</small>
          </div>
        </div>

        <section className="sonara-violet-controls" aria-label="Music controls">
          <label>GENERE MUSICALE<select value={genre} onChange={event => setGenre(event.target.value)}>{flattenedGenres.map(item => <option key={`${item.family}-${item.name}`} value={item.name}>{item.name}</option>)}</select></label>
          <label>SOTTOGENERE<select value={subgenre} onChange={event => setSubgenre(event.target.value)}>{subgenreOptions.map(item => <option key={item}>{item}</option>)}</select></label>
          <label>MOOD<select value={mood} onChange={event => setMood(event.target.value)}>{moodOptions.map(item => <option key={item}>{item}</option>)}</select></label>
          <label className="sonara-violet-bpm">BPM<div className="sonara-violet-bpm-row"><input type="number" min={40} max={220} value={bpm} onChange={event => setBpm(Math.max(40, Math.min(220, Number(event.target.value) || 120)))} /><span><button type="button" data-active={bpmMode === 'auto'} onClick={() => setBpmMode('auto')}>AUTO</button><button type="button" data-active={bpmMode === 'manual'} onClick={() => setBpmMode('manual')}>MAN</button></span></div></label>
          <label>DURATA<select value={durationSec} onChange={event => setDurationSec(Number(event.target.value))}>{DURATION_OPTIONS.map(value => <option key={value} value={value}>{value < 60 ? `${value}s` : `${value / 60}:00`}</option>)}</select></label>
        </section>
      </main>

      <footer className="sonara-violet-player">
        <div className="sonara-violet-player-brand"><span><Volume2 /></span><div><strong>{selectedTrack ? `SONARA MASTER ${selectedTrack.variationId || ''}` : 'SONARA CREATOR'}</strong><small>{selectedTrack ? 'Selected generated track' : 'AI Music Generation'}</small></div></div>
        <div className="sonara-violet-player-center"><button type="button" disabled>‹</button><button type="button" className="sonara-violet-player-play" onClick={() => void togglePlayer()}>{playing ? <Pause /> : <Play />}</button><button type="button" disabled>›</button></div>
        <div className="sonara-violet-player-tools"><span className="sonara-violet-tracks"><i /><i />{selectedTrack ? 'Selected Track' : '2 Tracks'}</span><button type="button" onClick={() => void downloadSelectedTrack()} disabled={!selectedTrack} title="Download"><Download /></button><button type="button" className={liked ? 'liked' : ''} onClick={() => setLiked(value => !value)} title="Favorite">♡</button><button type="button" onClick={() => void shareSelectedTrack()} disabled={!selectedTrack} title="Share">↗</button><Volume2 /><input type="range" min={0} max={1} step={0.01} value={volume} onChange={event => setVolume(Number(event.target.value))} aria-label="Volume" /></div>
      </footer>

      <style>{`
        body[data-sonara-landing="true"]{overflow:hidden!important;background:#020617!important}
        .sonara-violet-landing{position:fixed;inset:0;z-index:10000;overflow:auto;background:#020617;color:#f8fafc;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;isolation:isolate;padding-bottom:96px}
        .sonara-violet-landing *{box-sizing:border-box}.sonara-violet-landing button,.sonara-violet-landing select,.sonara-violet-landing input,.sonara-violet-landing textarea{font:inherit}
        .sonara-violet-bg{position:fixed;inset:0;z-index:-4;background:radial-gradient(circle at 22% 33%,rgba(126,34,206,.22),transparent 26%),radial-gradient(circle at 78% 37%,rgba(37,99,235,.24),transparent 29%),radial-gradient(circle at 50% 70%,rgba(217,70,239,.11),transparent 34%),linear-gradient(180deg,#020617 0%,#05051a 52%,#020617 100%)}
        .sonara-violet-grid{position:fixed;inset:0;z-index:-3;opacity:.17;background-image:linear-gradient(rgba(139,92,246,.16) 1px,transparent 1px),linear-gradient(90deg,rgba(59,130,246,.12) 1px,transparent 1px);background-size:64px 64px;mask-image:linear-gradient(to bottom,transparent 0%,black 28%,black 78%,transparent 100%)}
        .sonara-violet-orb{position:fixed;z-index:-2;border-radius:999px;filter:blur(80px);opacity:.22;pointer-events:none}.sonara-violet-orb-a{width:390px;height:390px;left:20%;top:16%;background:#a855f7}.sonara-violet-orb-b{width:420px;height:420px;right:15%;top:19%;background:#2563eb}
        .sonara-violet-nav{position:sticky;top:0;z-index:30;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:28px;min-height:78px;padding:0 30px;border-bottom:1px solid rgba(148,163,184,.10);background:rgba(2,6,23,.83);backdrop-filter:blur(22px)}
        .sonara-violet-brand{display:flex;align-items:center;gap:11px;border:0;background:transparent;color:white;font-size:22px;font-weight:950;letter-spacing:-.02em}.sonara-violet-brand img{width:38px;height:38px;border-radius:12px;object-fit:cover}.sonara-violet-nav-links{display:flex;align-items:center;justify-content:center;gap:5px}.sonara-violet-nav-links button{display:inline-flex;align-items:center;gap:8px;border:0;border-radius:12px;background:transparent;color:#cbd5e1;padding:11px 14px;font-size:13px;font-weight:720;transition:.18s ease}.sonara-violet-nav-links button:hover,.sonara-violet-nav-links button[data-active="true"]{background:linear-gradient(135deg,rgba(124,58,237,.30),rgba(59,130,246,.15));color:white}.sonara-violet-nav-links svg{width:15px;height:15px}.sonara-violet-account{display:flex;align-items:center;gap:9px}.sonara-violet-credit,.sonara-violet-settings,.sonara-violet-avatar{border:1px solid rgba(139,92,246,.28);background:rgba(15,23,42,.75);color:#dbeafe}.sonara-violet-credit{display:inline-flex;align-items:center;gap:7px;border-radius:12px;padding:9px 13px;font-size:12px;font-weight:760}.sonara-violet-credit svg,.sonara-violet-settings svg{width:15px;height:15px}.sonara-violet-upgrade{border:0;border-radius:12px;background:linear-gradient(100deg,#d946ef 0%,#a855f7 48%,#3b82f6 100%);color:white;padding:10px 17px;font-size:12px;font-weight:900;box-shadow:0 10px 34px rgba(139,92,246,.28)}.sonara-violet-settings,.sonara-violet-avatar{display:grid;place-items:center;width:38px;height:38px;border-radius:12px}.sonara-violet-avatar{border-radius:999px;background:linear-gradient(135deg,#312e81,#6d28d9);font-size:11px;font-weight:900}
        .sonara-violet-main{position:relative;z-index:1;display:grid;grid-template-columns:minmax(220px,300px) minmax(560px,920px) minmax(220px,300px);justify-content:center;align-items:start;gap:28px;max-width:1640px;margin:0 auto;padding:62px 24px 30px}.sonara-violet-hero{text-align:center}.sonara-violet-badge{display:inline-flex;align-items:center;gap:7px;border:1px solid rgba(217,70,239,.28);border-radius:999px;background:linear-gradient(90deg,rgba(126,34,206,.18),rgba(59,130,246,.08));padding:7px 14px;color:#d8b4fe;font-size:10px;font-weight:900;letter-spacing:.08em}.sonara-violet-badge svg{width:13px;height:13px}.sonara-violet-hero h1{max-width:920px;margin:26px auto 0;font-size:clamp(45px,5vw,78px);line-height:1.04;letter-spacing:-.055em;font-weight:820;color:white}.sonara-violet-hero h1 span{background:linear-gradient(95deg,#e879f9 0%,#c084fc 35%,#818cf8 68%,#60a5fa 100%);-webkit-background-clip:text;background-clip:text;color:transparent}.sonara-violet-hero>p{margin:22px auto 0;color:#cbd5e1;font-size:15px;line-height:1.55}
        .sonara-violet-composer{margin:30px auto 0;border:1px solid transparent;border-radius:27px;background:linear-gradient(#090b22,#090b22) padding-box,linear-gradient(100deg,#d946ef,#8b5cf6,#38bdf8) border-box;box-shadow:0 24px 80px rgba(30,27,75,.34),0 0 70px rgba(99,102,241,.10);padding:17px 20px}.sonara-violet-composer textarea{width:100%;min-height:72px;resize:none;border:0;outline:0;background:transparent;color:white;padding:6px 8px 10px;font-size:18px;line-height:1.5}.sonara-violet-composer textarea::placeholder{color:#94a3b8}.sonara-violet-composer-actions{display:flex;justify-content:space-between;align-items:center;gap:12px}.sonara-violet-composer-actions>div{display:flex;align-items:center;gap:9px}.sonara-violet-plus,.sonara-violet-random,.sonara-violet-upload{display:grid;place-items:center;width:44px;height:44px;border:1px solid rgba(148,163,184,.15);border-radius:13px;background:rgba(30,41,59,.58);color:#dbeafe;transition:.18s}.sonara-violet-plus:hover,.sonara-violet-random:hover,.sonara-violet-upload:hover{border-color:rgba(192,132,252,.46);background:rgba(88,28,135,.26);color:white}.sonara-violet-plus svg,.sonara-violet-random svg,.sonara-violet-upload svg{width:19px;height:19px}.sonara-violet-advanced{display:inline-flex;align-items:center;gap:8px;min-height:44px;border:1px solid rgba(148,163,184,.14);border-radius:13px;background:rgba(30,41,59,.58);color:#e2e8f0;padding:0 15px;font-size:13px;font-weight:760}.sonara-violet-advanced svg{width:16px;height:16px}.sonara-violet-create{display:inline-flex;align-items:center;gap:9px;min-height:48px;border:0;border-radius:14px;background:linear-gradient(100deg,#d946ef,#a855f7 48%,#3b82f6);color:white;padding:0 24px;font-size:15px;font-weight:900;box-shadow:0 12px 36px rgba(168,85,247,.28);transition:.18s}.sonara-violet-create:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.08)}.sonara-violet-create:disabled{opacity:.58}.sonara-violet-create svg{width:18px;height:18px}.sonara-violet-error{margin-top:12px;border-top:1px solid rgba(244,63,94,.18);padding-top:10px;color:#fecdd3;font-size:11px;text-align:left}
        .sonara-violet-quick-actions{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:22px auto 0}.sonara-violet-quick-actions button{display:flex;align-items:center;gap:11px;min-width:0;border:1px solid rgba(139,92,246,.16);border-radius:15px;background:linear-gradient(180deg,rgba(15,23,42,.82),rgba(12,14,39,.90));color:#e2e8f0;padding:13px;text-align:left;transition:.18s}.sonara-violet-quick-actions button:hover{transform:translateY(-1px);border-color:rgba(192,132,252,.42);background:linear-gradient(180deg,rgba(76,29,149,.20),rgba(30,41,59,.82))}.sonara-violet-quick-actions svg{width:20px;height:20px;flex:0 0 auto;color:#c084fc}.sonara-violet-quick-actions button:nth-child(3) svg,.sonara-violet-quick-actions button:nth-child(5) svg{color:#60a5fa}.sonara-violet-quick-actions span{min-width:0}.sonara-violet-quick-actions strong,.sonara-violet-quick-actions small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sonara-violet-quick-actions strong{font-size:11px}.sonara-violet-quick-actions small{margin-top:3px;color:#64748b;font-size:9px}
        .sonara-violet-card{margin-top:38px;overflow:hidden;border:1px solid rgba(139,92,246,.35);border-radius:24px;background:rgba(15,23,42,.72);box-shadow:0 28px 70px rgba(0,0,0,.38);transform-origin:center;opacity:.93}.sonara-violet-card-left{transform:rotate(-7deg)}.sonara-violet-card-right{transform:rotate(6deg);border-color:rgba(59,130,246,.38)}.sonara-violet-art{position:relative;height:330px;overflow:hidden}.sonara-violet-art-left{background:radial-gradient(circle at 50% 32%,#f0abfc 0 9%,#d946ef 10% 18%,rgba(126,34,206,.85) 19% 36%,#110b2e 37% 68%,#090b1f 100%)}.sonara-violet-art-left::before{content:'';position:absolute;left:0;right:0;bottom:0;height:48%;background:linear-gradient(180deg,transparent,rgba(15,23,42,.72)),repeating-linear-gradient(90deg,#0b1026 0 16px,#111638 16px 23px);clip-path:polygon(0 58%,8% 50%,13% 64%,21% 39%,28% 56%,35% 29%,43% 66%,52% 45%,62% 70%,72% 31%,81% 60%,90% 44%,100% 62%,100% 100%,0 100%)}.sonara-violet-moon{position:absolute;width:130px;height:130px;left:50%;top:48px;transform:translateX(-50%);border-radius:999px;background:radial-gradient(circle at 32% 30%,#f5d0fe,#d946ef 45%,#9333ea);box-shadow:0 0 60px rgba(217,70,239,.50)}.sonara-violet-sax{position:absolute;z-index:2;left:50%;top:42%;transform:translate(-50%,-50%) rotate(-12deg);color:#0b0820;font-size:118px;font-weight:900;text-shadow:0 0 30px rgba(0,0,0,.35)}.sonara-violet-art-right{background:linear-gradient(180deg,#101858 0%,#3b1d86 28%,#a855f7 54%,#fb7185 75%,#1d4ed8 100%)}.sonara-violet-art-right::before{content:'';position:absolute;left:-10%;right:-10%;bottom:0;height:46%;background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(59,130,246,.55)),repeating-radial-gradient(ellipse at center,rgba(255,255,255,.38) 0 1px,transparent 2px 22px);border-radius:50% 50% 0 0}.sonara-violet-sun{position:absolute;left:52%;top:41%;width:55px;height:55px;transform:translate(-50%,-50%);border-radius:999px;background:#fde68a;box-shadow:0 0 45px rgba(253,230,138,.60)}.sonara-violet-crystals{position:absolute;left:32px;bottom:58px;width:45px;height:92px;background:linear-gradient(160deg,#e879f9,#60a5fa);clip-path:polygon(48% 0,100% 55%,66% 100%,17% 87%,0 42%);filter:drop-shadow(34px 20px 0 rgba(192,132,252,.70)) drop-shadow(68px -8px 0 rgba(96,165,250,.58))}.sonara-violet-play{position:absolute;z-index:4;left:50%;top:53%;display:grid;place-items:center;width:62px;height:62px;transform:translate(-50%,-50%);border-radius:999px;background:rgba(3,7,18,.70);color:#c084fc;box-shadow:0 12px 28px rgba(0,0,0,.32)}.sonara-violet-play svg{width:24px;height:24px;fill:currentColor;margin-left:3px}.sonara-violet-card-copy{padding:16px 18px 18px}.sonara-violet-card-copy strong{font-size:14px}.sonara-violet-card-copy>div{display:flex;gap:6px;margin-top:8px}.sonara-violet-card-copy>div span{border:1px solid rgba(139,92,246,.25);border-radius:999px;background:rgba(88,28,135,.20);padding:4px 8px;color:#d8b4fe;font-size:8px}.sonara-violet-card-right .sonara-violet-card-copy>div span{border-color:rgba(59,130,246,.26);background:rgba(30,64,175,.18);color:#bfdbfe}.sonara-violet-card-copy small{display:block;margin-top:12px;color:#64748b;font-size:9px}
        .sonara-violet-controls{grid-column:1/-1;display:grid;grid-template-columns:1.1fr 1.1fr 1fr 1.1fr .9fr;gap:14px;margin-top:20px;border:1px solid rgba(139,92,246,.20);border-radius:20px;background:rgba(8,10,32,.76);padding:20px;box-shadow:0 20px 60px rgba(2,6,23,.32)}.sonara-violet-controls label{color:#94a3b8;font-size:9px;font-weight:850;letter-spacing:.08em}.sonara-violet-controls select,.sonara-violet-controls input[type="number"]{display:block;width:100%;height:47px;margin-top:8px;border:1px solid rgba(139,92,246,.18);border-radius:12px;background:#0b1028;color:#f8fafc;padding:0 13px;outline:0;font-size:12px;font-weight:720}.sonara-violet-controls select:focus,.sonara-violet-controls input[type="number"]:focus{border-color:rgba(192,132,252,.58)}.sonara-violet-bpm-row{display:grid;grid-template-columns:minmax(70px,1fr) auto;gap:8px;align-items:center}.sonara-violet-bpm-row>span{display:flex;margin-top:8px;border:1px solid rgba(139,92,246,.18);border-radius:11px;overflow:hidden;background:#0b1028}.sonara-violet-bpm-row button{height:45px;border:0;background:transparent;color:#64748b;padding:0 11px;font-size:9px;font-weight:900}.sonara-violet-bpm-row button[data-active="true"]{background:linear-gradient(180deg,rgba(126,34,206,.58),rgba(79,70,229,.42));color:#e9d5ff}
        .sonara-violet-player{position:fixed;z-index:40;left:0;right:0;bottom:0;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:18px;min-height:82px;border-top:1px solid rgba(139,92,246,.18);background:rgba(2,6,23,.91);backdrop-filter:blur(24px);padding:10px 28px}.sonara-violet-player-brand{display:flex;align-items:center;gap:11px;min-width:0}.sonara-violet-player-brand>span{display:grid;place-items:center;width:42px;height:42px;border:1px solid rgba(192,132,252,.33);border-radius:999px;background:rgba(88,28,135,.20);color:#c084fc}.sonara-violet-player-brand svg{width:18px;height:18px}.sonara-violet-player-brand strong,.sonara-violet-player-brand small{display:block}.sonara-violet-player-brand strong{font-size:11px}.sonara-violet-player-brand small{margin-top:2px;color:#64748b;font-size:9px}.sonara-violet-player-center{display:flex;align-items:center;gap:14px}.sonara-violet-player-center button{border:0;background:transparent;color:#cbd5e1;font-size:22px}.sonara-violet-player-center button:disabled{opacity:.35}.sonara-violet-player-play{display:grid!important;place-items:center!important;width:48px;height:48px!important;border-radius:999px!important;background:linear-gradient(135deg,#d946ef,#8b5cf6 55%,#3b82f6)!important;color:white!important;box-shadow:0 0 30px rgba(139,92,246,.30)}.sonara-violet-player-play svg{width:19px;height:19px;fill:currentColor}.sonara-violet-player-tools{display:flex;align-items:center;justify-content:flex-end;gap:11px;color:#94a3b8}.sonara-violet-tracks{display:flex;align-items:center;gap:4px;font-size:10px}.sonara-violet-tracks i{width:8px;height:8px;border-radius:999px;background:#a855f7}.sonara-violet-tracks i:nth-child(2){margin-left:-7px;background:#3b82f6}.sonara-violet-player-tools button{display:grid;place-items:center;width:34px;height:34px;border:0;border-radius:10px;background:transparent;color:#cbd5e1;font-size:20px}.sonara-violet-player-tools button:hover:not(:disabled){background:rgba(139,92,246,.12);color:white}.sonara-violet-player-tools button:disabled{opacity:.32}.sonara-violet-player-tools button.liked{color:#e879f9}.sonara-violet-player-tools button svg,.sonara-violet-player-tools>svg{width:16px;height:16px}.sonara-violet-player-tools input[type="range"]{width:130px;accent-color:#a855f7}
        @media(max-width:1280px){.sonara-violet-nav-links button:nth-child(5),.sonara-violet-nav-links button:nth-child(6){display:none}.sonara-violet-main{grid-template-columns:190px minmax(520px,1fr) 190px;gap:16px}.sonara-violet-card{opacity:.68}.sonara-violet-art{height:280px}.sonara-violet-quick-actions{grid-template-columns:repeat(3,minmax(0,1fr))}.sonara-violet-controls{grid-template-columns:repeat(3,minmax(0,1fr))}}
        @media(max-width:920px){.sonara-violet-nav{grid-template-columns:auto 1fr;min-height:70px;padding:0 16px}.sonara-violet-nav-links{display:none}.sonara-violet-account{justify-self:end}.sonara-violet-credit,.sonara-violet-settings{display:none}.sonara-violet-main{display:block;padding:44px 16px 28px}.sonara-violet-card{display:none}.sonara-violet-hero h1{font-size:clamp(42px,11vw,68px)}.sonara-violet-hero>p br{display:none}.sonara-violet-quick-actions{grid-template-columns:repeat(2,minmax(0,1fr))}.sonara-violet-controls{grid-template-columns:repeat(2,minmax(0,1fr));margin-top:24px}.sonara-violet-player{grid-template-columns:1fr auto;padding:10px 16px}.sonara-violet-player-center{display:none}.sonara-violet-player-tools .sonara-violet-tracks,.sonara-violet-player-tools button:nth-of-type(3),.sonara-violet-player-tools>svg,.sonara-violet-player-tools input{display:none}}
        @media(max-width:560px){.sonara-violet-upgrade{display:none}.sonara-violet-main{padding-top:34px}.sonara-violet-badge{font-size:8px}.sonara-violet-hero h1{font-size:44px}.sonara-violet-hero>p{font-size:13px}.sonara-violet-composer{padding:13px;border-radius:21px}.sonara-violet-composer textarea{min-height:86px;font-size:16px}.sonara-violet-upload{display:none}.sonara-violet-advanced{padding:0 11px;font-size:0}.sonara-violet-advanced svg{width:18px;height:18px}.sonara-violet-create{padding:0 17px}.sonara-violet-quick-actions{grid-template-columns:1fr}.sonara-violet-controls{grid-template-columns:1fr}.sonara-violet-player-brand small{display:none}}
      `}</style>
    </div>
  );
}
