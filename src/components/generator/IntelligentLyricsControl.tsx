import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles } from 'lucide-react';
import { LANGUAGE_METADATA, type LanguageCode } from '../../i18n/locales';

type LyricsLength = 'short' | 'normal' | 'long';

type LyricsContext = {
  language: LanguageCode;
  genreFamily: string;
  genre: string;
  subgenre: string;
  mood: string;
  vocalMode: 'male' | 'female' | 'duet' | 'instrumental';
  durationSec: number;
  bpm: number;
  title: string;
};

const LYRICS_LENGTH_STORAGE_KEY = 'sonara-lyrics-length';

const LENGTH_OPTIONS: Array<{ value: LyricsLength; label: string; durationSec: number; title: string }> = [
  { value: 'short', label: 'CORTO', durationSec: 60, title: 'Testo corto: struttura compatta e meno strofe' },
  { value: 'normal', label: 'NORMALE', durationSec: 180, title: 'Testo normale: struttura completa standard' },
  { value: 'long', label: 'LUNGO', durationSec: 360, title: 'Testo lungo: struttura estesa con più strofe e sviluppo' }
];

function lyricsDurationFor(length: LyricsLength): number {
  return LENGTH_OPTIONS.find(option => option.value === length)?.durationSec || 180;
}

function readStoredLength(): LyricsLength {
  try {
    const saved = window.localStorage.getItem(LYRICS_LENGTH_STORAGE_KEY);
    return saved === 'short' || saved === 'long' || saved === 'normal' ? saved : 'normal';
  } catch {
    return 'normal';
  }
}

function setControlledTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (setter) setter.call(textarea, value);
  else textarea.value = value;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

function readLyricsContext(textarea: HTMLTextAreaElement): LyricsContext {
  const card = textarea.closest('section');
  const selects = card ? Array.from(card.querySelectorAll('select')) : [];
  const valueAt = (index: number, fallback: string) => (selects[index] as HTMLSelectElement | undefined)?.value || fallback;
  const bpmInput = card?.querySelector('input[aria-label="BPM preferiti"]') as HTMLInputElement | null;
  const titleInput = card?.querySelector('input[placeholder="Track title"]') as HTMLInputElement | null;
  const selectedVocal = card?.querySelector('button[data-sonara-vocal-mode][aria-pressed="true"]') as HTMLButtonElement | null;
  const vocalMode = (selectedVocal?.dataset.sonaraVocalMode || 'male') as LyricsContext['vocalMode'];
  const languageSelect = document.getElementById('sonara-vocal-language') as HTMLSelectElement | null;

  return {
    language: (languageSelect?.value || 'it') as LanguageCode,
    genreFamily: valueAt(0, 'Electronic / Dance'),
    genre: valueAt(1, 'House'),
    subgenre: valueAt(2, valueAt(1, 'House')),
    mood: valueAt(3, 'Authentic'),
    vocalMode,
    durationSec: Number(valueAt(5, '180')) || 180,
    bpm: Number(bpmInput?.value || 124),
    title: titleInput?.value || ''
  };
}

export default function IntelligentLyricsControl() {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [disabled, setDisabled] = useState(true);
  const [lyricsLength, setLyricsLength] = useState<LyricsLength>(() => readStoredLength());

  useEffect(() => {
    const connect = () => {
      const textarea = document.getElementById('sonara-lyrics') as HTMLTextAreaElement | null;
      const toolbar = textarea?.previousElementSibling?.lastElementChild as HTMLElement | null;
      if (!textarea || !toolbar) {
        setMountNode(null);
        setDisabled(true);
        return;
      }

      let host = toolbar.querySelector('[data-sonara-intelligent-lyrics-host]') as HTMLElement | null;
      if (!host) {
        host = document.createElement('span');
        host.setAttribute('data-sonara-intelligent-lyrics-host', 'true');
        host.className = 'inline-flex';
        toolbar.prepend(host);
      }

      const context = readLyricsContext(textarea);
      setDisabled(textarea.disabled || context.vocalMode === 'instrumental');
      setMountNode(host);
    };

    connect();
    const observer = new MutationObserver(connect);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'aria-pressed', 'value'] });
    return () => observer.disconnect();
  }, []);

  const selectLength = (next: LyricsLength) => {
    setLyricsLength(next);
    try {
      window.localStorage.setItem(LYRICS_LENGTH_STORAGE_KEY, next);
    } catch {
      // Storage is optional; the current session selection still works.
    }
  };

  const generateIntelligentLyrics = async () => {
    if (loading || disabled) return;
    const textarea = document.getElementById('sonara-lyrics') as HTMLTextAreaElement | null;
    if (!textarea) return;

    const context = readLyricsContext(textarea);
    if (context.vocalMode === 'instrumental') return;

    setLoading(true);
    try {
      const response = await fetch('/api/lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: context.language,
          languageName: LANGUAGE_METADATA[context.language]?.name || context.language,
          genreFamily: context.genreFamily,
          genre: context.genre,
          subgenre: context.subgenre,
          mood: context.mood,
          vocalMode: context.vocalMode,
          variant: Date.now() + Math.floor(Math.random() * 1_000_000),
          durationSec: lyricsDurationFor(lyricsLength),
          songDurationSec: context.durationSec,
          lyricsLength,
          bpm: context.bpm,
          title: context.title,
          smartRandom: true
        })
      });
      if (!response.ok) throw new Error(`Lyrics service HTTP ${response.status}`);
      const payload = await response.json();
      const nextLyrics = String(payload?.lyrics || '').trim();
      if (!nextLyrics) throw new Error('Lyrics service returned empty content.');
      setControlledTextareaValue(textarea, nextLyrics);
      textarea.focus();
    } catch (error) {
      console.error('[SONARA][Testo Intelligente]', error);
    } finally {
      setLoading(false);
    }
  };

  if (!mountNode) return null;

  return createPortal(
    <span className="inline-flex flex-wrap items-center gap-1.5" data-sonara-lyrics-length-control="true">
      <span className="inline-flex overflow-hidden rounded-lg border border-slate-700/80 bg-slate-950/90" aria-label="Lunghezza testo">
        {LENGTH_OPTIONS.map(option => {
          const selected = lyricsLength === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => selectLength(option.value)}
              disabled={loading}
              title={option.title}
              aria-pressed={selected}
              className={`px-2.5 py-1.5 text-[9px] font-black tracking-wider transition ${selected ? 'bg-purple-500/30 text-purple-100' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'} disabled:opacity-50`}
            >
              {option.label}
            </button>
          );
        })}
      </span>
      <button
        type="button"
        onClick={() => void generateIntelligentLyrics()}
        disabled={disabled || loading}
        className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-500/10 px-3 py-1.5 text-[10px] font-black tracking-wide text-purple-200 transition hover:border-fuchsia-400 hover:bg-purple-500/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        title={disabled ? 'Seleziona prima una voce' : `Crea un Testo Intelligente ${lyricsLength === 'short' ? 'corto' : lyricsLength === 'long' ? 'lungo' : 'normale'}`}
        aria-label="Testo Intelligente"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {loading ? 'CREAZIONE...' : 'Testo Intelligente'}
      </button>
    </span>,
    mountNode
  );
}
