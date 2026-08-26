import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Mic2 } from 'lucide-react';

type VocalCharacter = 'warm' | 'sensual' | 'romantic' | 'studio';

type VocalProfile = {
  value: VocalCharacter;
  label: string;
  timbre: 'WARM' | 'BREATHY' | 'CLEAN';
  description: string;
  engineInstruction: string;
};

const STORAGE_KEY = 'sonara-vocal-character';
const GENERATION_ENDPOINT = '/api/billing/generate';
const VOCAL_LOCK_PREFIX = 'VOCAL CHARACTER LOCK —';

const VOCAL_PROFILES: VocalProfile[] = [
  {
    value: 'warm',
    label: 'Calda',
    timbre: 'WARM',
    description: 'Corposa, morbida e naturale',
    engineInstruction:
      'Use a genuinely warm WARM vocal timbre with rounded chest resonance, soft upper mids, intimate but clear microphone proximity, natural breath and human dynamics. Keep the voice full and smooth; avoid thin, metallic, nasal or harsh coloration.'
  },
  {
    value: 'sensual',
    label: 'Sensuale',
    timbre: 'BREATHY',
    description: 'Intima, vellutata e ariosa',
    engineInstruction:
      'Use a sensual BREATHY vocal timbre with intimate close-mic delivery, silky attacks, controlled air, soft phrasing and subtle dynamic movement while preserving clear intelligibility. Keep it tasteful and human; do not turn the performance into whisper-only vocals or exaggerated breath noise.'
  },
  {
    value: 'romantic',
    label: 'Romantica',
    timbre: 'WARM',
    description: 'Dolce, emotiva e legata',
    engineInstruction:
      'Use a romantic WARM and highly expressive vocal character with tender legato, emotional phrasing, smooth register transitions, tasteful vibrato and intimate dynamics. The delivery must feel sincere and emotionally connected to the lyrics; avoid theatrical over-singing or artificial melodrama.'
  },
  {
    value: 'studio',
    label: 'Studio',
    timbre: 'CLEAN',
    description: 'Pulita, precisa e professionale',
    engineInstruction:
      'Use a CLEAN professional studio vocal character: pristine close-mic capture, precise diction, stable pitch, controlled sibilance, balanced dynamics, low noise and release-ready presence. Preserve natural human articulation and expression while avoiding synthetic artifacts, phasey doubling or brittle processing.'
  }
];

function readStoredCharacter(): VocalCharacter {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return VOCAL_PROFILES.some(profile => profile.value === saved) ? saved as VocalCharacter : 'studio';
  } catch {
    return 'studio';
  }
}

function profileFor(value: VocalCharacter): VocalProfile {
  return VOCAL_PROFILES.find(profile => profile.value === value) || VOCAL_PROFILES[3];
}

function currentProfile(): VocalProfile {
  return profileFor(readStoredCharacter());
}

function normalizeFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function addVocalLock(prompt: string, profile: VocalProfile): string {
  const withoutOldLock = prompt
    .replace(/\n*VOCAL CHARACTER LOCK —[^\n]*\n[^\n]*/gi, '')
    .trimEnd();
  return `${withoutOldLock}\n\n${VOCAL_LOCK_PREFIX} ${profile.label.toUpperCase()} / ${profile.timbre}\n${profile.engineInstruction}`;
}

function patchGenerationPayload(body: string): string {
  try {
    const payload = JSON.parse(body);
    const vocalMode = String(payload?.vocalMode || '').toLowerCase();
    if (!payload || vocalMode === 'instrumental') return body;

    const profile = currentProfile();
    payload.vocalCharacter = profile.value;
    payload.vocalTimbre = profile.timbre;
    payload.vocalCharacterLabel = profile.label;
    if (typeof payload.prompt === 'string' && payload.prompt.trim()) {
      payload.prompt = addVocalLock(payload.prompt, profile);
    }
    return JSON.stringify(payload);
  } catch {
    return body;
  }
}

export default function VocalCharacterControl() {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [character, setCharacter] = useState<VocalCharacter>(() => readStoredCharacter());
  const [open, setOpen] = useState(false);
  const [disabled, setDisabled] = useState(true);
  const selectedProfile = useMemo(() => profileFor(character), [character]);

  useEffect(() => {
    const originalFetch = window.fetch;
    const wrappedFetch: typeof window.fetch = async (input, init) => {
      const url = normalizeFetchUrl(input);
      const matchesGeneration = url === GENERATION_ENDPOINT || url.includes(`${GENERATION_ENDPOINT}?`);
      if (!matchesGeneration || String(init?.method || 'GET').toUpperCase() !== 'POST' || typeof init?.body !== 'string') {
        return originalFetch(input, init);
      }

      return originalFetch(input, {
        ...init,
        body: patchGenerationPayload(init.body)
      });
    };

    window.fetch = wrappedFetch;
    return () => {
      if (window.fetch === wrappedFetch) window.fetch = originalFetch;
    };
  }, []);

  useEffect(() => {
    const connect = () => {
      const textarea = document.getElementById('sonara-lyrics') as HTMLTextAreaElement | null;
      const toolbar = textarea?.previousElementSibling?.lastElementChild as HTMLElement | null;
      if (!textarea || !toolbar) {
        setMountNode(null);
        setDisabled(true);
        setOpen(false);
        return;
      }

      let host = toolbar.querySelector('[data-sonara-vocal-character-host]') as HTMLElement | null;
      if (!host) {
        host = document.createElement('span');
        host.setAttribute('data-sonara-vocal-character-host', 'true');
        host.className = 'inline-flex';
        toolbar.prepend(host);
      }

      const selectedVocal = textarea.closest('section')?.querySelector('button[data-sonara-vocal-mode][aria-pressed="true"]') as HTMLButtonElement | null;
      const vocalMode = selectedVocal?.dataset.sonaraVocalMode || 'instrumental';
      const nextDisabled = textarea.disabled || vocalMode === 'instrumental';
      setDisabled(nextDisabled);
      if (nextDisabled) setOpen(false);
      setMountNode(host);
    };

    connect();
    const observer = new MutationObserver(connect);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'aria-pressed']
    });
    return () => observer.disconnect();
  }, []);

  const selectCharacter = (next: VocalCharacter) => {
    setCharacter(next);
    setOpen(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The current session selection remains active even if storage is unavailable.
    }
  };

  if (!mountNode) return null;

  return createPortal(
    <span className="relative inline-flex" data-sonara-vocal-character-control="true">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={disabled ? 'Seleziona prima Voce maschile, Voce femminile o Duetto' : `Carattere voce: ${selectedProfile.label} — ${selectedProfile.description}`}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-fuchsia-500/35 bg-fuchsia-500/10 px-2.5 py-1.5 text-[10px] font-black tracking-wide text-fuchsia-100 transition hover:border-fuchsia-400/70 hover:bg-fuchsia-500/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Mic2 className="h-3.5 w-3.5" />
        VOCE: {selectedProfile.label.toUpperCase()}
        <ChevronDown className={`h-3 w-3 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && !disabled && (
        <span
          role="listbox"
          aria-label="Carattere della voce"
          className="absolute right-0 top-full z-[100] mt-2 w-64 overflow-hidden rounded-xl border border-slate-700 bg-slate-950/98 p-1.5 shadow-2xl shadow-black/50"
        >
          {VOCAL_PROFILES.map(profile => {
            const selected = profile.value === character;
            return (
              <button
                key={profile.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => selectCharacter(profile.value)}
                className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition ${selected ? 'bg-fuchsia-500/20 text-white' : 'text-slate-300 hover:bg-slate-800/90 hover:text-white'}`}
              >
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                  {selected && <Check className="h-3.5 w-3.5 text-fuchsia-300" />}
                </span>
                <span>
                  <span className="block text-[11px] font-black">{profile.label}</span>
                  <span className="mt-0.5 block text-[9px] leading-4 text-slate-500">{profile.description} · {profile.timbre}</span>
                </span>
              </button>
            );
          })}
        </span>
      )}
    </span>,
    mountNode
  );
}
