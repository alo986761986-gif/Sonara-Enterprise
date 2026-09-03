import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  FolderSearch,
  Loader2,
  Mic2,
  Music2,
  RefreshCw,
  Search,
  Square,
  Upload,
  X
} from 'lucide-react';
import {
  GENERATED_ASSET_EVENT,
  listGeneratedProjects,
  type StoredGeneratedAsset
} from '../../services/generatedAssetVault';

type AudioHubTab = 'library' | 'upload' | 'voice';
type AudioReferenceKind = 'library' | 'upload' | 'voice';
type AudioReferenceMode = 'reference' | 'voice';

type CreatorAudioReference = {
  id: string;
  name: string;
  kind: AudioReferenceKind;
  mode: AudioReferenceMode;
  mimeType?: string;
  url?: string;
  file?: File;
  blob?: Blob;
  previewUrl?: string;
  projectTitle?: string;
  detail?: string;
};

type LibraryAudioTrack = {
  id: string;
  projectId: string;
  projectTitle: string;
  genre: string;
  subgenre: string;
  updatedAt: string;
  asset: StoredGeneratedAsset;
  previewUrl?: string;
};

type LocalAudioCandidate = {
  id: string;
  file: File;
  previewUrl: string;
};

const ACTIVE_AUDIO_KEY = 'sonara.creator.activeAudioReference.v1';
const STUDIO_JOB_KEY = 'sonara.creator.referenceStudioJobs.v1';
const MAX_REFERENCE_BYTES = 160 * 1024 * 1024;
const AUDIO_EXTENSION_RE = /\.(wav|wave|mp3|flac|ogg|oga|m4a|aac|opus|aiff|aif|alac|webm|weba)$/i;
const GENERATE_PATHS = new Set(['/api/billing/generate', '/api/engine/generate']);

function readPersistedReference(): CreatorAudioReference | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(ACTIVE_AUDIO_KEY) || 'null');
    if (!value?.url || !value?.name) return null;
    return {
      id: String(value.id || `saved-${Date.now()}`),
      name: String(value.name),
      kind: value.kind === 'voice' ? 'voice' : 'library',
      mode: value.mode === 'voice' ? 'voice' : 'reference',
      mimeType: String(value.mimeType || 'audio/wav'),
      url: String(value.url),
      previewUrl: String(value.url),
      projectTitle: value.projectTitle ? String(value.projectTitle) : undefined,
      detail: value.detail ? String(value.detail) : undefined
    };
  } catch {
    return null;
  }
}

function persistReference(reference: CreatorAudioReference | null) {
  if (typeof window === 'undefined') return;
  try {
    if (!reference?.url) {
      window.localStorage.removeItem(ACTIVE_AUDIO_KEY);
      return;
    }
    window.localStorage.setItem(ACTIVE_AUDIO_KEY, JSON.stringify({
      id: reference.id,
      name: reference.name,
      kind: reference.kind,
      mode: reference.mode,
      mimeType: reference.mimeType,
      url: reference.url,
      projectTitle: reference.projectTitle,
      detail: reference.detail
    }));
  } catch {
    // Persistence is optional; the current browser session remains fully usable.
  }
}

function readStudioJobs(): Set<string> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STUDIO_JOB_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function persistStudioJobs(jobs: Set<string>) {
  try {
    window.localStorage.setItem(STUDIO_JOB_KEY, JSON.stringify([...jobs].slice(-40)));
  } catch {
    // Poll recovery is best effort.
  }
}

function appendFormValue(form: FormData, key: string, value: unknown) {
  if (value === undefined || value === null || value === '') return;
  form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
}

function requestUrl(input: RequestInfo | URL): URL | null {
  try {
    const raw = input instanceof Request ? input.url : String(input);
    return new URL(raw, window.location.href);
  } catch {
    return null;
  }
}

function outputAudioUrl(data: any): string {
  const sources = [
    data?.audioUrl,
    data?.audio_url,
    data?.url,
    ...(Array.isArray(data?.outputs) ? data.outputs : []),
    ...(Array.isArray(data?.candidates) ? data.candidates : [])
  ];
  for (const value of sources) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value && typeof value === 'object') {
      const found = value.audioUrl || value.audio_url || value.url || value.downloadUrl || value.download_url;
      if (typeof found === 'string' && found.trim()) return found.trim();
    }
  }
  return '';
}

function audioFormatFrom(value: string): string {
  const match = value.split(/[?#]/)[0].match(/\.([a-zA-Z0-9]{2,5})$/);
  return match?.[1]?.toLowerCase() || 'wav';
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Audio';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(mb >= 10 ? 0 : 1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function chooseRecordingMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/webm',
    'audio/mp4'
  ];
  return candidates.find(type => MediaRecorder.isTypeSupported(type)) || '';
}

export default function SonaraCreatorAudioHub() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<AudioHubTab>('library');
  const [query, setQuery] = useState('');
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [libraryTracks, setLibraryTracks] = useState<LibraryAudioTrack[]>([]);
  const [uploads, setUploads] = useState<LocalAudioCandidate[]>([]);
  const [activeReference, setActiveReference] = useState<CreatorAudioReference | null>(readPersistedReference);
  const [error, setError] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceCandidate, setVoiceCandidate] = useState<LocalAudioCandidate | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeReferenceRef = useRef<CreatorAudioReference | null>(activeReference);
  const studioJobsRef = useRef<Set<string>>(readStudioJobs());
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const activeObjectUrlRef = useRef<string>('');
  const libraryObjectUrlsRef = useRef<string[]>([]);
  const localObjectUrlsRef = useRef<string[]>([]);

  const refreshAudioButton = (reference = activeReferenceRef.current) => {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.sonara-creator-actions button'));
    const button = buttons.find(item => item.textContent?.trim().toLowerCase() === 'audio');
    if (!button) return;
    if (reference) {
      button.dataset.sonaraAudioAttached = 'true';
      button.title = `Audio collegato: ${reference.name}`;
    } else {
      delete button.dataset.sonaraAudioAttached;
      button.title = 'Audio';
    }
  };

  const activateReference = (reference: CreatorAudioReference) => {
    if (activeObjectUrlRef.current) {
      URL.revokeObjectURL(activeObjectUrlRef.current);
      activeObjectUrlRef.current = '';
    }
    let previewUrl = reference.previewUrl || reference.url;
    const sourceBlob = reference.file || reference.blob;
    if (sourceBlob && !reference.previewUrl) {
      previewUrl = URL.createObjectURL(sourceBlob);
      activeObjectUrlRef.current = previewUrl;
    }
    const next = { ...reference, previewUrl };
    activeReferenceRef.current = next;
    setActiveReference(next);
    persistReference(next);
    refreshAudioButton(next);
    setBridgeStatus(reference.mode === 'voice'
      ? 'Voce pronta: il prossimo Create userà Voice Identity.'
      : 'Audio pronto: il prossimo Create userà questo brano come riferimento.');
    window.dispatchEvent(new CustomEvent('sonara:creator-audio-selected', {
      detail: { id: next.id, name: next.name, kind: next.kind, mode: next.mode, url: next.url || '' }
    }));
  };

  const clearReference = () => {
    if (activeObjectUrlRef.current) {
      URL.revokeObjectURL(activeObjectUrlRef.current);
      activeObjectUrlRef.current = '';
    }
    activeReferenceRef.current = null;
    setActiveReference(null);
    persistReference(null);
    refreshAudioButton(null);
    setBridgeStatus('Audio scollegato dal prompt.');
    window.dispatchEvent(new CustomEvent('sonara:creator-audio-selected', { detail: null }));
  };

  const loadLibrary = async () => {
    setLoadingLibrary(true);
    setError('');
    try {
      libraryObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      libraryObjectUrlsRef.current = [];
      const projects = await listGeneratedProjects();
      const tracks: LibraryAudioTrack[] = [];
      for (const project of projects) {
        for (const asset of project.assets) {
          if (asset.kind !== 'audio') continue;
          let previewUrl = asset.remoteUrl;
          if (!previewUrl && asset.blob) {
            previewUrl = URL.createObjectURL(asset.blob);
            libraryObjectUrlsRef.current.push(previewUrl);
          }
          tracks.push({
            id: `${project.id}:${asset.id}`,
            projectId: project.id,
            projectTitle: project.title || 'SONARA Track',
            genre: project.genre || 'Music',
            subgenre: project.subgenre || project.genre || 'Music',
            updatedAt: project.updatedAt,
            asset,
            previewUrl
          });
        }
      }
      setLibraryTracks(tracks);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoadingLibrary(false);
    }
  };

  useEffect(() => {
    activeReferenceRef.current = activeReference;
    refreshAudioButton(activeReference);
  }, [activeReference]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('button') as HTMLButtonElement | null : null;
      if (!target?.closest('.sonara-creator-actions')) return;
      if (target.textContent?.trim().toLowerCase() !== 'audio') return;
      setError('');
      setOpen(true);
      setTab(activeReferenceRef.current?.kind === 'voice' ? 'voice' : 'library');
    };
    const onOpen = () => setOpen(true);
    document.addEventListener('click', onClick, true);
    window.addEventListener('sonara:open-creator-audio', onOpen);
    const observer = new MutationObserver(() => refreshAudioButton());
    observer.observe(document.body, { childList: true, subtree: true });
    refreshAudioButton();
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('sonara:open-creator-audio', onOpen);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadLibrary();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const onVault = () => void loadLibrary();
    window.addEventListener('keydown', onKey);
    window.addEventListener(GENERATED_ASSET_EVENT, onVault);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(GENERATED_ASSET_EVENT, onVault);
    };
  }, [open]);

  useEffect(() => {
    const upstream = window.fetch.bind(window);

    const patchedFetch: typeof window.fetch = async (input, init) => {
      const url = requestUrl(input);
      const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const reference = activeReferenceRef.current;

      if (url && method === 'POST' && GENERATE_PATHS.has(url.pathname) && reference && (reference.file || reference.blob || reference.url)) {
        let body: Record<string, unknown> | null = null;
        try {
          if (typeof init?.body === 'string') body = JSON.parse(init.body);
          else if (input instanceof Request) body = await input.clone().json();
        } catch {
          body = null;
        }

        if (body && typeof body === 'object') {
          const form = new FormData();
          for (const [key, value] of Object.entries(body)) appendFormValue(form, key, value);
          form.set('influence', reference.mode === 'voice' ? '0.82' : '0.55');
          form.set('referenceInfluence', reference.mode === 'voice' ? '0.82' : '0.55');
          form.set('sonaraReferenceName', reference.name);
          form.set('sonaraReferenceKind', reference.kind);

          const localAudio = reference.file || reference.blob;
          if (localAudio) {
            const fallbackName = reference.mode === 'voice' ? 'sonara-voice-reference.webm' : 'sonara-audio-reference.wav';
            form.set('reference_audio', localAudio, reference.file?.name || fallbackName);
          } else if (reference.url) {
            form.set('referenceAudioUrl', reference.url);
          }

          const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
          headers.delete('content-type');
          headers.delete('content-length');
          const targetPath = reference.mode === 'voice' ? '/api/studio/voice' : '/api/studio/reference';
          const response = await upstream(new URL(targetPath, window.location.origin).toString(), {
            method: 'POST',
            headers,
            body: form,
            credentials: 'include',
            cache: 'no-store'
          });
          try {
            const payload = await response.clone().json();
            const jobId = String(payload?.jobId || '');
            if (response.ok && jobId) {
              studioJobsRef.current.add(jobId);
              persistStudioJobs(studioJobsRef.current);
              setBridgeStatus(reference.mode === 'voice'
                ? 'Generazione con la tua voce avviata.'
                : 'Generazione con audio di riferimento avviata.');
            }
          } catch {
            // The original response is returned so the normal SONARA error handling remains authoritative.
          }
          return response;
        }
      }

      if (url && method === 'GET') {
        const match = url.pathname.match(/^\/api\/music\/job\/([^/]+)$/);
        const jobId = match ? decodeURIComponent(match[1]) : '';
        if (jobId && studioJobsRef.current.has(jobId)) {
          const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
          const response = await upstream(new URL(`/api/studio/job/${encodeURIComponent(jobId)}`, window.location.origin).toString(), {
            method: 'GET',
            headers,
            credentials: 'include',
            cache: 'no-store'
          });
          if (!response.ok) return response;
          try {
            const data = await response.clone().json();
            const audioUrl = outputAudioUrl(data);
            const status = String(data?.status || 'PROCESSING').toUpperCase();
            const normalized = {
              ...data,
              status,
              progress: Number(data?.progress ?? (status === 'COMPLETED' ? 100 : 0)),
              audioUrl: audioUrl || data?.audioUrl || null,
              metadata: {
                ...(data?.metadata || {}),
                audioUrl: audioUrl || data?.metadata?.audioUrl || null,
                audioFormat: audioUrl ? audioFormatFrom(audioUrl) : (data?.metadata?.audioFormat || 'wav'),
                currentStage: status === 'COMPLETED'
                  ? 'SONARA audio reference complete'
                  : `SONARA ${String(data?.operation || 'audio reference')}`
              }
            };
            if (status === 'COMPLETED' || status === 'FAILED') {
              studioJobsRef.current.delete(jobId);
              persistStudioJobs(studioJobsRef.current);
            }
            const responseHeaders = new Headers(response.headers);
            responseHeaders.set('content-type', 'application/json; charset=UTF-8');
            return new Response(JSON.stringify(normalized), {
              status: response.status,
              statusText: response.statusText,
              headers: responseHeaders
            });
          } catch {
            return response;
          }
        }
      }

      return upstream(input, init);
    };

    window.fetch = patchedFetch;
    return () => {
      if (window.fetch === patchedFetch) window.fetch = upstream;
    };
  }, []);

  useEffect(() => () => {
    if (recordingTimerRef.current != null) window.clearInterval(recordingTimerRef.current);
    mediaRecorderRef.current = null;
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    libraryObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    localObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    if (activeObjectUrlRef.current) URL.revokeObjectURL(activeObjectUrlRef.current);
  }, []);

  const filteredLibrary = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return libraryTracks;
    return libraryTracks.filter(track => [
      track.projectTitle,
      track.asset.name,
      track.asset.label,
      track.genre,
      track.subgenre
    ].some(value => String(value || '').toLowerCase().includes(needle)));
  }, [libraryTracks, query]);

  const selectLibraryTrack = (track: LibraryAudioTrack) => {
    const asset = track.asset;
    const file = asset.blob
      ? new File([asset.blob], asset.name || 'sonara-reference.wav', { type: asset.mimeType || asset.blob.type || 'audio/wav' })
      : undefined;
    activateReference({
      id: track.id,
      name: track.projectTitle || asset.name,
      kind: 'library',
      mode: 'reference',
      mimeType: asset.mimeType || file?.type || 'audio/wav',
      file,
      blob: asset.blob,
      url: asset.remoteUrl,
      previewUrl: file ? undefined : track.previewUrl,
      projectTitle: track.projectTitle,
      detail: `${track.genre} · ${track.subgenre}`
    });
  };

  const importFiles = (files: FileList | null) => {
    if (!files?.length) return;
    setError('');
    const additions: LocalAudioCandidate[] = [];
    for (const file of Array.from(files)) {
      const isAudio = file.type.startsWith('audio/') || AUDIO_EXTENSION_RE.test(file.name);
      if (!isAudio) {
        setError(`${file.name}: formato audio non riconosciuto.`);
        continue;
      }
      if (file.size > MAX_REFERENCE_BYTES) {
        setError(`${file.name}: massimo 160 MB per un audio di riferimento.`);
        continue;
      }
      const previewUrl = URL.createObjectURL(file);
      localObjectUrlsRef.current.push(previewUrl);
      additions.push({ id: `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`, file, previewUrl });
    }
    if (!additions.length) return;
    setUploads(current => [...additions, ...current].slice(0, 10));
    const first = additions[0];
    activateReference({
      id: first.id,
      name: first.file.name,
      kind: 'upload',
      mode: 'reference',
      mimeType: first.file.type || 'audio/wav',
      file: first.file,
      previewUrl: first.previewUrl,
      detail: formatBytes(first.file.size)
    });
  };

  const useUpload = (candidate: LocalAudioCandidate) => {
    activateReference({
      id: candidate.id,
      name: candidate.file.name,
      kind: 'upload',
      mode: 'reference',
      mimeType: candidate.file.type || 'audio/wav',
      file: candidate.file,
      previewUrl: candidate.previewUrl,
      detail: formatBytes(candidate.file.size)
    });
  };

  const stopMediaTracks = () => {
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    mediaStreamRef.current = null;
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
  };

  const startRecording = async () => {
    setError('');
    setBridgeStatus('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Questo browser non supporta la registrazione microfono richiesta da SONARA.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false
        }
      });
      const mimeType = chooseRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];
      setRecordingSeconds(0);

      recorder.ondataavailable = event => {
        if (event.data?.size) recordingChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setError('Registrazione interrotta dal browser. Controlla il permesso del microfono.');
        setRecording(false);
        stopMediaTracks();
      };
      recorder.onstop = () => {
        if (recordingTimerRef.current != null) {
          window.clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        setRecording(false);
        stopMediaTracks();
        const chunks = recordingChunksRef.current;
        recordingChunksRef.current = [];
        if (!chunks.length) return;
        const type = recorder.mimeType || chunks[0]?.type || 'audio/webm';
        const blob = new Blob(chunks, { type });
        if (!blob.size) return;
        const extension = /ogg/i.test(type) ? 'ogg' : /mp4/i.test(type) ? 'm4a' : 'webm';
        const file = new File([blob], `sonara-voice-${Date.now()}.${extension}`, { type });
        const previewUrl = URL.createObjectURL(file);
        localObjectUrlsRef.current.push(previewUrl);
        const candidate = { id: `voice-${Date.now()}`, file, previewUrl };
        setVoiceCandidate(candidate);
        activateReference({
          id: candidate.id,
          name: 'La mia voce',
          kind: 'voice',
          mode: 'voice',
          mimeType: type,
          file,
          previewUrl,
          detail: `${Math.max(1, recordingSeconds)}s registrati`
        });
      };

      recorder.start(250);
      setRecording(true);
      recordingTimerRef.current = window.setInterval(() => setRecordingSeconds(value => value + 1), 1000);
    } catch (cause) {
      stopMediaTracks();
      setRecording(false);
      setError(cause instanceof Error && cause.name === 'NotAllowedError'
        ? 'Permesso microfono negato. Consenti il microfono a SONARA dal browser e riprova.'
        : cause instanceof Error ? cause.message : String(cause));
    }
  };

  const useVoiceCandidate = () => {
    if (!voiceCandidate) return;
    activateReference({
      id: voiceCandidate.id,
      name: 'La mia voce',
      kind: 'voice',
      mode: 'voice',
      mimeType: voiceCandidate.file.type || 'audio/webm',
      file: voiceCandidate.file,
      previewUrl: voiceCandidate.previewUrl,
      detail: 'Voice Identity'
    });
  };

  if (!open || typeof document === 'undefined') return null;

  const panel = (
    <div className="sonara-audio-hub-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="sonara-audio-hub" role="dialog" aria-modal="true" aria-label="SONARA Audio">
        <header className="sonara-audio-hub-head">
          <div className="sonara-audio-hub-title"><span><Music2 /></span><div><strong>Audio</strong><small>LIBRERIA · UPLOAD · VOCE</small></div></div>
          <button type="button" className="sonara-audio-hub-close" onClick={() => setOpen(false)} aria-label="Chiudi"><X /></button>
        </header>

        {activeReference && (
          <div className="sonara-audio-active">
            <div className="sonara-audio-active-icon"><Check /></div>
            <div className="sonara-audio-active-copy">
              <small>COLLEGATO AL PROMPT</small>
              <strong>{activeReference.name}</strong>
              <span>{activeReference.mode === 'voice' ? 'Voice Identity' : 'Audio reference'}{activeReference.detail ? ` · ${activeReference.detail}` : ''}</span>
            </div>
            {activeReference.previewUrl && <audio controls preload="metadata" src={activeReference.previewUrl} />}
            <button type="button" className="sonara-audio-remove" onClick={clearReference}>Rimuovi</button>
          </div>
        )}

        <div className="sonara-audio-tabs" role="tablist" aria-label="Sorgente audio">
          <button type="button" role="tab" aria-selected={tab === 'library'} onClick={() => setTab('library')}><FolderSearch />I miei brani</button>
          <button type="button" role="tab" aria-selected={tab === 'upload'} onClick={() => setTab('upload')}><Upload />Carica audio</button>
          <button type="button" role="tab" aria-selected={tab === 'voice'} onClick={() => setTab('voice')}><Mic2 />Registra voce</button>
        </div>

        <div className="sonara-audio-body">
          {tab === 'library' && (
            <div className="sonara-audio-library">
              <div className="sonara-audio-search-row">
                <label><Search /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cerca titolo, genere, sottogenere..." autoFocus /></label>
                <button type="button" onClick={() => void loadLibrary()} disabled={loadingLibrary} title="Aggiorna libreria">{loadingLibrary ? <Loader2 className="sonara-spin" /> : <RefreshCw />}</button>
              </div>
              {loadingLibrary && !libraryTracks.length ? (
                <div className="sonara-audio-empty"><Loader2 className="sonara-spin" /><strong>Carico i tuoi brani SONARA…</strong></div>
              ) : filteredLibrary.length ? (
                <div className="sonara-audio-track-list">
                  {filteredLibrary.map(track => (
                    <article key={track.id} className="sonara-audio-track">
                      <div className="sonara-audio-track-main">
                        <div className="sonara-audio-track-icon"><Music2 /></div>
                        <div><strong>{track.projectTitle}</strong><span>{track.genre} · {track.subgenre}</span><small>{track.asset.label || track.asset.name} · {formatBytes(track.asset.bytes)}</small></div>
                      </div>
                      {track.previewUrl && <audio controls preload="none" src={track.previewUrl} />}
                      <button type="button" data-selected={activeReference?.id === track.id} onClick={() => selectLibraryTrack(track)}>{activeReference?.id === track.id ? <><Check />In uso</> : 'Usa nel prompt'}</button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="sonara-audio-empty"><FolderSearch /><strong>{query ? 'Nessun brano trovato' : 'Nessun brano salvato ancora'}</strong><p>I brani generati e salvati da SONARA appariranno automaticamente qui.</p></div>
              )}
            </div>
          )}

          {tab === 'upload' && (
            <div className="sonara-audio-upload-pane">
              <input ref={fileInputRef} type="file" multiple accept="audio/*,.wav,.wave,.mp3,.flac,.ogg,.m4a,.aac,.opus,.aiff,.aif,.alac,.webm" className="sonara-audio-file-input" onChange={event => { importFiles(event.currentTarget.files); event.currentTarget.value = ''; }} />
              <button type="button" className="sonara-audio-drop" onClick={() => fileInputRef.current?.click()}>
                <span><Upload /></span><strong>Carica uno o più file audio</strong><p>WAV, MP3, FLAC, M4A, OGG, OPUS, AIFF, WEBM · massimo 160 MB per file</p><em>Scegli file</em>
              </button>
              {uploads.length > 0 && (
                <div className="sonara-audio-local-list">
                  {uploads.map(candidate => (
                    <article key={candidate.id}>
                      <div><strong>{candidate.file.name}</strong><span>{formatBytes(candidate.file.size)}</span></div>
                      <audio controls preload="metadata" src={candidate.previewUrl} />
                      <button type="button" data-selected={activeReference?.id === candidate.id} onClick={() => useUpload(candidate)}>{activeReference?.id === candidate.id ? <><Check />In uso</> : 'Usa nel prompt'}</button>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'voice' && (
            <div className="sonara-audio-voice-pane">
              <div className="sonara-audio-mic-orb" data-recording={recording}><Mic2 /></div>
              <strong>{recording ? 'Registrazione in corso' : voiceCandidate ? 'Registrazione pronta' : 'Registra la tua voce'}</strong>
              <p>{recording ? `${recordingSeconds}s · parla o canta normalmente nel microfono.` : 'SONARA userà la registrazione come Voice Identity per guidare timbro, registro, pronuncia ed espressività.'}</p>
              <button type="button" className="sonara-audio-record" data-recording={recording} onClick={() => recording ? stopRecording() : void startRecording()}>{recording ? <><Square />Stop registrazione</> : <><Mic2 />Inizia registrazione</>}</button>
              {voiceCandidate && !recording && (
                <div className="sonara-audio-voice-preview">
                  <audio controls preload="metadata" src={voiceCandidate.previewUrl} />
                  <button type="button" data-selected={activeReference?.id === voiceCandidate.id} onClick={useVoiceCandidate}>{activeReference?.id === voiceCandidate.id ? <><Check />Voce in uso</> : 'Usa questa voce'}</button>
                </div>
              )}
              <small className="sonara-audio-privacy">Il browser chiederà il permesso del microfono. La registrazione viene inviata al motore SONARA solo quando premi Create con la voce selezionata.</small>
            </div>
          )}
        </div>

        {(error || bridgeStatus) && <div className={`sonara-audio-status ${error ? 'is-error' : ''}`}>{error || bridgeStatus}</div>}
        <footer className="sonara-audio-footer"><span>{activeReference ? `Pronto · ${activeReference.name}` : 'Seleziona un audio da collegare al prompt'}</span><button type="button" onClick={() => setOpen(false)}>Fatto</button></footer>
      </section>
      <style>{`
        .sonara-creator-actions button[data-sonara-audio-attached="true"]{position:relative!important;border-color:rgba(52,211,153,.38)!important;color:#d1fae5!important}.sonara-creator-actions button[data-sonara-audio-attached="true"]:after{content:'';position:absolute;right:6px;top:6px;width:7px;height:7px;border-radius:999px;background:#34d399;box-shadow:0 0 12px rgba(52,211,153,.8)}
        .sonara-audio-hub-backdrop{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:24px;background:rgba(2,6,23,.72);backdrop-filter:blur(16px)}
        .sonara-audio-hub{width:min(940px,calc(100vw - 32px));max-height:min(820px,calc(100vh - 32px));overflow:hidden;border:1px solid rgba(139,92,246,.28);border-radius:26px;background:linear-gradient(180deg,#0b0b12,#080910 70%,#07080d);color:#f8fafc;box-shadow:0 40px 120px rgba(0,0,0,.65),0 0 70px rgba(124,58,237,.12);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .sonara-audio-hub *{box-sizing:border-box}.sonara-audio-hub button,.sonara-audio-hub input{font:inherit}.sonara-audio-hub-head{display:flex;align-items:center;justify-content:space-between;padding:20px 22px;border-bottom:1px solid rgba(255,255,255,.06);background:rgba(13,13,20,.94)}
        .sonara-audio-hub-title{display:flex;align-items:center;gap:12px}.sonara-audio-hub-title>span{display:grid;place-items:center;width:42px;height:42px;border:1px solid rgba(168,85,247,.28);border-radius:13px;background:linear-gradient(135deg,rgba(147,51,234,.25),rgba(37,99,235,.18));color:#c4b5fd}.sonara-audio-hub-title svg{width:20px}.sonara-audio-hub-title strong,.sonara-audio-hub-title small{display:block}.sonara-audio-hub-title strong{font-size:18px;letter-spacing:-.02em}.sonara-audio-hub-title small{margin-top:3px;color:#7c8aa0;font-size:9px;font-weight:900;letter-spacing:.14em}.sonara-audio-hub-close{display:grid;place-items:center;width:38px;height:38px;border:1px solid rgba(255,255,255,.08);border-radius:11px;background:#11131a;color:#94a3b8}.sonara-audio-hub-close svg{width:17px}
        .sonara-audio-active{display:grid;grid-template-columns:auto minmax(150px,1fr) minmax(180px,300px) auto;align-items:center;gap:12px;margin:16px 20px 0;padding:12px;border:1px solid rgba(52,211,153,.20);border-radius:16px;background:linear-gradient(90deg,rgba(6,78,59,.14),rgba(30,41,59,.28))}.sonara-audio-active-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:rgba(16,185,129,.14);color:#6ee7b7}.sonara-audio-active-icon svg{width:17px}.sonara-audio-active-copy{min-width:0}.sonara-audio-active-copy small,.sonara-audio-active-copy strong,.sonara-audio-active-copy span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sonara-audio-active-copy small{color:#6ee7b7;font-size:8px;font-weight:900;letter-spacing:.1em}.sonara-audio-active-copy strong{margin-top:2px;font-size:12px}.sonara-audio-active-copy span{margin-top:2px;color:#64748b;font-size:9px}.sonara-audio-active audio{width:100%;height:32px}.sonara-audio-remove{border:1px solid rgba(248,113,113,.20);border-radius:9px;background:rgba(127,29,29,.10);color:#fca5a5;padding:8px 10px;font-size:9px;font-weight:850}
        .sonara-audio-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:16px 20px 0}.sonara-audio-tabs button{display:flex;align-items:center;justify-content:center;gap:8px;min-height:45px;border:1px solid rgba(255,255,255,.07);border-radius:13px;background:#111219;color:#94a3b8;font-size:11px;font-weight:850}.sonara-audio-tabs button[aria-selected="true"]{border-color:rgba(168,85,247,.34);background:linear-gradient(135deg,rgba(126,34,206,.26),rgba(37,99,235,.14));color:#f5f3ff}.sonara-audio-tabs svg{width:16px}
        .sonara-audio-body{min-height:360px;max-height:500px;overflow:auto;padding:16px 20px 18px}.sonara-audio-search-row{display:grid;grid-template-columns:1fr auto;gap:8px}.sonara-audio-search-row label{display:flex;align-items:center;gap:9px;border:1px solid rgba(255,255,255,.07);border-radius:13px;background:#0f1118;padding:0 13px;color:#64748b}.sonara-audio-search-row label svg{width:16px}.sonara-audio-search-row input{width:100%;min-height:42px;border:0;outline:0;background:transparent;color:white;font-size:11px}.sonara-audio-search-row>button{display:grid;place-items:center;width:43px;border:1px solid rgba(255,255,255,.07);border-radius:13px;background:#11131a;color:#94a3b8}.sonara-audio-search-row>button svg{width:16px}
        .sonara-audio-track-list{display:grid;gap:8px;margin-top:12px}.sonara-audio-track{display:grid;grid-template-columns:minmax(220px,1fr) minmax(180px,260px) auto;align-items:center;gap:10px;border:1px solid rgba(255,255,255,.055);border-radius:14px;background:#0d0f15;padding:10px}.sonara-audio-track-main{display:flex;align-items:center;gap:10px;min-width:0}.sonara-audio-track-icon{display:grid;place-items:center;width:36px;height:36px;flex:0 0 auto;border-radius:10px;background:rgba(139,92,246,.12);color:#c4b5fd}.sonara-audio-track-icon svg{width:17px}.sonara-audio-track-main>div:last-child{min-width:0}.sonara-audio-track-main strong,.sonara-audio-track-main span,.sonara-audio-track-main small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sonara-audio-track-main strong{font-size:11px}.sonara-audio-track-main span{margin-top:2px;color:#8b9bb0;font-size:9px}.sonara-audio-track-main small{margin-top:2px;color:#59677b;font-size:8px}.sonara-audio-track audio{width:100%;height:30px}.sonara-audio-track>button,.sonara-audio-local-list article>button,.sonara-audio-voice-preview>button{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid rgba(139,92,246,.28);border-radius:9px;background:rgba(109,40,217,.12);color:#ddd6fe;padding:8px 10px;font-size:9px;font-weight:850;white-space:nowrap}.sonara-audio-track>button[data-selected="true"],.sonara-audio-local-list article>button[data-selected="true"],.sonara-audio-voice-preview>button[data-selected="true"]{border-color:rgba(52,211,153,.26);background:rgba(6,78,59,.18);color:#6ee7b7}.sonara-audio-track>button svg,.sonara-audio-local-list article>button svg,.sonara-audio-voice-preview>button svg{width:13px}
        .sonara-audio-empty{display:flex;min-height:270px;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#64748b}.sonara-audio-empty>svg{width:32px;height:32px;margin-bottom:12px;color:#7c3aed}.sonara-audio-empty strong{color:#cbd5e1;font-size:12px}.sonara-audio-empty p{max-width:360px;margin:6px 0 0;font-size:10px;line-height:1.5}.sonara-spin{animation:sonara-audio-spin .8s linear infinite}@keyframes sonara-audio-spin{to{transform:rotate(360deg)}}
        .sonara-audio-file-input{display:none}.sonara-audio-drop{display:flex;width:100%;min-height:220px;flex-direction:column;align-items:center;justify-content:center;border:1px dashed rgba(139,92,246,.36);border-radius:18px;background:radial-gradient(circle at 50% 0,rgba(109,40,217,.12),transparent 50%),#0d0f15;color:#cbd5e1}.sonara-audio-drop>span{display:grid;place-items:center;width:54px;height:54px;border:1px solid rgba(168,85,247,.24);border-radius:16px;background:rgba(126,34,206,.14);color:#c4b5fd}.sonara-audio-drop svg{width:23px}.sonara-audio-drop strong{margin-top:14px;font-size:13px}.sonara-audio-drop p{margin:5px 0 0;color:#64748b;font-size:9px}.sonara-audio-drop em{margin-top:15px;border-radius:9px;background:linear-gradient(90deg,#7c3aed,#2563eb);padding:8px 13px;color:white;font-size:9px;font-style:normal;font-weight:900}.sonara-audio-local-list{display:grid;gap:8px;margin-top:12px}.sonara-audio-local-list article{display:grid;grid-template-columns:minmax(180px,1fr) minmax(180px,280px) auto;align-items:center;gap:10px;border:1px solid rgba(255,255,255,.055);border-radius:13px;background:#0d0f15;padding:10px}.sonara-audio-local-list article>div{min-width:0}.sonara-audio-local-list strong,.sonara-audio-local-list span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sonara-audio-local-list strong{font-size:10px}.sonara-audio-local-list span{margin-top:2px;color:#64748b;font-size:8px}.sonara-audio-local-list audio{width:100%;height:30px}
        .sonara-audio-voice-pane{display:flex;min-height:340px;flex-direction:column;align-items:center;justify-content:center;text-align:center}.sonara-audio-mic-orb{display:grid;place-items:center;width:84px;height:84px;border:1px solid rgba(168,85,247,.28);border-radius:999px;background:radial-gradient(circle,rgba(126,34,206,.28),rgba(37,99,235,.08));color:#d8b4fe;box-shadow:0 0 50px rgba(126,34,206,.12)}.sonara-audio-mic-orb[data-recording="true"]{border-color:rgba(244,63,94,.5);background:radial-gradient(circle,rgba(190,24,93,.38),rgba(127,29,29,.12));color:#fda4af;animation:sonara-audio-pulse 1.2s ease-in-out infinite}@keyframes sonara-audio-pulse{50%{box-shadow:0 0 70px rgba(244,63,94,.3);transform:scale(1.04)}}.sonara-audio-mic-orb svg{width:33px;height:33px}.sonara-audio-voice-pane>strong{margin-top:16px;font-size:15px}.sonara-audio-voice-pane>p{max-width:520px;margin:6px 0 0;color:#7c8aa0;font-size:10px;line-height:1.6}.sonara-audio-record{display:inline-flex;align-items:center;gap:8px;margin-top:16px;border:0;border-radius:11px;background:linear-gradient(90deg,#7c3aed,#2563eb);color:white;padding:10px 16px;font-size:10px;font-weight:900}.sonara-audio-record[data-recording="true"]{background:linear-gradient(90deg,#be123c,#7f1d1d)}.sonara-audio-record svg{width:15px}.sonara-audio-voice-preview{display:flex;align-items:center;gap:10px;width:min(520px,100%);margin-top:14px;border:1px solid rgba(255,255,255,.06);border-radius:13px;background:#0d0f15;padding:10px}.sonara-audio-voice-preview audio{min-width:0;flex:1;height:32px}.sonara-audio-privacy{max-width:560px;margin-top:13px;color:#526075;font-size:8px;line-height:1.5}
        .sonara-audio-status{margin:0 20px 14px;border:1px solid rgba(52,211,153,.16);border-radius:10px;background:rgba(6,78,59,.10);padding:9px 11px;color:#86efac;font-size:9px}.sonara-audio-status.is-error{border-color:rgba(248,113,113,.18);background:rgba(127,29,29,.10);color:#fca5a5}.sonara-audio-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid rgba(255,255,255,.055);padding:14px 20px;background:#090a10}.sonara-audio-footer span{overflow:hidden;color:#64748b;font-size:9px;text-overflow:ellipsis;white-space:nowrap}.sonara-audio-footer>button{border:0;border-radius:10px;background:linear-gradient(90deg,#7c3aed,#2563eb);color:white;padding:9px 16px;font-size:10px;font-weight:900}
        @media(max-width:760px){.sonara-audio-hub-backdrop{padding:8px}.sonara-audio-hub{width:100%;max-height:calc(100vh - 16px);border-radius:18px}.sonara-audio-active{grid-template-columns:auto 1fr auto}.sonara-audio-active audio{grid-column:1/-1}.sonara-audio-tabs{grid-template-columns:1fr}.sonara-audio-body{max-height:55vh}.sonara-audio-track,.sonara-audio-local-list article{grid-template-columns:1fr}.sonara-audio-track audio,.sonara-audio-local-list audio{width:100%}.sonara-audio-track>button,.sonara-audio-local-list article>button{width:100%}}
      `}</style>
    </div>
  );

  return createPortal(panel, document.body);
}
