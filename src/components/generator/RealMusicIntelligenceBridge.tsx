import { useEffect } from 'react';
import { buildRandomCreativeBrief, type VocalMode } from '../../generationPrompt';
import { getAtmospheresForSelection, getMusicStyleProfile } from '../../musicStyleIntelligence';

const KEYS = ['C Major', 'C Minor', 'C# Major', 'C# Minor', 'D Major', 'D Minor', 'D# Major', 'D# Minor', 'E Major', 'E Minor', 'F Major', 'F Minor', 'F# Major', 'F# Minor', 'G Major', 'G Minor', 'G# Major', 'G# Minor', 'A Major', 'A Minor', 'A# Major', 'A# Minor', 'B Major', 'B Minor'];

const GROOVE_DNA = [
  'foreground syncopation and clear call-and-response between drums and bass',
  'use a tighter pocket with deliberate off-beat accents and phrase-level rhythmic variation',
  'build momentum through evolving drum orchestration rather than a repeated static loop',
  'create a strong live-performance pocket with fills that answer the melody',
  'use controlled metric tension, ghost notes and accents that resolve naturally into the main pulse',
  'make the rhythm section conversational: bass, kick, snare and percussion must react to one another'
];

const HARMONY_DNA = [
  'develop the harmony with voice-leading and a recognizable motif that changes meaning across sections',
  'use stronger harmonic movement in the contrast section, then resolve decisively into the main theme',
  'balance memorable melodic cells with sophisticated chord color and purposeful tension-release',
  'introduce one surprising but stylistically credible harmonic turn before the final return',
  'let the main motif evolve through inversion, register change or reharmonization rather than simple repetition',
  'use harmonic density as an arrangement tool: leave space early and expand the voicing toward the climax'
];

const ARRANGEMENT_DNA = [
  'open with the musical identity immediately, develop two clearly different sections, create a contrast passage and finish with a composed ending',
  'use a concise opening, strong A statement, evolving B section, instrumental conversation, final return and decisive ending',
  'build the arrangement in waves: statement, expansion, reduction, rebuild and final peak, with audible changes every phrase',
  'make each section earn the next one through fills, pickups, harmonic pivots and dynamic transitions',
  'feature a purposeful solo or lead-development passage that grows from the main theme and returns to it',
  'avoid copy-paste form: every return of the hook must contain a meaningful orchestration or performance change'
];

const TIMBRE_DNA = [
  'prioritize believable instrument articulation and dynamic interaction over glossy generic layering',
  'use contrast between dry close elements and deeper spatial elements while preserving mix clarity',
  'let the selected genre instrumentation lead the identity; supporting textures must never replace the core ensemble',
  'create width through arrangement and performance differences, not excessive chorus or washed-out reverb',
  'preserve transient detail, natural micro-dynamics and a strong center while giving lead instruments room to breathe',
  'use tone changes between sections so the production itself participates in the musical development'
];

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)];
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
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

function extractPromptBpm(prompt: string): number | null {
  const text = String(prompt || '').trim();
  if (!text) return null;

  const patterns = [
    /\b(?:at|a|@|tempo[:\s]*)\s*(\d{2,3})\s*bpm\b/i,
    /\b(\d{2,3})\s*bpm\b/i,
    /\bbpm\s*[:=]?\s*(\d{2,3})\b/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = Math.round(Number(match[1]));
    if (Number.isFinite(value) && value >= 40 && value <= 220) return value;
  }

  return null;
}

type LiveContext = {
  prompt: string;
  genreFamily: string;
  genre: string;
  subgenre: string;
  mood: string;
  keySignature: string;
  bpm: number;
  durationSec: number;
  weirdness: number;
  styleInfluence: number;
  title: string;
  vocalMode: VocalMode;
  vocalLanguageCode: string;
  vocalLanguageName: string;
  lyrics: string;
  section: HTMLElement | null;
  selects: HTMLSelectElement[];
};

function readLiveContext(): LiveContext {
  const textarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
  const section = textarea?.closest('section') as HTMLElement | null;
  const selects = section ? Array.from(section.querySelectorAll('select')) as HTMLSelectElement[] : [];
  const valueAt = (index: number, fallback: string) => selects[index]?.value || fallback;
  const bpmInput = section?.querySelector('input[aria-label="BPM preferiti"]') as HTMLInputElement | null;
  const weirdnessInput = section?.querySelector('#sonara-weirdness') as HTMLInputElement | null;
  const styleInfluenceInput = section?.querySelector('#sonara-style-influence') as HTMLInputElement | null;
  const selectedVocal = section?.querySelector('button[data-sonara-vocal-mode][aria-pressed="true"]') as HTMLButtonElement | null;
  const vocalModeValue = String(selectedVocal?.dataset.sonaraVocalMode || 'instrumental');
  const vocalMode = (['instrumental', 'male', 'female', 'duet'].includes(vocalModeValue) ? vocalModeValue : 'instrumental') as VocalMode;
  const lyrics = document.getElementById('sonara-lyrics') as HTMLTextAreaElement | null;
  const language = document.getElementById('sonara-vocal-language') as HTMLSelectElement | null;
  const titleInput = section ? Array.from(section.querySelectorAll('input')).find(input => input.type !== 'number' && input.type !== 'range') as HTMLInputElement | undefined : undefined;
  const prompt = String(textarea?.value || '').trim();
  const uiBpm = Math.max(40, Math.min(220, Math.round(Number(bpmInput?.value || 124))));
  const promptBpm = extractPromptBpm(prompt);
  const authoritativeBpm = promptBpm ?? uiBpm;

  if (promptBpm && bpmInput && Number(bpmInput.value) !== promptBpm) {
    setNativeValue(bpmInput, String(promptBpm));
  }

  return {
    prompt,
    genreFamily: valueAt(0, 'Electronic / Dance'),
    genre: valueAt(1, 'House'),
    subgenre: valueAt(2, valueAt(1, 'House')),
    mood: valueAt(3, 'Authentic'),
    keySignature: valueAt(4, 'A Minor'),
    bpm: authoritativeBpm,
    durationSec: Math.max(30, Math.min(480, Math.round(Number(valueAt(5, '30')) || 30))),
    weirdness: Math.max(0, Math.min(100, Math.round(Number(weirdnessInput?.value || 50)))),
    styleInfluence: Math.max(0, Math.min(100, Math.round(Number(styleInfluenceInput?.value || 50)))),
    title: titleInput?.value?.trim() || `Sonara ${valueAt(2, 'Track')} Track`,
    vocalMode,
    vocalLanguageCode: language?.value || 'en',
    vocalLanguageName: language?.selectedOptions?.[0]?.textContent?.split(' — ').pop()?.trim() || 'English',
    lyrics: vocalMode === 'instrumental' ? '' : String(lyrics?.value || '').trim(),
    section,
    selects
  };
}

function realExecutionContract(context: LiveContext, creatorIntent: string) {
  const profile = getMusicStyleProfile(context.genreFamily, context.genre, context.subgenre);
  const promptBpm = extractPromptBpm(creatorIntent);
  return [
    'SONARA REAL MUSIC EXECUTION CONTRACT — AUTHORITATIVE.',
    `Creator musical intent: ${creatorIntent}`,
    'CREATOR INTENT PRIORITY: if the creator explicitly names a genre, subgenre or musical style in the free-text prompt, that explicit style is authoritative and must take priority over conflicting UI defaults or generic taxonomy fallbacks.',
    `UI taxonomy context: ${context.genreFamily} > ${context.genre} > ${context.subgenre}. Atmosphere: ${context.mood}. Use it only when it does not conflict with an explicit genre/style written by the creator.`,
    `Exact tempo lock: ${context.bpm} BPM. Exact key: ${context.keySignature}. Target duration: ${context.durationSec} seconds.`,
    promptBpm
      ? `PROMPT BPM PRIORITY: the creator explicitly requested ${promptBpm} BPM. Generate and render the audio at ${promptBpm} BPM; do not reinterpret, halve, double, normalize or replace this tempo with a default.`
      : `Tempo source: UI-selected BPM ${context.bpm}.`,
    `Audible style identity: ${profile.identity}`,
    `Required instrumentation language: ${profile.instrumentation}`,
    `Required rhythm/groove language: ${profile.rhythm}`,
    `Required harmony/melody language: ${profile.harmony}`,
    `Required arrangement language: ${profile.arrangement}`,
    `Required production language: ${profile.production}`,
    `Creative controls are real generation controls: Weirdness ${context.weirdness}/100; Style Influence ${context.styleInfluence}/100.`,
    context.vocalMode === 'instrumental'
      ? 'Vocal lock: strictly instrumental.'
      : `Vocal lock: ${context.vocalMode}, language ${context.vocalLanguageName}. The supplied lyrics are authoritative and must be performed, not replaced.`,
    'Every instruction above must produce an audible consequence in rhythm, instrumentation, harmony, arrangement, performance or production. Do not collapse the request into a generic house/EDM/pop default and do not ignore the creator brief.'
  ].join('\n');
}

export default function RealMusicIntelligenceBridge() {
  useEffect(() => {
    if ((window as any).__sonaraRealMusicIntelligenceBridgeV1) return;
    (window as any).__sonaraRealMusicIntelligenceBridgeV1 = true;

    const nativeFetch = window.fetch.bind(window);
    let canonicalPrompt = '';
    let canonicalPromptSet = false;

    const capturePrompt = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLTextAreaElement) || target.id !== 'sonara-prompt') return;
      canonicalPrompt = String(target.value || '').trim();
      canonicalPromptSet = true;
      target.dataset.sonaraPromptSource = target.dataset.sonaraPromptSource || 'creator-explicit';

      const promptBpm = extractPromptBpm(canonicalPrompt);
      if (promptBpm) {
        const section = target.closest('section');
        const bpmInput = section?.querySelector('input[aria-label="BPM preferiti"]') as HTMLInputElement | null;
        if (bpmInput && Number(bpmInput.value) !== promptBpm) setNativeValue(bpmInput, String(promptBpm));
      }
    };

    const applyCanonicalPrompt = (value: string, source: string) => {
      const textarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
      if (!textarea) return;
      canonicalPrompt = value.trim();
      canonicalPromptSet = true;
      textarea.dataset.sonaraPromptSource = source;
      setNativeValue(textarea, value);
    };

    const restoreCanonicalPrompt = () => {
      if (!canonicalPromptSet || !canonicalPrompt) return;
      const textarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
      if (!textarea || textarea.value.trim() === canonicalPrompt) return;
      textarea.dataset.sonaraPromptSource = 'restored-authoritative';
      setNativeValue(textarea, canonicalPrompt);
    };

    const realRandom = (button: HTMLButtonElement, event: Event) => {
      if (button.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      if ('stopImmediatePropagation' in event) (event as Event).stopImmediatePropagation();

      const context = readLiveContext();
      if (!context.section) return;
      const moods = getAtmospheresForSelection(context.genreFamily, context.genre, context.subgenre);
      const nextMood = moods.length ? pick(moods) : context.mood;
      const nextKey = pick(KEYS);
      const nextWeirdness = randomInt(42, 88);
      const nextStyleInfluence = randomInt(72, 100);
      const variant = Date.now() + randomInt(1_000, 999_999);

      if (context.selects[3]) setNativeValue(context.selects[3], nextMood);
      if (context.selects[4]) setNativeValue(context.selects[4], nextKey);
      const weirdnessInput = context.section.querySelector('#sonara-weirdness') as HTMLInputElement | null;
      const styleInput = context.section.querySelector('#sonara-style-influence') as HTMLInputElement | null;
      if (weirdnessInput) setNativeValue(weirdnessInput, String(nextWeirdness));
      if (styleInput) setNativeValue(styleInput, String(nextStyleInfluence));

      const base = buildRandomCreativeBrief({
        genreFamily: context.genreFamily,
        genre: context.genre,
        subgenre: context.subgenre,
        mood: nextMood,
        bpm: context.bpm,
        key: nextKey,
        durationSec: context.durationSec,
        weirdness: nextWeirdness,
        styleInfluence: nextStyleInfluence,
        vocalMode: context.vocalMode,
        vocalLanguage: context.vocalLanguageName,
        lyrics: context.lyrics,
        title: context.title,
        variant
      });
      const dna = [
        'SONARA REAL RANDOM DNA — this variation must be audibly different, not a cosmetic prompt rewrite.',
        `Groove choice: ${pick(GROOVE_DNA)}.`,
        `Harmony choice: ${pick(HARMONY_DNA)}.`,
        `Arrangement choice: ${pick(ARRANGEMENT_DNA)}.`,
        `Timbre/performance choice: ${pick(TIMBRE_DNA)}.`,
        `Keep the authoritative BPM locked at exactly ${context.bpm} BPM while applying the randomized mood, key and creative-control values above.`
      ].join('\n');
      const nextPrompt = `${base}\n\n${dna}`;

      window.setTimeout(() => applyCanonicalPrompt(nextPrompt, 'real-random-v1'), 0);
      window.setTimeout(() => applyCanonicalPrompt(nextPrompt, 'real-random-v1'), 80);
      window.setTimeout(() => applyCanonicalPrompt(nextPrompt, 'real-random-v1'), 220);
    };

    const captureButtons = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest('button');
      if (!(button instanceof HTMLButtonElement)) return;
      if (button.getAttribute('title') === 'Random prompt') {
        realRandom(button, event);
        return;
      }
      if (button.getAttribute('title') === 'Clear prompt' || button.getAttribute('aria-label') === 'Clear prompt') {
        canonicalPrompt = '';
        canonicalPromptSet = true;
      }
    };

    document.addEventListener('input', capturePrompt, true);
    document.addEventListener('click', captureButtons, true);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const baseRequest = input instanceof Request ? input : new Request(input, init);
      const url = new URL(baseRequest.url, window.location.origin);
      const method = baseRequest.method.toUpperCase();

      if (method === 'POST' && (url.pathname === '/api/lyrics' || url.pathname === '/api/billing/generate')) {
        const contentType = String(baseRequest.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
          try {
            const originalBody = await baseRequest.clone().json() as Record<string, any>;
            const live = readLiveContext();
            const creatorIntent = canonicalPromptSet
              ? canonicalPrompt
              : (live.prompt || String(originalBody.rawPrompt || originalBody.prompt || '').trim());
            const explicitPromptBpm = extractPromptBpm(creatorIntent);
            const authoritativeBpm = explicitPromptBpm ?? live.bpm;
            const headers = new Headers(baseRequest.headers);
            headers.set('content-type', 'application/json');

            if (url.pathname === '/api/lyrics') {
              const target = new URL('/api/lyrics-context', window.location.origin);
              const nextBody = {
                ...originalBody,
                musicPrompt: creatorIntent,
                keySignature: live.keySignature,
                weirdness: live.weirdness,
                styleInfluence: live.styleInfluence,
                bpm: authoritativeBpm,
                requestedBpm: authoritativeBpm,
                songDurationSec: live.durationSec,
                sonaraRealLyricsContext: true
              };
              const response = await nativeFetch(new Request(target.toString(), {
                method: 'POST',
                headers,
                body: JSON.stringify(nextBody),
                credentials: baseRequest.credentials,
                cache: 'no-store',
                redirect: baseRequest.redirect
              }));
              [60, 180, 360].forEach(delay => window.setTimeout(restoreCanonicalPrompt, delay));
              return response;
            }

            const executionContext = { ...live, bpm: authoritativeBpm };
            const contract = realExecutionContract(executionContext, creatorIntent || live.prompt || 'Create a professional original track.');
            const existingFinalPrompt = String(originalBody.prompt || '').trim();
            const nextBody = {
              ...originalBody,
              prompt: `${contract}\n\nEXISTING SONARA PRODUCTION BRIEF:\n${existingFinalPrompt}`.slice(0, 12000),
              rawPrompt: creatorIntent,
              genreFamily: live.genreFamily,
              genre: live.genre,
              subgenre: live.subgenre,
              mood: live.mood,
              bpm: authoritativeBpm,
              requestedBpm: authoritativeBpm,
              promptBpmAuthoritative: Boolean(explicitPromptBpm),
              key: live.keySignature,
              durationSec: live.durationSec,
              duration: live.durationSec,
              weirdness: live.weirdness,
              styleInfluence: live.styleInfluence,
              vocalMode: live.vocalMode,
              vocalLanguage: live.vocalLanguageCode,
              lyrics: live.lyrics,
              sonaraRealPrompt: true,
              sonaraRealPromptVersion: 'v2-prompt-genre-bpm-authoritative',
              sonaraLyricsAuthoritative: true
            };
            headers.set('x-sonara-real-prompt', 'v2-prompt-genre-bpm-authoritative');
            headers.set('x-sonara-requested-bpm', String(authoritativeBpm));
            return nativeFetch(new Request(baseRequest.url, {
              method: 'POST',
              headers,
              body: JSON.stringify(nextBody),
              credentials: baseRequest.credentials,
              cache: 'no-store',
              redirect: baseRequest.redirect
            }));
          } catch (error) {
            console.warn('[SONARA][Real Music Intelligence]', error instanceof Error ? error.message : String(error));
          }
        }
      }
      return nativeFetch(input as any, init);
    };

    return () => {
      document.removeEventListener('input', capturePrompt, true);
      document.removeEventListener('click', captureButtons, true);
      window.fetch = nativeFetch;
      delete (window as any).__sonaraRealMusicIntelligenceBridgeV1;
    };
  }, []);

  return null;
}