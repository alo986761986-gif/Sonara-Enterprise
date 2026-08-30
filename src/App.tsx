import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bot,
  Building2,
  Cloud,
  Cpu,
  CreditCard,
  Disc3,
  Download,
  Gauge,
  Globe2,
  Handshake,
  Languages,
  Library,
  Music,
  Minus,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Rocket,
  Settings2,
  ShieldCheck,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Store,
  UploadCloud,
  Users,
  X,
  Zap
} from 'lucide-react';
import { WORLD_MUSIC_GENRES, findGenre } from './data/worldMusicGenres';
import { buildGenerationPrompt, buildRandomCreativeBrief, type VocalMode } from './generationPrompt';
import { buildRandomLyrics } from './randomLyrics';
import { SONARA_PLANS } from './billing/plans';
import { getAtmospheresForSelection } from './musicStyleIntelligence';
import {
  LANGUAGE_METADATA,
  RTL_LANGUAGES,
  SUPPORTED_LANGUAGES,
  detectDeviceLanguage,
  type LanguageCode
} from './i18n/locales';
import { uiText } from './i18n/ui';
import { archiveGeneratedProject } from './services/generatedAssetVault';
import { getFirebaseIdToken, watchFirebaseUser } from './lib/firebaseClient';

const EmberWorkspace = React.lazy(() => import('./components/ember/EmberWorkspace'));
const WorldDiscoveryGlobe = React.lazy(() => import('./components/discovery/WorldDiscoveryGlobe'));
const GeneratedAssetLibrary = React.lazy(() => import('./components/publishing/GeneratedAssetLibrary'));
const AccountSettingsCenter = React.lazy(() => import('./components/settings/AccountSettingsCenter'));
const PricingAndUsage = React.lazy(() => import('./components/billing/PricingAndUsage'));
const ProfessionalAudioEqualizer = React.lazy(() =>
  import('./components/eq/ProfessionalAudioEqualizer').then(module => ({ default: module.ProfessionalAudioEqualizer }))
);

type JobStatus = 'IDLE' | 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
type View =
  | 'overview'
  | 'generator'
  | 'production'
  | 'eq'
  | 'publishing'
  | 'marketplace'
  | 'discovery'
  | 'analytics'
  | 'assistant'
  | 'cloud'
  | 'collaboration'
  | 'enterprise'
  | 'plans'
  | 'settings';

interface JobResponse {
  jobId?: string;
  status?: JobStatus | string;
  progress?: number;
  audioUrl?: string | null;
  error?: string | { code?: string; message?: string } | null;
  message?: string;
  metadata?: Record<string, any>;
  result?: Record<string, any>;
  job?: JobResponse;
  data?: JobResponse;
}

interface BillingUsageSnapshot {
  planId: 'free' | 'creator' | 'studio';
  planName: string;
  remainingSeconds: number;
  includedSeconds: number;
  maxTrackSeconds: number;
  commercialUse: boolean;
  limitsEnforced: boolean;
}

const LANGUAGE_KEY = 'sonara.language';
const VOCAL_LANGUAGE_KEY = 'sonara.vocalLanguage';
const DURATION_KEY = 'sonara.defaultDuration';
const BPM_KEY = 'sonara.preferredBpm';
const WEIRDNESS_KEY = 'sonara.weirdness';
const STYLE_INFLUENCE_KEY = 'sonara.styleInfluence';
const ACCOUNT_PREFERENCES_KEY = 'sonara.accountPreferences';
const MIN_BPM = 40;
const MAX_BPM = 220;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const normalizeJob = (value: JobResponse): JobResponse => value?.job || value?.data || value;

function jobErrorMessage(value: JobResponse, fallback: string): string {
  if (typeof value.error === 'string') return value.error;
  if (value.error && typeof value.error.message === 'string') return value.error.message;
  return value.message || fallback;
}

function clampBpm(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(parsed))) : 124;
}

function initialBpm(): number {
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(BPM_KEY) : null;
  return saved == null ? 124 : clampBpm(saved);
}

function clampPercentage(value: unknown, fallback = 50): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : fallback;
}

function initialPercentage(key: string): number {
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  return saved == null ? 50 : clampPercentage(saved);
}

function initialAccountPreferences(): Record<string, any> {
  if (typeof localStorage === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(ACCOUNT_PREFERENCES_KEY) || '{}');
  } catch {
    return {};
  }
}

function brandSonara(value: unknown): string {
  return String(value ?? '')
    .replace(/ACE[- ]?Step(?:\s*1\.5)?\s*(?:\/|·)?\s*Modal(?:\s+NVIDIA)?\s+L4/gi, 'SONARA')
    .replace(/ACE[- ]?Step(?:\s*1\.5)?/gi, 'SONARA')
    .replace(/Modal(?:\s+NVIDIA)?\s+L4/gi, 'SONARA')
    .replace(/\bModal\b/gi, 'SONARA')
    .replace(/SONARA(?:\s*[·/]\s*SONARA)+/gi, 'SONARA');
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid server response (HTTP ${response.status}).`);
  }
}

function initialLanguage(): LanguageCode {
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(LANGUAGE_KEY) : null;
  if (saved && (SUPPORTED_LANGUAGES as readonly string[]).includes(saved)) return saved as LanguageCode;
  return detectDeviceLanguage();
}

const Card = ({ children, className = '' }: any) => (
  <section className={`rounded-2xl border border-slate-800 bg-slate-900/75 shadow-xl ${className}`}>
    {children}
  </section>
);

const MiniCard = ({ icon: Icon, title, text }: any) => (
  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
    <Icon className="mb-3 h-5 w-5 text-purple-400" />
    <div className="text-sm font-bold text-white">{title}</div>
    <div className="mt-1 text-xs leading-5 text-slate-500">{text}</div>
  </div>
);

const SectionTitle = ({ icon: Icon, title, subtitle }: any) => (
  <div className="mb-5 flex items-start gap-3">
    <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-2 text-purple-300">
      <Icon className="h-5 w-5" />
    </div>
    <div>
      <h2 className="text-lg font-black tracking-tight text-white">{title}</h2>
      {subtitle && <p className="mt-1 text-xs text-slate-400">{subtitle}</p>}
    </div>
  </div>
);

interface CreativeControlSliderProps {
  id: string;
  label: string;
  description: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}

function CreativeControlSlider({ id, label, description, value, disabled, onChange }: CreativeControlSliderProps) {
  return (
    <label htmlFor={id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
      <span className="flex items-center justify-between gap-3">
        <span className="text-xs font-black text-slate-200">{label}</span>
        <span className="rounded-md border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-black text-purple-200">{value}%</span>
      </span>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        disabled={disabled}
        onChange={event => onChange(Number(event.target.value))}
        className="mt-3 w-full accent-purple-500 disabled:opacity-40"
        aria-valuetext={`${value} percento`}
      />
      <span className="mt-1 block text-[10px] leading-4 text-slate-500">{description}</span>
    </label>
  );
}

const DURATION_OPTIONS = [30, 45, 60, 90, 120, 150, 180, 210, 240, 300, 360, 420, 480];
const KEYS = ['C Major', 'C Minor', 'C# Major', 'C# Minor', 'D Major', 'D Minor', 'D# Major', 'D# Minor', 'E Major', 'E Minor', 'F Major', 'F Minor', 'F# Major', 'F# Minor', 'G Major', 'G Minor', 'G# Major', 'G# Minor', 'A Major', 'A Minor', 'A# Major', 'A# Minor', 'B Major', 'B Minor'];
const VOCAL_MODES: Array<{ value: VocalMode; label: string; description: string }> = [
  { value: 'instrumental', label: 'Strumentale', description: 'Nessuna voce' },
  { value: 'male', label: 'Voce maschile', description: 'Un cantante uomo' },
  { value: 'female', label: 'Voce femminile', description: 'Una cantante donna' },
  { value: 'duet', label: 'Duetto', description: 'Uomo e donna' }
];
const INITIAL_SELECTION = {
  genreFamily: 'Electronic / Dance',
  genre: 'House',
  subgenre: 'Deep House',
  mood: 'Deep',
  bpm: 124,
  key: 'A Minor',
  durationSec: 30,
  vocalMode: 'instrumental' as VocalMode,
  lyrics: '',
  title: 'Sonara Deep House Track'
};
const INITIAL_PROMPT = buildRandomCreativeBrief({ ...INITIAL_SELECTION, variant: 0 });
function durationLabel(seconds: number, t: (key: Parameters<typeof uiText>[1]) => string) {
  if (seconds < 60) return `${seconds} ${t('seconds')}`;
  const minutes = seconds / 60;
  return Number.isInteger(minutes) ? `${minutes} ${t('minutes')}` : `${minutes.toFixed(2)} ${t('minutes')}`;
}

export default function App() {
  const [language, setLanguage] = useState<LanguageCode>(initialLanguage);
  const t = useMemo(() => (key: Parameters<typeof uiText>[1]) => brandSonara(uiText(language, key)), [language]);

  const [prompt, setPrompt] = useState(INITIAL_PROMPT);
  const [genreFamily, setGenreFamily] = useState(INITIAL_SELECTION.genreFamily);
  const [genre, setGenre] = useState(INITIAL_SELECTION.genre);
  const [subgenre, setSubgenre] = useState(INITIAL_SELECTION.subgenre);
  const [mood, setMood] = useState(INITIAL_SELECTION.mood);
  const [title, setTitle] = useState(INITIAL_SELECTION.title);
  const [lyrics, setLyrics] = useState('');
  const [vocalMode, setVocalMode] = useState<VocalMode>(INITIAL_SELECTION.vocalMode);
  const [vocalLanguage, setVocalLanguage] = useState<LanguageCode>(() => {
    const saved = localStorage.getItem(VOCAL_LANGUAGE_KEY);
    return (SUPPORTED_LANGUAGES as readonly string[]).includes(String(saved)) ? saved as LanguageCode : initialLanguage();
  });
  const [bpm, setBpm] = useState(initialBpm);
  const [durationSec, setDurationSec] = useState(() => {
    const saved = Number(localStorage.getItem(DURATION_KEY));
    return DURATION_OPTIONS.includes(saved) ? saved : 30;
  });
  const [weirdness, setWeirdness] = useState(() => initialPercentage(WEIRDNESS_KEY));
  const [styleInfluence, setStyleInfluence] = useState(() => initialPercentage(STYLE_INFLUENCE_KEY));
  const [keySignature, setKeySignature] = useState(INITIAL_SELECTION.key);

  const [status, setStatus] = useState<JobStatus>('IDLE');
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('Ready');
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [audioFormat, setAudioFormat] = useState('mp3');
  const [qualityScore, setQualityScore] = useState<number | null>(null);
  const [engine, setEngine] = useState('SONARA');
  const [health, setHealth] = useState('CHECKING');
  const [activeTab, setActiveTab] = useState<View>('overview');
  const [isPlaying, setIsPlaying] = useState(false);
  const [archiveStatus, setArchiveStatus] = useState<'IDLE' | 'SAVING' | 'SAVED' | 'PARTIAL' | 'FAILED'>('IDLE');
  const [archivedFileCount, setArchivedFileCount] = useState(0);
  const [accountPreferences, setAccountPreferences] = useState<Record<string, any>>(initialAccountPreferences);
  const [billingUsage, setBillingUsage] = useState<BillingUsageSnapshot | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const automaticTitleRef = useRef(true);
  const randomVariantRef = useRef(0);
  const lyricsVariantRef = useRef(0);
  const busy = status === 'QUEUED' || status === 'PROCESSING';
  const vocalLyrics = vocalMode === 'instrumental' ? '' : lyrics;
  const vocalReady = vocalMode === 'instrumental' || Boolean(lyrics.trim());
  const statusLabel = health === 'READY' ? t('online') : health;
  const maxSelectableTrackSeconds = billingUsage?.maxTrackSeconds ?? SONARA_PLANS.free.maxTrackSeconds;
  const allowedDurationOptions = DURATION_OPTIONS.filter(value => value <= maxSelectableTrackSeconds);

  const family = useMemo(() => WORLD_MUSIC_GENRES.find(group => group.family === genreFamily) || WORLD_MUSIC_GENRES[0], [genreFamily]);
  const genreEntry = useMemo(() => family.genres.find(item => item.name === genre) || findGenre(genre), [family, genre]);
  const availableMoods = useMemo(() => getAtmospheresForSelection(genreFamily, genre, subgenre), [genreFamily, genre, subgenre]);
  const genreCount = useMemo(() => WORLD_MUSIC_GENRES.reduce((sum, group) => sum + group.genres.length, 0), []);
  const subgenreCount = useMemo(() => WORLD_MUSIC_GENRES.reduce((sum, group) => sum + group.genres.reduce((inner, item) => inner + item.subgenres.length, 0), 0), []);

  const navigation: Array<[View, Parameters<typeof uiText>[1], any]> = [
    ['overview', 'overview', Gauge],
    ['generator', 'generator', Zap],
    ['production', 'production', Cpu],
    ['eq', 'eqMaster', SlidersHorizontal],
    ['publishing', 'publishing', Rocket],
    ['marketplace', 'marketplace', Store],
    ['discovery', 'discovery', Globe2],
    ['analytics', 'analytics', BarChart3],
    ['assistant', 'assistant', Bot],
    ['cloud', 'cloud', Cloud],
    ['collaboration', 'collaboration', Handshake],
    ['enterprise', 'enterprise', Building2],
    ['plans', 'plans', CreditCard],
    ['settings', 'settings', Settings2]
  ];

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = RTL_LANGUAGES.includes(language) ? 'rtl' : 'ltr';
    localStorage.setItem(LANGUAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem(VOCAL_LANGUAGE_KEY, vocalLanguage);
  }, [vocalLanguage]);

  useEffect(() => {
    const languageHandler = (event: Event) => {
      const code = (event as CustomEvent<LanguageCode>).detail;
      if (code && (SUPPORTED_LANGUAGES as readonly string[]).includes(code)) setLanguage(code);
    };
    window.addEventListener('sonara:language', languageHandler);
    return () => window.removeEventListener('sonara:language', languageHandler);
  }, []);

  useEffect(() => {
    const preferencesHandler = (event: Event) => {
      const next = (event as CustomEvent<Record<string, any>>).detail;
      if (next) setAccountPreferences(next);
    };
    window.addEventListener('sonara:preferences-updated', preferencesHandler);
    return () => window.removeEventListener('sonara:preferences-updated', preferencesHandler);
  }, []);

  useEffect(() => {
    void refreshDashboard();
  }, []);

  useEffect(() => {
    const refreshBilling = async () => {
      try {
        const token = await getFirebaseIdToken(true);
        const response = await fetch('/api/billing/status', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store'
        });
        if (!response.ok) return;
        const payload = await response.json();
        if (payload?.billing) setBillingUsage(payload.billing);
      } catch {
        setBillingUsage(null);
      }
    };
    const unsubscribe = watchFirebaseUser(user => {
      if (user) void refreshBilling();
      else setBillingUsage(null);
    });
    const handler = (event: Event) => setBillingUsage((event as CustomEvent<BillingUsageSnapshot>).detail || null);
    window.addEventListener('sonara:billing-updated', handler);
    return () => {
      unsubscribe();
      window.removeEventListener('sonara:billing-updated', handler);
    };
  }, []);

  useEffect(() => {
    if (durationSec > maxSelectableTrackSeconds) {
      updateDuration(maxSelectableTrackSeconds);
    }
  }, [durationSec, maxSelectableTrackSeconds]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (isPlaying) void audio.play().catch(() => setIsPlaying(false));
    else audio.pause();
  }, [isPlaying, audioUrl]);

  useEffect(() => {
    setPrompt(buildRandomCreativeBrief({
      genreFamily,
      genre,
      subgenre,
      mood,
      bpm,
      key: keySignature,
      durationSec,
      vocalMode,
      vocalLanguage: LANGUAGE_METADATA[vocalLanguage].name,
      lyrics: vocalLyrics,
      title,
      variant: randomVariantRef.current
    }));
  }, [genreFamily, genre, subgenre, mood, bpm, keySignature, durationSec, vocalMode, vocalLanguage, vocalLyrics, title]);

  const refreshDashboard = async () => {
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      setHealth(response.ok ? 'READY' : `HTTP ${response.status}`);
      if (response.ok) setEngine('SONARA');
    } catch {
      setHealth('OFFLINE');
    }
  };

  const updateFamily = (value: string) => {
    const nextFamily = WORLD_MUSIC_GENRES.find(group => group.family === value) || WORLD_MUSIC_GENRES[0];
    const nextGenre = nextFamily.genres[0];
    const nextSubgenre = nextGenre.subgenres[0] || nextGenre.name;
    setGenreFamily(value);
    setGenre(nextGenre.name);
    setSubgenre(nextSubgenre);
    setMood(getAtmospheresForSelection(value, nextGenre.name, nextSubgenre)[0]);
    if (automaticTitleRef.current) setTitle(`Sonara ${nextSubgenre} Track`);
  };

  const updateGenre = (value: string) => {
    const item = family.genres.find(candidate => candidate.name === value) || findGenre(value);
    const nextSubgenre = item?.subgenres[0] || value;
    setGenre(value);
    setSubgenre(nextSubgenre);
    setMood(getAtmospheresForSelection(genreFamily, value, nextSubgenre)[0]);
    if (automaticTitleRef.current) setTitle(`Sonara ${nextSubgenre} Track`);
  };

  const updateSubgenre = (value: string) => {
    setSubgenre(value);
    setMood(getAtmospheresForSelection(genreFamily, genre, value)[0]);
    if (automaticTitleRef.current) setTitle(`Sonara ${value} Track`);
  };

  const updateDuration = (value: number) => {
    const safe = Math.max(30, Math.min(480, value));
    setDurationSec(safe);
    localStorage.setItem(DURATION_KEY, String(safe));
  };

  const updateBpm = (value: number) => {
    const safe = clampBpm(value);
    setBpm(safe);
    localStorage.setItem(BPM_KEY, String(safe));
  };

  const updateWeirdness = (value: number) => {
    const safe = clampPercentage(value);
    setWeirdness(safe);
    localStorage.setItem(WEIRDNESS_KEY, String(safe));
  };

  const updateStyleInfluence = (value: number) => {
    const safe = clampPercentage(value);
    setStyleInfluence(safe);
    localStorage.setItem(STYLE_INFLUENCE_KEY, String(safe));
  };

  const randomizePrompt = () => {
    randomVariantRef.current = (randomVariantRef.current + 1) % 4;
    automaticTitleRef.current = true;
    const nextTitle = `Sonara ${subgenre} Track`;
    setTitle(nextTitle);
    setPrompt(buildRandomCreativeBrief({
      genreFamily,
      genre,
      subgenre,
      mood,
      bpm,
      key: keySignature,
      durationSec,
      vocalMode,
      lyrics: vocalLyrics,
      title: nextTitle,
      variant: randomVariantRef.current
    }));
  };

  const randomizeLyrics = () => {
    lyricsVariantRef.current = (lyricsVariantRef.current + 1) % 4;
    setLyrics(buildRandomLyrics({
      language: vocalLanguage,
      genre,
      subgenre,
      mood,
      vocalMode,
      variant: lyricsVariantRef.current
    }));
  };

  const generate = async () => {
    if (!prompt.trim() || busy) return;
    setStatus('QUEUED');
    setProgress(5);
    setStage('SONARA is preparing your track...');
    setError('');
    setAudioUrl('');
    setAudioFormat('mp3');
    setQualityScore(null);
    setJobId('');
    setIsPlaying(false);
    setArchiveStatus('IDLE');
    setArchivedFileCount(0);

    try {
      const rawPrompt = prompt.trim();
      const tasteContext = accountPreferences.myTaste && accountPreferences.styleAugmentation
        ? [accountPreferences.favoriteGenres && `Preferred genres: ${accountPreferences.favoriteGenres}`, accountPreferences.favoriteMoods && `Preferred moods: ${accountPreferences.favoriteMoods}`].filter(Boolean).join('. ')
        : '';
      const personalizedPrompt = tasteContext ? `${rawPrompt}\nCREATOR TASTE: ${tasteContext}. Keep the selected genre and subgenre authoritative.` : rawPrompt;
      const finalPrompt = buildGenerationPrompt({
        rawPrompt: personalizedPrompt,
        genreFamily,
        genre,
        subgenre,
        mood,
        bpm,
        key: keySignature,
        durationSec,
        weirdness,
        styleInfluence,
        vocalMode,
        vocalLanguage: LANGUAGE_METADATA[vocalLanguage].name,
        lyrics: vocalLyrics,
        title
      });
      const firebaseToken = await getFirebaseIdToken(true);
      const response = await fetch('/api/billing/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${firebaseToken}`
        },
        body: JSON.stringify({
          prompt: finalPrompt,
          rawPrompt,
          genre,
          genreFamily,
          subgenre,
          mood,
          vocalMode,
          vocalLanguage,
          lyrics: vocalLyrics,
          title,
          bpm,
          key: keySignature,
          durationSec,
          duration: durationSec,
          weirdness,
          styleInfluence,
          outputFormat: accountPreferences.outputFormat || 'wav',
          audioQuality: accountPreferences.audioQuality || 'lossless',
          engineId: 'sonara_ace_step_v15_modal'
        })
      });

      const responseData = await readJson<JobResponse>(response);
      if (!response.ok) throw new Error(jobErrorMessage(responseData, `Generation failed HTTP ${response.status}`));

      if (billingUsage?.limitsEnforced) {
        setBillingUsage(previous => previous ? {
          ...previous,
          remainingSeconds: Math.max(0, previous.remainingSeconds - durationSec)
        } : previous);
      }

      const initial = normalizeJob(responseData);
      const id = responseData.jobId || responseData.result?.jobId || initial.jobId;
      if (!id) throw new Error('SONARA did not return a job ID.');

      setJobId(id);
      setStatus('PROCESSING');
      setProgress(10);
      setStage(t('generating'));

      for (let attempt = 0; attempt < 1200; attempt += 1) {
        await sleep(500);
        const poll = await fetch(`/api/music/job/${encodeURIComponent(id)}`, { cache: 'no-store' });
        if (!poll.ok) continue;
        const current = normalizeJob(await readJson<JobResponse>(poll));
        const currentStatus = String(current.status || 'PROCESSING').toUpperCase();
        const metadata = current.metadata || {};
        setProgress(Number(current.progress || 0));
        setStage(currentStatus === 'COMPLETED' ? t('audioReady') : brandSonara(String(metadata.currentStage || t('generating'))));
        setEngine('SONARA');

        if (currentStatus === 'COMPLETED') {
          const url = current.audioUrl || metadata.audioUrl || responseData.audioUrl || responseData.result?.audioUrl;
          if (!url) throw new Error('SONARA finished without an audio URL.');
          const completedAudioFormat = String(metadata.audioFormat || String(url).split(/[?#]/)[0].split('.').pop() || 'mp3').toLowerCase();
          setAudioUrl(String(url));
          setAudioFormat(completedAudioFormat);
          const verifiedScore = Number((metadata.outputQualityGate as Record<string, any> | undefined)?.score);
          setQualityScore(Number.isFinite(verifiedScore) ? verifiedScore : null);
          setProgress(100);
          setStatus('COMPLETED');
          setStage(t('audioReady'));
          return;
        }
        if (currentStatus === 'FAILED') throw new Error(jobErrorMessage(current, t('failed')));
      }
      throw new Error('Generation timeout.');
    } catch (generationError) {
      setStatus('FAILED');
      setStage(t('failed'));
      setError(generationError instanceof Error ? generationError.message : String(generationError));
    }
  };

  const togglePlay = () => {
    if (!audioUrl) return;
    setIsPlaying(value => !value);
  };

  const downloadTrack = () => {
    if (!audioUrl) return;
    const anchor = document.createElement('a');
    anchor.href = audioUrl;
    anchor.download = `${title || 'sonara-track'}.${audioFormat || 'mp3'}`;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const archiveTrack = async () => {
    if (!audioUrl || archiveStatus === 'SAVING') return;
    setArchiveStatus('SAVING');
    try {
      const result = await archiveGeneratedProject({
        title,
        prompt,
        lyrics: vocalLyrics,
        audioUrl,
        audioFormat,
        metadata: { genreFamily, genre, subgenre, mood, bpm, keySignature, durationSec, vocalMode, vocalLanguage, engine, jobId, qualityScore }
      });
      setArchivedFileCount(result.uploadedFiles.length);
      setArchiveStatus(result.failedFiles.length ? 'PARTIAL' : 'SAVED');
    } catch {
      setArchivedFileCount(0);
      setArchiveStatus('FAILED');
    }
  };

  const generatorView = (
    <Card className="p-5 sm:p-6">
      <SectionTitle icon={Sparkles} title={t('generateMusic')} subtitle={`${t('globalCatalog')} · SONARA`} />

      {billingUsage && (
        <div className="mb-5 flex flex-col justify-between gap-3 rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 sm:flex-row sm:items-center">
          <div><span className="text-[10px] font-black uppercase tracking-widest text-purple-300">SONARA {billingUsage.planName}</span><div className="mt-1 text-xs text-slate-400">{billingUsage.limitsEnforced ? `${Math.max(0, billingUsage.remainingSeconds / 60).toFixed(1).replace('.0', '')} minuti disponibili` : 'Accesso completo durante la configurazione dei piani'}</div></div>
          <button type="button" onClick={() => setActiveTab('plans')} className="inline-flex items-center justify-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-[11px] font-black text-purple-100"><CreditCard className="h-4 w-4" />Gestisci piano</button>
        </div>
      )}

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="sonara-prompt" className="text-xs font-semibold text-slate-400">{t('prompt')}</label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={randomizePrompt} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-[11px] font-black tracking-wider text-purple-200 transition hover:bg-purple-500/20 disabled:opacity-50" title="Random prompt">
              <Shuffle className="h-3.5 w-3.5" />RANDOM
            </button>
            <button type="button" onClick={() => setPrompt('')} disabled={busy || !prompt} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-950 text-slate-400 transition hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-40" aria-label="Clear prompt" title="Clear prompt">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <textarea id="sonara-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} rows={10} className="w-full rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm text-white outline-none focus:border-purple-500" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <CreativeControlSlider id="sonara-weirdness" label="Weirdness" description="Più alto: risultati più insoliti, sperimentali e imprevedibili." value={weirdness} disabled={busy} onChange={updateWeirdness} />
          <CreativeControlSlider id="sonara-style-influence" label="Style Influence" description="Più alto: maggiore fedeltà al prompt, al genere e al sottogenere selezionati." value={styleInfluence} disabled={busy} onChange={updateStyleInfluence} />
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <label className="text-xs text-slate-400">{t('genreFamily')}
          <select value={genreFamily} onChange={event => updateFamily(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-slate-100">
            {WORLD_MUSIC_GENRES.map(group => <option key={group.family} value={group.family}>{group.family}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-400">{t('genre')}
          <select value={genre} onChange={event => updateGenre(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-slate-100">
            {family.genres.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-400">{t('subgenre')}
          <select value={subgenre} onChange={event => updateSubgenre(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-slate-100">
            {(genreEntry?.subgenres || [genre]).map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-4">
        <label className="text-xs text-slate-400">{t('mood')}
          <select value={mood} onChange={event => setMood(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-slate-100">{availableMoods.map(item => <option key={item}>{item}</option>)}</select>
        </label>
        <label className="text-xs text-slate-400">{t('key')}
          <select value={keySignature} onChange={event => setKeySignature(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-slate-100">{KEYS.map(item => <option key={item}>{item}</option>)}</select>
        </label>
        <label className="text-xs text-slate-400">{t('duration')}
          <select value={durationSec} onChange={event => updateDuration(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-slate-100">
            {allowedDurationOptions.map(value => <option key={value} value={value}>{durationLabel(value, t)}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-400">{t('title')}
          <input value={title} onChange={event => { automaticTitleRef.current = false; setTitle(event.target.value); }} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-slate-100" />
        </label>
      </div>

      <div className="mt-4 rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-purple-300">{t('bpm')} preferiti</div>
            <div className="mt-1 text-[11px] text-slate-500">Il valore scelto viene salvato e inviato al motore per la prossima generazione.</div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => updateBpm(bpm - 1)} disabled={busy || bpm <= MIN_BPM} className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-200 disabled:opacity-30" aria-label="Riduci BPM"><Minus className="h-4 w-4" /></button>
            <div className="relative">
              <input type="number" min={MIN_BPM} max={MAX_BPM} step={1} value={bpm} disabled={busy} onChange={event => updateBpm(Number(event.target.value))} className="w-24 rounded-xl border border-purple-500/40 bg-slate-950 px-3 py-2 pr-11 text-center text-xl font-black text-white outline-none focus:border-purple-400 disabled:opacity-50" aria-label="BPM preferiti" />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-purple-300">BPM</span>
            </div>
            <button type="button" onClick={() => updateBpm(bpm + 1)} disabled={busy || bpm >= MAX_BPM} className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-200 disabled:opacity-30" aria-label="Aumenta BPM"><Plus className="h-4 w-4" /></button>
          </div>
        </div>
        <input type="range" min={MIN_BPM} max={MAX_BPM} step={1} value={bpm} disabled={busy} onInput={event => updateBpm(Number((event.target as HTMLInputElement).value))} onChange={event => updateBpm(Number(event.target.value))} className="mt-4 w-full accent-purple-500 disabled:opacity-50" aria-label="Regolazione BPM" />
        <div className="mt-3 flex flex-wrap gap-2">
          {[70, 80, 90, 100, 110, 120, 124, 128, 140, 160, 174].map(value => (
            <button key={value} type="button" disabled={busy} onClick={() => updateBpm(value)} className={`rounded-lg border px-2.5 py-1 text-[10px] font-bold transition disabled:opacity-40 ${bpm === value ? 'border-purple-400 bg-purple-500/20 text-white' : 'border-slate-800 bg-slate-950 text-slate-500 hover:border-slate-600 hover:text-slate-200'}`}>{value}</button>
          ))}
        </div>
      </div>

      <details className="mt-5 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
        <summary className="cursor-pointer text-sm font-bold text-white">{t('lyrics')}</summary>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {VOCAL_MODES.map(option => {
            const selected = vocalMode === option.value;
            return (
              <button key={option.value} type="button" data-sonara-vocal-mode={option.value} disabled={busy} onClick={() => setVocalMode(option.value)} className={`rounded-xl border px-3 py-3 text-left transition disabled:opacity-50 ${selected ? 'border-purple-400 bg-purple-500/20 text-white' : 'border-slate-800 bg-[#060a12] text-slate-400 hover:border-slate-600'}`} aria-pressed={selected}>
                <span className="block text-xs font-black">{option.label}</span>
                <span className="mt-1 block text-[10px]">{option.description}</span>
              </button>
            );
          })}
        </div>
        <label htmlFor="sonara-vocal-language" className="mt-4 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">
          Lingua del testo e della voce
          <select id="sonara-vocal-language" value={vocalLanguage} onChange={event => setVocalLanguage(event.target.value as LanguageCode)} disabled={busy || vocalMode === 'instrumental'} className="mt-2 w-full rounded-xl border border-purple-500/30 bg-[#060a12] p-3 text-sm font-semibold normal-case tracking-normal text-white outline-none focus:border-purple-400 disabled:cursor-not-allowed disabled:opacity-50">
            {SUPPORTED_LANGUAGES.map(code => (<option key={code} value={code}>{LANGUAGE_METADATA[code].nativeName} — {LANGUAGE_METADATA[code].name}</option>))}
          </select>
          <span className="mt-2 block text-[10px] font-normal normal-case tracking-normal text-slate-500">La lingua scelta viene inviata al motore per pronuncia, accento e interpretazione vocale.</span>
        </label>
        <div className="mb-2 mt-4 flex items-center justify-between gap-3">
          <label htmlFor="sonara-lyrics" className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{t('lyrics')}</label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={randomizeLyrics} disabled={busy || vocalMode === 'instrumental'} title={vocalMode === 'instrumental' ? 'Seleziona prima una voce' : 'Genera un testo casuale'} aria-label="Genera un testo casuale" className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-[10px] font-black tracking-widest text-slate-400 transition hover:border-purple-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"><Shuffle className="h-3 w-3" />RANDOM</button>
            <button type="button" onClick={() => setLyrics('')} disabled={busy || !lyrics} title="Cancella il testo" aria-label="Cancella il testo" className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-slate-400 transition hover:border-red-400/70 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"><X className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        <textarea id="sonara-lyrics" value={lyrics} onChange={event => setLyrics(event.target.value)} disabled={busy || vocalMode === 'instrumental'} rows={7} placeholder={vocalMode === 'instrumental' ? 'Seleziona una modalità vocale per inserire il testo.' : 'Inserisci il testo completo da cantare.'} className="w-full rounded-xl border border-slate-800 bg-[#060a12] p-4 text-sm outline-none focus:border-purple-500 disabled:cursor-not-allowed disabled:opacity-50" />
        {!vocalReady && <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">Inserisci il testo prima di generare con la modalità vocale selezionata.</div>}
      </details>

      <button onClick={() => void generate()} disabled={busy || !prompt.trim() || !vocalReady} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 px-6 py-4 font-bold disabled:opacity-50">
        {busy ? <><RefreshCw className="h-5 w-5 animate-spin" />{t('generating')}</> : <><Zap className="h-5 w-5" />{t('generate')}</>}
      </button>

      {(busy || progress > 0) && (<div className="mt-4"><div className="mb-2 flex justify-between text-[11px] text-slate-500"><span>{brandSonara(stage)}</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-950"><div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-cyan-400 transition-all" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></div></div>)}
      {error && <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">{brandSonara(error)}</div>}

      {status === 'COMPLETED' && audioUrl && (
        <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
          <div className="mb-4 flex items-center justify-between gap-4"><div><div className="font-bold text-emerald-300">{t('audioReady')}</div><div className="mt-1 text-xs text-slate-500">{title}</div></div><Disc3 className="h-6 w-6 text-emerald-300" /></div>
          <audio ref={audioRef} src={audioUrl} onEnded={() => setIsPlaying(false)} onPause={() => setIsPlaying(false)} onPlay={() => setIsPlaying(true)} className="hidden" />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={togglePlay} className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-200">{isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{isPlaying ? 'Pausa' : 'Play'}</button>
            <button type="button" onClick={downloadTrack} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-xs font-bold text-slate-200"><Download className="h-4 w-4" />Scarica</button>
            <button type="button" onClick={() => void archiveTrack()} disabled={archiveStatus === 'SAVING'} className="inline-flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-xs font-bold text-purple-200 disabled:opacity-50"><UploadCloud className="h-4 w-4" />{archiveStatus === 'SAVING' ? 'Salvataggio...' : 'Archivia'}</button>
          </div>
          {qualityScore != null && <div className="mt-3 text-[10px] text-slate-500">Quality score: {qualityScore}</div>}
          {archiveStatus === 'SAVED' && <div className="mt-3 text-xs text-emerald-300">Archiviato ({archivedFileCount} file).</div>}
          {archiveStatus === 'PARTIAL' && <div className="mt-3 text-xs text-amber-300">Archiviazione parziale ({archivedFileCount} file).</div>}
          {archiveStatus === 'FAILED' && <div className="mt-3 text-xs text-rose-300">Archiviazione non riuscita.</div>}
        </div>
      )}
    </Card>
  );

  const overviewView = (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MiniCard icon={Activity} title="SONARA Engine" text={`${statusLabel} · ${engine}`} />
      <MiniCard icon={Music} title="Generi" text={`${genreCount} generi professionali`} />
      <MiniCard icon={Library} title="Sottogeneri" text={`${subgenreCount} stili selezionabili`} />
      <MiniCard icon={ShieldCheck} title="Qualità" text="Prompt autoritativo e controllo stile attivi" />
    </div>
  );

  const placeholder = (title: string, icon: any, text: string) => (<Card className="p-6"><SectionTitle icon={icon} title={title} /><p className="text-sm text-slate-400">{text}</p></Card>);

  let mainView: React.ReactNode = overviewView;
  if (activeTab === 'generator') mainView = generatorView;
  else if (activeTab === 'production') mainView = placeholder('Production', Cpu, 'Strumenti di produzione SONARA.');
  else if (activeTab === 'eq') mainView = <React.Suspense fallback={<div />}>{React.createElement(ProfessionalAudioEqualizer as any, { audioUrl, title, disabled: busy })}</React.Suspense>;
  else if (activeTab === 'publishing') mainView = <React.Suspense fallback={<div />}><GeneratedAssetLibrary /></React.Suspense>;
  else if (activeTab === 'marketplace') mainView = placeholder('Marketplace', Store, 'Marketplace SONARA.');
  else if (activeTab === 'discovery') mainView = <React.Suspense fallback={<div />}><WorldDiscoveryGlobe /></React.Suspense>;
  else if (activeTab === 'analytics') mainView = placeholder('Analytics', BarChart3, 'Analytics SONARA.');
  else if (activeTab === 'assistant') mainView = <React.Suspense fallback={<div />}><EmberWorkspace /></React.Suspense>;
  else if (activeTab === 'cloud') mainView = placeholder('Cloud', Cloud, 'SONARA Cloud.');
  else if (activeTab === 'collaboration') mainView = placeholder('Collaboration', Users, 'Collaborazione SONARA.');
  else if (activeTab === 'enterprise') mainView = placeholder('Enterprise', Building2, 'SONARA Enterprise.');
  else if (activeTab === 'plans') mainView = <React.Suspense fallback={<div />}><PricingAndUsage /></React.Suspense>;
  else if (activeTab === 'settings') mainView = <React.Suspense fallback={<div />}><AccountSettingsCenter /></React.Suspense>;

  return (
    <div className="min-h-screen bg-[#050812] text-white">
      <header className="border-b border-slate-800 bg-slate-950/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
          <div className="flex items-center gap-3"><div className="rounded-xl bg-purple-600 p-2"><Music className="h-5 w-5" /></div><div><div className="font-black tracking-tight">SONARA</div><div className="text-[10px] text-slate-500">Enterprise Audio AI</div></div></div>
          <button type="button" onClick={() => void refreshDashboard()} className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] font-bold text-slate-300"><Radio className="h-3.5 w-3.5" />{statusLabel}</button>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1600px] gap-4 p-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
          <nav className="space-y-1">
            {navigation.map(([view, label, Icon]) => (
              <button key={view} type="button" onClick={() => setActiveTab(view)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition ${activeTab === view ? 'bg-purple-500/15 text-purple-200' : 'text-slate-400 hover:bg-slate-800/70 hover:text-white'}`}>
                <Icon className="h-4 w-4" /><span>{t(label)}</span>
              </button>
            ))}
          </nav>
        </aside>
        <main className="min-w-0">{mainView}</main>
      </div>
    </div>
  );
}
