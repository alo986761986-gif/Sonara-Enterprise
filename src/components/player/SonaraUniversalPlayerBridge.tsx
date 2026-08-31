import { useEffect, useRef } from 'react';
import {
  GENERATED_ASSET_EVENT,
  listGeneratedProjects,
  type GeneratedProjectArchive,
  type StoredGeneratedAsset
} from '../../services/generatedAssetVault';

type TrackSource = 'generated' | 'publication';
type RepeatMode = 'off' | 'all' | 'one';

type UniversalTrack = {
  id: string;
  audioUrl: string;
  audioFormat?: string;
  title: string;
  variationId?: string;
  jobId?: string;
  assetId?: string;
  source: TrackSource;
  blob?: Blob;
};

type PlayTrackDetail = Partial<UniversalTrack> & {
  audioUrl?: string;
  blob?: Blob;
  title?: string;
  toggle?: boolean;
};

const PLAY_TRACK_EVENT = 'sonara:global-player-play-track';
const PLAYER_STATE_EVENT = 'sonara:global-player-state';
const GENERATED_SELECTION_EVENT = 'sonara:generated-track-selected';
const BRIDGE_VERSION = 'sonara-global-player-v2';

const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

function absoluteUrl(value: string): string {
  if (!value) return '';
  try {
    return new URL(value, window.location.href).href;
  } catch {
    return value;
  }
}

function trackKey(track: Pick<UniversalTrack, 'id' | 'audioUrl'>): string {
  return absoluteUrl(track.audioUrl) || track.id;
}

function dedupeTracks(tracks: UniversalTrack[]): UniversalTrack[] {
  const seen = new Set<string>();
  const output: UniversalTrack[] = [];
  for (const track of tracks) {
    const key = trackKey(track);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(track);
  }
  return output;
}

function findFixedFooter(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.sonara-pro-fixed-player');
}

function findFixedAudio(): HTMLAudioElement | null {
  const footer = findFixedFooter();
  const parent = footer?.parentElement;
  if (!parent) return null;
  const directAudio = Array.from(parent.children).find(
    child => child instanceof HTMLAudioElement && child.dataset.sonaraCustomAudio !== 'true'
  );
  if (directAudio instanceof HTMLAudioElement) {
    directAudio.dataset.sonaraUniversalPlayerAudio = BRIDGE_VERSION;
    return directAudio;
  }
  return null;
}

function repeatMode(): RepeatMode {
  const label = findFixedFooter()?.querySelector<HTMLButtonElement>('button[aria-label^="Repeat "]')?.getAttribute('aria-label') || '';
  if (label.endsWith(' one')) return 'one';
  if (label.endsWith(' all')) return 'all';
  return 'off';
}

function shuffleEnabled(): boolean {
  return Boolean(findFixedFooter()?.querySelector<HTMLButtonElement>('button[aria-label="Shuffle"]')?.classList.contains('active'));
}

function candidateTrackFromAudio(audio: HTMLAudioElement): UniversalTrack | null {
  const audioUrl = audio.currentSrc || audio.src || audio.getAttribute('src') || '';
  if (!audioUrl) return null;

  let node: HTMLElement | null = audio.parentElement;
  let label = '';
  for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
    const button = node.querySelector<HTMLButtonElement>(
      'button[aria-label^="Riproduci brano "], button[aria-label^="Pausa brano "]'
    );
    if (button) {
      label = button.getAttribute('aria-label') || '';
      break;
    }
  }
  const variationMatch = label.match(/brano\s+([AB])/i);
  const variationId = variationMatch?.[1]?.toUpperCase();
  const id = `generated-${variationId || absoluteUrl(audioUrl)}`;
  return {
    id,
    audioUrl,
    audioFormat: audioUrl.split('?')[0].split('.').pop()?.toLowerCase() || 'audio',
    title: variationId ? `SONARA Master ${variationId}` : 'SONARA generated track',
    variationId,
    source: 'generated'
  };
}

function publicationTracks(projects: GeneratedProjectArchive[]): UniversalTrack[] {
  const output: UniversalTrack[] = [];
  for (const project of projects) {
    for (const asset of project.assets) {
      if (asset.kind !== 'audio' || (!asset.remoteUrl && !asset.blob)) continue;
      const variation = project.jobId.match(/-([AB])$/i)?.[1]?.toUpperCase();
      output.push({
        id: `publication-${asset.id}`,
        audioUrl: asset.remoteUrl || '',
        audioFormat: asset.format,
        title: `${project.title}${variation ? ` · Master ${variation}` : ''}`,
        variationId: variation,
        jobId: project.jobId,
        assetId: asset.id,
        source: 'publication',
        blob: asset.blob
      });
    }
  }
  return dedupeTracks(output);
}

function findPublicationTrack(
  projects: GeneratedProjectArchive[],
  assetId: string
): UniversalTrack | null {
  for (const project of projects) {
    const asset = project.assets.find(candidate => candidate.id === assetId);
    if (!asset || asset.kind !== 'audio') continue;
    return publicationTracks([{ ...project, assets: [asset] }])[0] || null;
  }
  return null;
}

function playerSelectionDetail(track: UniversalTrack, audioUrl: string) {
  return {
    variationId: track.variationId,
    jobId: track.jobId,
    audioUrl,
    audioFormat: track.audioFormat,
    title: track.title,
    source: track.source,
    assetId: track.assetId,
    selectedAt: new Date().toISOString()
  };
}

export default function SonaraUniversalPlayerBridge() {
  const tracksRef = useRef<UniversalTrack[]>([]);
  const projectsRef = useRef<GeneratedProjectArchive[]>([]);
  const activeTrackRef = useRef<UniversalTrack | null>(null);
  const objectUrlsRef = useRef<Map<string, string>>(new Map());
  const scanTimerRef = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.dataset.sonaraGlobalPlayer = BRIDGE_VERSION;

    const playableUrl = (track: UniversalTrack): string => {
      if (track.audioUrl) return track.audioUrl;
      if (!track.blob) return '';
      const existing = objectUrlsRef.current.get(track.id);
      if (existing) return existing;
      const created = URL.createObjectURL(track.blob);
      objectUrlsRef.current.set(track.id, created);
      return created;
    };

    const emitState = (playing: boolean) => {
      const track = activeTrackRef.current;
      window.dispatchEvent(new CustomEvent(PLAYER_STATE_EVENT, {
        detail: {
          playing,
          id: track?.id || '',
          audioUrl: track?.audioUrl || '',
          assetId: track?.assetId || '',
          source: track?.source || '',
          title: track?.title || ''
        }
      }));
    };

    const upsert = (incoming: UniversalTrack[], generatedFirst = false) => {
      if (!incoming.length) return;
      const current = tracksRef.current;
      tracksRef.current = dedupeTracks(generatedFirst ? [...incoming, ...current] : [...current, ...incoming]);
    };

    const resolveActiveFromAudio = () => {
      if (activeTrackRef.current) return activeTrackRef.current;
      const fixed = findFixedAudio();
      const currentUrl = absoluteUrl(fixed?.currentSrc || fixed?.src || '');
      const found = tracksRef.current.find(track => absoluteUrl(playableUrl(track)) === currentUrl) || null;
      if (found) activeTrackRef.current = found;
      return found;
    };

    const waitForFixedAudio = async (url: string) => {
      const expected = absoluteUrl(url);
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const audio = findFixedAudio();
        if (audio) {
          const actual = absoluteUrl(audio.currentSrc || audio.src || audio.getAttribute('src') || '');
          if (actual === expected) return audio;
        }
        await sleep(20);
      }
      return findFixedAudio();
    };

    const selectTrack = async (track: UniversalTrack, shouldPlay: boolean, toggleSame = false) => {
      const url = playableUrl(track);
      if (!url) return;
      const current = resolveActiveFromAudio();
      const same = Boolean(current && trackKey(current) === trackKey(track));
      const currentAudio = findFixedAudio();

      if (toggleSame && same && currentAudio) {
        if (currentAudio.paused) {
          try { await currentAudio.play(); } catch { emitState(false); }
        } else {
          currentAudio.pause();
        }
        return;
      }

      upsert([{ ...track, audioUrl: track.audioUrl || url }], track.source === 'generated');
      activeTrackRef.current = track;
      const detail = playerSelectionDetail(track, url);
      if (track.audioUrl && !track.audioUrl.startsWith('blob:')) {
        try { localStorage.setItem('sonara.selectedGeneratedTrack', JSON.stringify(detail)); } catch {}
      }
      window.dispatchEvent(new CustomEvent(GENERATED_SELECTION_EVENT, { detail }));

      if (!shouldPlay) {
        emitState(false);
        return;
      }

      const audio = await waitForFixedAudio(url);
      if (!audio) return;
      try {
        await audio.play();
      } catch {
        emitState(false);
      }
    };

    const pickIndex = (currentIndex: number, direction: -1 | 1) => {
      const queue = tracksRef.current;
      if (!queue.length) return -1;
      if (shuffleEnabled() && queue.length > 1) {
        let next = currentIndex;
        while (next === currentIndex) next = Math.floor(Math.random() * queue.length);
        return next;
      }
      if (currentIndex < 0) return direction > 0 ? 0 : queue.length - 1;
      return (currentIndex + direction + queue.length) % queue.length;
    };

    const navigate = async (direction: -1 | 1, shouldPlay: boolean) => {
      const queue = tracksRef.current;
      if (!queue.length) return;
      const current = resolveActiveFromAudio();
      const currentIndex = current ? queue.findIndex(track => trackKey(track) === trackKey(current)) : -1;
      const nextIndex = pickIndex(currentIndex, direction);
      if (nextIndex < 0) return;
      await selectTrack(queue[nextIndex], shouldPlay, false);
    };

    const scanGeneratedPlayers = () => {
      const generated = Array.from(document.querySelectorAll<HTMLAudioElement>('audio[data-sonara-custom-audio="true"]'))
        .map(candidateTrackFromAudio)
        .filter((track): track is UniversalTrack => Boolean(track));
      if (!generated.length) return;
      upsert(generated, true);
      if (!activeTrackRef.current && !findFixedAudio()?.src) {
        void selectTrack(generated[0], false, false);
      }
    };

    const scheduleGeneratedScan = () => {
      if (scanTimerRef.current != null) return;
      scanTimerRef.current = window.setTimeout(() => {
        scanTimerRef.current = null;
        scanGeneratedPlayers();
      }, 50);
    };

    const refreshPublication = async () => {
      try {
        const projects = await listGeneratedProjects();
        projectsRef.current = projects;
        const published = publicationTracks(projects);
        const generated = tracksRef.current.filter(track => track.source === 'generated');
        tracksRef.current = dedupeTracks([...generated, ...published]);
        if (!activeTrackRef.current && published.length) {
          await selectTrack(published[0], false, false);
        }
      } catch {
        // The fixed player still works for current generated tracks if the archive is unavailable.
      }
    };

    const onPlayTrack = (event: Event) => {
      const detail = (event as CustomEvent<PlayTrackDetail>).detail || {};
      let track: UniversalTrack | null = null;
      if (detail.assetId) {
        track = findPublicationTrack(projectsRef.current, detail.assetId);
      }
      if (!track && (detail.audioUrl || detail.blob)) {
        track = {
          id: detail.id || `${detail.source || 'generated'}-${detail.assetId || detail.audioUrl || Date.now()}`,
          audioUrl: detail.audioUrl || '',
          audioFormat: detail.audioFormat,
          title: detail.title || 'SONARA Track',
          variationId: detail.variationId,
          jobId: detail.jobId,
          assetId: detail.assetId,
          source: detail.source === 'publication' ? 'publication' : 'generated',
          blob: detail.blob
        };
      }
      if (!track) return;
      void selectTrack(track, true, detail.toggle !== false);
    };

    const onGeneratedSelection = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail;
      if (!detail?.audioUrl) return;
      const track: UniversalTrack = {
        id: `${detail.source || 'generated'}-${detail.assetId || detail.jobId || detail.variationId || detail.audioUrl}`,
        audioUrl: String(detail.audioUrl),
        audioFormat: detail.audioFormat,
        title: detail.title || (detail.variationId ? `SONARA Master ${detail.variationId}` : 'SONARA Track'),
        variationId: detail.variationId,
        jobId: detail.jobId,
        assetId: detail.assetId,
        source: detail.source === 'publication' ? 'publication' : 'generated'
      };
      upsert([track], track.source === 'generated');
      activeTrackRef.current = track;
    };

    const onAnyAudioPlay = (event: Event) => {
      const audio = event.target;
      if (!(audio instanceof HTMLAudioElement)) return;
      if (audio.dataset.sonaraUniversalPlayerAudio === BRIDGE_VERSION || audio === findFixedAudio()) {
        emitState(true);
        return;
      }
      if (audio.dataset.sonaraCustomAudio === 'true') {
        const track = candidateTrackFromAudio(audio);
        if (!track) return;
        audio.pause();
        upsert([track], true);
        void selectTrack(track, true, true);
      }
    };

    const onAnyAudioPause = (event: Event) => {
      const audio = event.target;
      if (!(audio instanceof HTMLAudioElement)) return;
      if (audio.dataset.sonaraUniversalPlayerAudio === BRIDGE_VERSION || audio === findFixedAudio()) emitState(false);
    };

    const onAnyAudioEnded = (event: Event) => {
      const audio = event.target;
      if (!(audio instanceof HTMLAudioElement) || audio !== findFixedAudio()) return;
      event.stopImmediatePropagation();
      event.stopPropagation();
      const mode = repeatMode();
      if (mode === 'one') {
        audio.currentTime = 0;
        void audio.play().catch(() => emitState(false));
        return;
      }
      const queue = tracksRef.current;
      const current = resolveActiveFromAudio();
      const currentIndex = current ? queue.findIndex(track => trackKey(track) === trackKey(current)) : -1;
      if (!queue.length || (mode === 'off' && !shuffleEnabled() && currentIndex === queue.length - 1)) {
        emitState(false);
        return;
      }
      void navigate(1, true);
    };

    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest<HTMLButtonElement>('button');
      if (!button) return;
      const footer = button.closest('.sonara-pro-fixed-player');
      if (!footer) return;
      const label = button.getAttribute('aria-label') || '';
      if (label !== 'Previous track' && label !== 'Next track') return;

      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      const fixed = findFixedAudio();
      const shouldPlay = fixed ? !fixed.paused : true;
      void navigate(label === 'Previous track' ? -1 : 1, shouldPlay);
    };

    const observer = new MutationObserver(scheduleGeneratedScan);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });

    window.addEventListener(PLAY_TRACK_EVENT, onPlayTrack);
    window.addEventListener(GENERATED_SELECTION_EVENT, onGeneratedSelection);
    window.addEventListener(GENERATED_ASSET_EVENT, refreshPublication);
    document.addEventListener('play', onAnyAudioPlay, true);
    document.addEventListener('pause', onAnyAudioPause, true);
    document.addEventListener('ended', onAnyAudioEnded, true);
    document.addEventListener('click', onDocumentClick, true);

    scanGeneratedPlayers();
    void refreshPublication();

    return () => {
      observer.disconnect();
      if (scanTimerRef.current != null) window.clearTimeout(scanTimerRef.current);
      window.removeEventListener(PLAY_TRACK_EVENT, onPlayTrack);
      window.removeEventListener(GENERATED_SELECTION_EVENT, onGeneratedSelection);
      window.removeEventListener(GENERATED_ASSET_EVENT, refreshPublication);
      document.removeEventListener('play', onAnyAudioPlay, true);
      document.removeEventListener('pause', onAnyAudioPause, true);
      document.removeEventListener('ended', onAnyAudioEnded, true);
      document.removeEventListener('click', onDocumentClick, true);
      for (const url of objectUrlsRef.current.values()) URL.revokeObjectURL(url);
      objectUrlsRef.current.clear();
      delete document.documentElement.dataset.sonaraGlobalPlayer;
    };
  }, []);

  return null;
}
