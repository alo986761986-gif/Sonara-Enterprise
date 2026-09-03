import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  FastForward,
  Heart,
  Library,
  ListMusic,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  Repeat2,
  Rewind,
  Share2,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX
} from 'lucide-react';

type RepeatMode = 'off' | 'all' | 'one';

const GLOBAL_VOLUME_EVENT = 'sonara:global-player-volume';
const GLOBAL_VOLUME_STORAGE = 'sonara.globalPlayerVolume';

function readStoredVolume() {
  if (typeof window === 'undefined') return 0.82;
  try {
    const stored = Number(window.localStorage.getItem(GLOBAL_VOLUME_STORAGE));
    return Number.isFinite(stored) ? Math.max(0, Math.min(1, stored)) : 0.82;
  } catch {
    return 0.82;
  }
}

type SonaraTrack = {
  variationId?: string;
  jobId?: string;
  audioUrl: string;
  audioFormat?: string;
  title?: string;
  coverUrl?: string;
};

function readStoredTrack(): SonaraTrack | null {
  try {
    const value = JSON.parse(window.localStorage.getItem('sonara.selectedGeneratedTrack') || 'null');
    return value?.audioUrl ? value as SonaraTrack : null;
  } catch {
    return null;
  }
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function safeFileName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9-_ ]+/g, '')
    .trim()
    .replace(/\s+/g, '-') || 'sonara-track';
}

function sameTrack(a: SonaraTrack, b: SonaraTrack) {
  return a.audioUrl === b.audioUrl;
}

function openLibrary() {
  const aside = document.querySelector('aside');
  const buttons = aside ? Array.from(aside.querySelectorAll(':scope > button')) as HTMLButtonElement[] : [];
  buttons[4]?.click();
}

export default function SonaraProfessionalFixedPlayer() {
  const initial = useMemo(() => readStoredTrack(), []);
  const [queue, setQueue] = useState<SonaraTrack[]>(initial ? [initial] : []);
  const [queueIndex, setQueueIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(readStoredVolume);
  const [lastVolume, setLastVolume] = useState(() => {
    const initial = readStoredVolume();
    return initial > 0.01 ? initial : 0.82;
  });
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [likedUrls, setLikedUrls] = useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const activeTrack = queue[queueIndex] || null;
  const isMuted = volume <= 0.001;
  const liked = Boolean(activeTrack?.audioUrl && likedUrls.has(activeTrack.audioUrl));
  const title = activeTrack?.title?.trim()
    || (activeTrack?.variationId ? `SONARA MASTER ${activeTrack.variationId}` : 'SONARA CREATOR');
  const subtitle = activeTrack ? 'Generated track · Professional player' : 'Select a generated track to start';

  useEffect(() => {
    const onSelected = (event: Event) => {
      const detail = (event as CustomEvent<SonaraTrack>).detail;
      if (!detail?.audioUrl) return;
      setQueue(current => {
        const existing = current.findIndex(track => sameTrack(track, detail));
        if (existing >= 0) {
          window.setTimeout(() => setQueueIndex(existing), 0);
          return current;
        }
        const next = [...current, detail].slice(-20);
        window.setTimeout(() => setQueueIndex(next.length - 1), 0);
        return next;
      });
    };

    window.addEventListener('sonara:generated-track-selected', onSelected);
    return () => window.removeEventListener('sonara:generated-track-selected', onSelected);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
    if (volume > 0.01) setLastVolume(volume);
    try { window.localStorage.setItem(GLOBAL_VOLUME_STORAGE, String(volume)); } catch {}
    window.dispatchEvent(new CustomEvent(GLOBAL_VOLUME_EVENT, {
      detail: { volume, source: 'universal-player' }
    }));
  }, [volume]);

  useEffect(() => {
    const onGlobalVolume = (event: Event) => {
      const detail = (event as CustomEvent<{ volume?: number; source?: string }>).detail;
      if (detail?.source === 'universal-player') return;
      const next = Number(detail?.volume);
      if (!Number.isFinite(next)) return;
      const clamped = Math.max(0, Math.min(1, next));
      setVolume(clamped);
      if (clamped > 0.01) setLastVolume(clamped);
    };
    window.addEventListener(GLOBAL_VOLUME_EVENT, onGlobalVolume);
    return () => window.removeEventListener(GLOBAL_VOLUME_EVENT, onGlobalVolume);
  }, []);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setPlaying(false);
    const audio = audioRef.current;
    if (!audio || !activeTrack?.audioUrl) return;
    audio.load();
  }, [activeTrack?.audioUrl]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (event.code === 'Space' && activeTrack) {
        event.preventDefault();
        void togglePlayback();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const togglePlayback = async () => {
    if (!activeTrack) {
      openLibrary();
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setPlaying(false);
      }
    } else {
      audio.pause();
    }
  };

  const pickNextIndex = (direction: -1 | 1) => {
    if (queue.length <= 1) return queueIndex;
    if (shuffle) {
      let next = queueIndex;
      while (next === queueIndex) next = Math.floor(Math.random() * queue.length);
      return next;
    }
    return (queueIndex + direction + queue.length) % queue.length;
  };

  const changeTrack = (direction: -1 | 1) => {
    if (!queue.length) return;
    setQueueIndex(pickNextIndex(direction));
  };

  const seekBy = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + seconds));
    setCurrentTime(audio.currentTime);
  };

  const onSeek = (value: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, value));
    setCurrentTime(audio.currentTime);
  };

  const toggleMute = () => {
    if (isMuted) {
      setVolume(lastVolume > 0.01 ? lastVolume : 0.82);
      return;
    }
    setLastVolume(volume);
    setVolume(0);
  };

  const cycleRepeat = () => {
    setRepeatMode(mode => mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off');
  };

  const handleEnded = async () => {
    if (repeatMode === 'one') {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        try { await audio.play(); } catch { setPlaying(false); }
      }
      return;
    }
    if (queue.length > 1 && (repeatMode === 'all' || queueIndex < queue.length - 1 || shuffle)) {
      setQueueIndex(pickNextIndex(1));
      window.setTimeout(() => void audioRef.current?.play(), 60);
      return;
    }
    setPlaying(false);
  };

  const toggleLike = () => {
    if (!activeTrack?.audioUrl) return;
    setLikedUrls(current => {
      const next = new Set(current);
      if (next.has(activeTrack.audioUrl)) next.delete(activeTrack.audioUrl);
      else next.add(activeTrack.audioUrl);
      return next;
    });
  };

  const downloadTrack = async () => {
    if (!activeTrack?.audioUrl) return;
    try {
      const response = await fetch(activeTrack.audioUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${safeFileName(title)}.${activeTrack.audioFormat || 'mp3'}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    } catch {
      window.open(activeTrack.audioUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const shareTrack = async () => {
    if (!activeTrack?.audioUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({ title, url: activeTrack.audioUrl });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(activeTrack.audioUrl);
      }
    } catch {
      // User can cancel sharing without producing an error state.
    }
  };

  return (
    <>
      {activeTrack?.audioUrl && (
        <audio
          ref={audioRef}
          src={activeTrack.audioUrl}
          preload="metadata"
          onLoadedMetadata={event => setDuration(event.currentTarget.duration || 0)}
          onDurationChange={event => setDuration(event.currentTarget.duration || 0)}
          onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime || 0)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => void handleEnded()}
          className="hidden"
        />
      )}

      {expanded && (
        <section className="sonara-pro-player-drawer" aria-label="SONARA player queue">
          <div className="sonara-pro-player-drawer-head">
            <div><ListMusic /><span><strong>PLAY QUEUE</strong><small>{queue.length} track{queue.length === 1 ? '' : 's'}</small></span></div>
            <button type="button" onClick={() => setExpanded(false)} aria-label="Close queue"><Minimize2 /></button>
          </div>
          <div className="sonara-pro-player-queue">
            {queue.length ? queue.map((track, index) => (
              <button
                type="button"
                key={`${track.audioUrl}-${index}`}
                data-active={index === queueIndex}
                onClick={() => setQueueIndex(index)}
              >
                <span className="sonara-pro-player-queue-index">{index === queueIndex && playing ? '▶' : String(index + 1).padStart(2, '0')}</span>
                <span><strong>{track.title || `SONARA MASTER ${track.variationId || index + 1}`}</strong><small>{track.audioFormat?.toUpperCase() || 'AUDIO'} · SONARA AI</small></span>
              </button>
            )) : (
              <button type="button" onClick={openLibrary}><Library /><span><strong>No tracks selected</strong><small>Open Library to choose a track</small></span></button>
            )}
          </div>
        </section>
      )}

      <footer className="sonara-pro-fixed-player" aria-label="SONARA professional fixed audio player">
        <div className="sonara-pro-player-track">
          <button type="button" className="sonara-pro-player-art" onClick={openLibrary} aria-label="Open SONARA Library">
            {activeTrack?.coverUrl ? <img src={activeTrack.coverUrl} alt="Copertina brano selezionato" className="h-full w-full object-cover" /> : <Music2 />}
            <i />
          </button>
          <div className="sonara-pro-player-title">
            <strong>{title}</strong>
            <small>{subtitle}</small>
          </div>
          <button type="button" className={liked ? 'sonara-pro-icon-button active' : 'sonara-pro-icon-button'} onClick={toggleLike} disabled={!activeTrack} aria-label="Favorite">
            <Heart fill={liked ? 'currentColor' : 'none'} />
          </button>
        </div>

        <div className="sonara-pro-player-transport">
          <div className="sonara-pro-player-transport-buttons">
            <button type="button" className={shuffle ? 'sonara-pro-icon-button active' : 'sonara-pro-icon-button'} onClick={() => setShuffle(value => !value)} aria-label="Shuffle"><Shuffle /></button>
            <button type="button" className="sonara-pro-icon-button" onClick={() => changeTrack(-1)} disabled={!queue.length} aria-label="Previous track"><SkipBack /></button>
            <button type="button" className="sonara-pro-icon-button sonara-pro-seek-button" onClick={() => seekBy(-10)} disabled={!activeTrack} aria-label="Back 10 seconds"><Rewind /><span>10</span></button>
            <button type="button" className="sonara-pro-play-button" onClick={() => void togglePlayback()} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause /> : <Play />}</button>
            <button type="button" className="sonara-pro-icon-button sonara-pro-seek-button" onClick={() => seekBy(10)} disabled={!activeTrack} aria-label="Forward 10 seconds"><FastForward /><span>10</span></button>
            <button type="button" className="sonara-pro-icon-button" onClick={() => changeTrack(1)} disabled={!queue.length} aria-label="Next track"><SkipForward /></button>
            <button type="button" className={repeatMode !== 'off' ? 'sonara-pro-icon-button active' : 'sonara-pro-icon-button'} onClick={cycleRepeat} aria-label={`Repeat ${repeatMode}`}><Repeat2 /><small>{repeatMode === 'one' ? '1' : ''}</small></button>
          </div>
          <div className="sonara-pro-progress-row">
            <span>{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={Math.max(duration, 0)}
              step={0.01}
              value={Math.min(currentTime, Math.max(duration, 0))}
              onChange={event => onSeek(Number(event.target.value))}
              disabled={!activeTrack || duration <= 0}
              aria-label="Track position"
            />
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="sonara-pro-player-actions">
          <button type="button" className="sonara-pro-icon-button" onClick={() => setExpanded(value => !value)} aria-label="Play queue"><ListMusic /></button>
          <button type="button" className="sonara-pro-icon-button" onClick={() => void downloadTrack()} disabled={!activeTrack} aria-label="Download"><Download /></button>
          <button type="button" className="sonara-pro-icon-button" onClick={() => void shareTrack()} disabled={!activeTrack} aria-label="Share"><Share2 /></button>
          <div className="sonara-pro-volume" data-sonara-universal-volume="true" title={`Volume ${Math.round(volume * 100)}%`}>
            <span className="sonara-pro-volume-label">VOLUME</span>
            <button type="button" className="sonara-pro-icon-button" onClick={toggleMute} aria-label={isMuted ? 'Riattiva volume' : `Silenzia volume ${Math.round(volume * 100)}%`}>{isMuted ? <VolumeX /> : <Volume2 />}<small>{Math.round(volume * 100)}</small></button>
            <input type="range" min={0} max={1} step={0.01} value={volume} onChange={event => setVolume(Number(event.target.value))} aria-label={`Volume universale ${Math.round(volume * 100)}%`} />
            <strong className="sonara-pro-volume-value">{Math.round(volume * 100)}%</strong>
          </div>
          <button type="button" className="sonara-pro-icon-button" onClick={() => setExpanded(value => !value)} aria-label={expanded ? 'Collapse player' : 'Expand player'}>{expanded ? <Minimize2 /> : <Maximize2 />}</button>
          <div className="sonara-pro-menu-wrap">
            <button type="button" className="sonara-pro-icon-button" onClick={() => setMenuOpen(value => !value)} aria-label="More player options"><MoreHorizontal /></button>
            {menuOpen && (
              <div className="sonara-pro-menu">
                <button type="button" onClick={openLibrary}><Library />Open Library</button>
                <button type="button" onClick={() => { setQueue(activeTrack ? [activeTrack] : []); setQueueIndex(0); setMenuOpen(false); }} disabled={!queue.length}><ListMusic />Clear queue</button>
                <button type="button" onClick={() => { setCurrentTime(0); if (audioRef.current) audioRef.current.currentTime = 0; setMenuOpen(false); }} disabled={!activeTrack}><Rewind />Restart track</button>
              </div>
            )}
          </div>
        </div>
      </footer>

      <style>{`
        .sonara-violet-player{display:none!important}
        .sonara-pro-fixed-player{position:fixed;z-index:12000;left:0;right:0;bottom:0;display:grid;grid-template-columns:minmax(240px,1fr) minmax(420px,1.55fr) minmax(280px,1fr);align-items:center;gap:24px;min-height:96px;padding:12px 24px;border-top:1px solid rgba(168,85,247,.30);background:linear-gradient(180deg,rgba(7,10,28,.95),rgba(2,6,23,.985));box-shadow:0 -18px 55px rgba(2,6,23,.55),0 -1px 24px rgba(124,58,237,.12);backdrop-filter:blur(30px);color:#f8fafc;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .sonara-pro-player-track{display:grid;grid-template-columns:54px minmax(0,1fr) 38px;align-items:center;gap:12px;min-width:0}.sonara-pro-player-art{position:relative;display:grid;place-items:center;width:54px;height:54px;overflow:hidden;border:1px solid rgba(192,132,252,.34);border-radius:14px;background:radial-gradient(circle at 70% 28%,rgba(96,165,250,.82),transparent 28%),linear-gradient(145deg,#7e22ce,#312e81 55%,#0f172a);color:white;box-shadow:0 10px 26px rgba(76,29,149,.28)}.sonara-pro-player-art svg{position:relative;z-index:2;width:22px;height:22px}.sonara-pro-player-art i{position:absolute;right:-8px;bottom:-8px;width:34px;height:34px;border:7px solid rgba(216,180,254,.26);border-radius:999px}.sonara-pro-player-title{min-width:0}.sonara-pro-player-title strong,.sonara-pro-player-title small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sonara-pro-player-title strong{font-size:12px;font-weight:900;letter-spacing:.015em}.sonara-pro-player-title small{margin-top:4px;color:#7c8aa5;font-size:10px}
        .sonara-pro-player-transport{display:grid;gap:6px;min-width:0}.sonara-pro-player-transport-buttons{display:flex;align-items:center;justify-content:center;gap:7px}.sonara-pro-icon-button{position:relative;display:grid;place-items:center;width:36px;height:36px;border:0;border-radius:10px;background:transparent;color:#94a3b8;transition:.16s}.sonara-pro-icon-button:hover:not(:disabled){background:rgba(139,92,246,.14);color:white}.sonara-pro-icon-button:disabled{opacity:.28}.sonara-pro-icon-button.active{color:#c084fc;background:rgba(126,34,206,.15)}.sonara-pro-icon-button svg{width:17px;height:17px}.sonara-pro-icon-button>small{position:absolute;right:3px;bottom:1px;color:currentColor;font-size:7px;font-weight:900}.sonara-pro-play-button{display:grid;place-items:center;width:48px;height:48px;border:0;border-radius:999px;background:linear-gradient(135deg,#e879f9 0%,#a855f7 44%,#3b82f6 100%);color:white;box-shadow:0 0 28px rgba(168,85,247,.28),0 8px 22px rgba(15,23,42,.38);transition:.16s}.sonara-pro-play-button:hover{transform:scale(1.035);filter:brightness(1.08)}.sonara-pro-play-button svg{width:20px;height:20px;fill:currentColor}.sonara-pro-seek-button span{position:absolute;bottom:1px;font-size:6px;font-weight:900}.sonara-pro-progress-row{display:grid;grid-template-columns:38px minmax(120px,1fr) 38px;align-items:center;gap:9px;color:#64748b;font-size:9px;font-variant-numeric:tabular-nums}.sonara-pro-progress-row span:last-child{text-align:right}.sonara-pro-progress-row input,.sonara-pro-volume input{width:100%;accent-color:#a855f7;cursor:pointer}.sonara-pro-progress-row input:disabled{opacity:.35;cursor:default}
        .sonara-pro-player-actions{display:flex;align-items:center;justify-content:flex-end;gap:4px;min-width:0}.sonara-pro-volume{display:grid;grid-template-columns:auto 36px minmax(72px,92px) 34px;align-items:center;gap:5px;padding:4px 7px;border:1px solid rgba(192,132,252,.30);border-radius:12px;background:rgba(126,34,206,.10);box-shadow:0 0 22px rgba(139,92,246,.08)}.sonara-pro-volume-label{color:#d8b4fe;font-size:8px;font-weight:900;letter-spacing:.12em}.sonara-pro-volume-value{color:#ddd6fe;font-size:8px;font-variant-numeric:tabular-nums;text-align:right}.sonara-pro-menu-wrap{position:relative}.sonara-pro-menu{position:absolute;right:0;bottom:46px;display:grid;min-width:180px;overflow:hidden;border:1px solid rgba(139,92,246,.25);border-radius:13px;background:#080b1d;box-shadow:0 18px 45px rgba(0,0,0,.45);padding:6px}.sonara-pro-menu button{display:flex;align-items:center;gap:9px;height:38px;border:0;border-radius:8px;background:transparent;color:#cbd5e1;padding:0 10px;text-align:left;font-size:10px;font-weight:750}.sonara-pro-menu button:hover:not(:disabled){background:rgba(139,92,246,.14);color:white}.sonara-pro-menu button:disabled{opacity:.32}.sonara-pro-menu svg{width:15px;height:15px}
        .sonara-pro-player-drawer{position:fixed;z-index:11990;left:50%;bottom:96px;width:min(760px,calc(100vw - 28px));transform:translateX(-50%);overflow:hidden;border:1px solid rgba(139,92,246,.28);border-bottom:0;border-radius:18px 18px 0 0;background:rgba(5,8,24,.98);box-shadow:0 -24px 60px rgba(2,6,23,.48);backdrop-filter:blur(26px);color:#f8fafc;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.sonara-pro-player-drawer-head{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(139,92,246,.16);padding:13px 15px}.sonara-pro-player-drawer-head>div{display:flex;align-items:center;gap:9px}.sonara-pro-player-drawer-head svg{width:17px;height:17px;color:#c084fc}.sonara-pro-player-drawer-head strong,.sonara-pro-player-drawer-head small{display:block}.sonara-pro-player-drawer-head strong{font-size:10px;letter-spacing:.08em}.sonara-pro-player-drawer-head small{margin-top:2px;color:#64748b;font-size:8px}.sonara-pro-player-drawer-head>button{display:grid;place-items:center;width:34px;height:34px;border:0;border-radius:9px;background:transparent;color:#94a3b8}.sonara-pro-player-queue{max-height:300px;overflow:auto;padding:7px}.sonara-pro-player-queue>button{display:grid;grid-template-columns:38px minmax(0,1fr);align-items:center;gap:8px;width:100%;border:0;border-radius:10px;background:transparent;color:#cbd5e1;padding:9px 10px;text-align:left}.sonara-pro-player-queue>button:hover,.sonara-pro-player-queue>button[data-active="true"]{background:rgba(109,40,217,.15);color:white}.sonara-pro-player-queue-index{color:#8b5cf6;font-size:9px;font-weight:900}.sonara-pro-player-queue strong,.sonara-pro-player-queue small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sonara-pro-player-queue strong{font-size:10px}.sonara-pro-player-queue small{margin-top:3px;color:#64748b;font-size:8px}
        @media(max-width:1100px){.sonara-pro-fixed-player{grid-template-columns:minmax(210px,.9fr) minmax(380px,1.5fr) auto;gap:14px;padding:10px 14px}.sonara-pro-player-actions>.sonara-pro-icon-button:nth-child(2),.sonara-pro-player-actions>.sonara-pro-icon-button:nth-child(3){display:none}.sonara-pro-volume{grid-template-columns:auto 34px 64px 30px}.sonara-pro-volume-label{font-size:7px}.sonara-pro-volume-value{font-size:7px}}
        @media(max-width:760px){.sonara-pro-fixed-player{grid-template-columns:minmax(0,1fr) auto;min-height:82px;padding:9px 10px}.sonara-pro-player-transport{display:none}.sonara-pro-player-track{grid-template-columns:46px minmax(0,1fr) 34px;gap:9px}.sonara-pro-player-art{width:46px;height:46px;border-radius:12px}.sonara-pro-player-actions>.sonara-pro-icon-button,.sonara-pro-menu-wrap{display:none}.sonara-pro-volume{display:grid;grid-template-columns:auto 32px 58px;gap:3px;padding:3px 5px}.sonara-pro-volume-label{display:block;font-size:7px}.sonara-pro-volume-value{display:none}.sonara-pro-volume .sonara-pro-icon-button{display:grid;width:32px;height:32px}.sonara-pro-volume input{display:block!important;width:58px!important;min-width:58px}.sonara-pro-player-actions::before{content:''}.sonara-pro-player-actions .sonara-pro-icon-button:first-child{display:grid}.sonara-pro-player-drawer{bottom:82px}.sonara-pro-player-title strong{font-size:11px}.sonara-pro-player-title small{font-size:9px}}
      `}</style>
    </>
  );
}
