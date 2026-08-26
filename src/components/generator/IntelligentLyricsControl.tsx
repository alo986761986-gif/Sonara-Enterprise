import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles } from 'lucide-react';
import { LANGUAGE_METADATA, type LanguageCode } from '../../i18n/locales';

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
          durationSec: context.durationSec,
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
    <button
      type="button"
      onClick={() => void generateIntelligentLyrics()}
      disabled={disabled || loading}
      className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-500/10 px-3 py-1.5 text-[10px] font-black tracking-wide text-purple-200 transition hover:border-fuchsia-400 hover:bg-purple-500/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      title={disabled ? 'Seleziona prima una voce' : 'Crea un testo intelligente casuale e professionale coerente con genere, atmosfera, BPM e durata'}
      aria-label="Testo Intelligente"
    >
      <Sparkles className="h-3.5 w-3.5" />
      {loading ? 'CREAZIONE...' : 'Testo Intelligente'}
    </button>,
    mountNode
  );
}
