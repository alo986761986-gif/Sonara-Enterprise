import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileText, Languages, LoaderCircle, Mic, ShieldCheck } from 'lucide-react';

type VocalMode = 'instrumental' | 'female' | 'male' | 'duet';
type VocalStyle = 'natural' | 'warm' | 'intimate' | 'powerful' | 'airy' | 'raspy';

type VocalConfig = {
  mode: VocalMode;
  style: VocalStyle;
  language: string;
  lyrics: string;
};

const STORAGE_KEY = 'sonara.vocalGenerationConfig';

const DEFAULT_CONFIG: VocalConfig = {
  mode: 'instrumental',
  style: 'natural',
  language: 'it',
  lyrics: ''
};

const LANGUAGES = [
  { value: 'it', label: 'Italiano' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'pt', label: 'Português' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'zh', label: '中文' },
  { value: 'unknown', label: 'Auto detect' }
];

const MODES: Array<{ value: VocalMode; label: string }> = [
  { value: 'instrumental', label: 'Strumentale' },
  { value: 'female', label: 'Voce femminile' },
  { value: 'male', label: 'Voce maschile' },
  { value: 'duet', label: 'Duetto' }
];

const STYLES: Array<{ value: VocalStyle; label: string }> = [
  { value: 'natural', label: 'Natural Studio' },
  { value: 'warm', label: 'Calda' },
  { value: 'intimate', label: 'Intima' },
  { value: 'powerful', label: 'Potente' },
  { value: 'airy', label: 'Aria / Breath' },
  { value: 'raspy', label: 'Leggermente graffiata' }
];

const parseStoredConfig = (): VocalConfig => {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<VocalConfig>;

    return {
      mode: MODES.some(item => item.value === parsed.mode) ? parsed.mode as VocalMode : DEFAULT_CONFIG.mode,
      style: STYLES.some(item => item.value === parsed.style) ? parsed.style as VocalStyle : DEFAULT_CONFIG.style,
      language: LANGUAGES.some(item => item.value === parsed.language) ? String(parsed.language) : DEFAULT_CONFIG.language,
      lyrics: typeof parsed.lyrics === 'string' ? parsed.lyrics.slice(0, 4096) : ''
    };
  } catch {
    return DEFAULT_CONFIG;
  }
};

export default function VocalStudioPanel() {
  const initialConfig = useMemo(parseStoredConfig, []);
  const [mode, setMode] = useState<VocalMode>(initialConfig.mode);
  const [style, setStyle] = useState<VocalStyle>(initialConfig.style);
  const [language, setLanguage] = useState(initialConfig.language);
  const [lyrics, setLyrics] = useState(initialConfig.lyrics);
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'ready' | 'error'>('idle');
  const [syncError, setSyncError] = useState('');

  const instrumental = mode === 'instrumental';

  useEffect(() => {
    const config: VocalConfig = { mode, style, language, lyrics };

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      // Browser storage is helpful but not required for generation.
    }

    const timer = window.setTimeout(async () => {
      setSyncState('syncing');
      setSyncError('');

      try {
        const response = await fetch('/api/vocals/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config)
        });

        if (!response.ok) {
          throw new Error(`Vocal config sync failed with HTTP ${response.status}.`);
        }

        setSyncState('ready');
      } catch (error) {
        setSyncState('error');
        setSyncError(error instanceof Error ? error.message : String(error));
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [mode, style, language, lyrics]);

  return (
    <section className="rounded-2xl border border-fuchsia-900/60 bg-slate-900/80 p-5 shadow-xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fuchsia-600/20 text-fuchsia-300">
            <Mic className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-fuchsia-100">Lyrics & Realistic Vocals</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">
              Imposta testo, lingua e carattere vocale. Sonara privilegia interpretazione umana, dizione chiara, respiro naturale e assenza di artefatti robotici.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em]">
          {syncState === 'syncing' && (
            <span className="flex items-center gap-1.5 text-amber-300"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />Sync</span>
          )}
          {syncState === 'ready' && (
            <span className="flex items-center gap-1.5 text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />Ready</span>
          )}
          <span className="flex items-center gap-1.5 text-emerald-300"><ShieldCheck className="h-3.5 w-3.5" />Zero paid API</span>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <label className="space-y-1 text-xs text-slate-400">
          <span className="flex items-center gap-1.5"><Mic className="h-3.5 w-3.5" />Vocal Mode</span>
          <select value={mode} onChange={event => setMode(event.target.value as VocalMode)} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-slate-100">
            {MODES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>

        <label className="space-y-1 text-xs text-slate-400">
          <span>Carattere vocale</span>
          <select value={style} onChange={event => setStyle(event.target.value as VocalStyle)} disabled={instrumental} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-slate-100 disabled:opacity-40">
            {STYLES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>

        <label className="space-y-1 text-xs text-slate-400">
          <span className="flex items-center gap-1.5"><Languages className="h-3.5 w-3.5" />Lingua voce</span>
          <select value={language} onChange={event => setLanguage(event.target.value)} disabled={instrumental} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-slate-100 disabled:opacity-40">
            {LANGUAGES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
      </div>

      <label className="mt-4 block space-y-2 text-xs text-slate-400">
        <span className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" />Testo / Lyrics</span>
          <span className="text-[10px] text-slate-600">{lyrics.length}/4096</span>
        </span>
        <textarea
          value={lyrics}
          onChange={event => setLyrics(event.target.value.slice(0, 4096))}
          disabled={instrumental}
          rows={8}
          placeholder={'[Intro]\n\n[Verse 1]\nScrivi qui il testo...\n\n[Chorus]\nRitornello...\n\n[Outro]'}
          className="w-full rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-600 focus:border-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-40"
        />
      </label>

      <div className="mt-3 rounded-xl border border-white/5 bg-black/20 px-3 py-2 text-[11px] leading-5 text-slate-500">
        <span className="font-semibold text-fuchsia-300">Qualità voce:</span> le voci sono generate da ACE-Step e vengono guidate verso un suono naturale e credibile. Non replichiamo l'identità vocale specifica di artisti reali. Usa tag come <span className="text-slate-300">[Verse]</span>, <span className="text-slate-300">[Chorus]</span>, <span className="text-slate-300">[Bridge]</span> e <span className="text-slate-300">[Instrumental]</span> per strutturare il brano.
      </div>

      {syncError && (
        <div className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">{syncError}</div>
      )}
    </section>
  );
}
