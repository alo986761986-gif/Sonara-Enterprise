import { useEffect } from 'react';
import type { VocalMode } from '../../generationPrompt';
import { getMusicStyleProfile } from '../../musicStyleIntelligence';

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
    lyrics: vocalMode === 'instrumental' ? '' : String(lyrics?.value || '').trim()
  };
}

function taxonomyExecutionContract(context: LiveContext, creatorIntent: string) {
  const profile = getMusicStyleProfile(context.genreFamily, context.genre, context.subgenre);
  return [
    'SONARA MUSICAL DNA EXECUTION CONTRACT — TAXONOMY FIRST — AUTHORITATIVE.',
    `Family: ${context.genreFamily}`,
    `Genre: ${context.genre}`,
    `Subgenre: ${context.subgenre}`,
    `Atmosphere: ${context.mood}`,
    `HARD PRIORITY: ${context.genreFamily} > ${context.genre} > ${context.subgenre}. These selected interface values define the musical identity and cannot be overridden by free text, personalization, previous prompts, defaults or neighboring styles.`,
    `${context.subgenre} must be unmistakable in groove, drums, bass language, instrumentation, harmony, melody, arrangement, transitions and production. Never collapse it into generic ${context.genre}, generic EDM, generic pop or another subgenre.`,
    `ATMOSPHERE ROLE: ${context.mood} changes emotion, energy, tension, space, density and production color only INSIDE ${context.subgenre}. It must never change the genre or subgenre.`,
    creatorIntent
      ? `CREATOR DETAILS — SECONDARY TO MUSICAL DNA: ${creatorIntent}. Preserve compatible requests for instruments, lyrics, vocals, structure and production. If any free-text style wording conflicts with the selected Family/Genre/Subgenre/Atmosphere, the selected taxonomy wins.`
      : '',
    `Exact tempo lock: ${context.bpm} BPM. Exact key: ${context.keySignature}. Target duration: ${context.durationSec} seconds.`,
    `STYLE IDENTITY: ${profile.identity}`,
    `INSTRUMENTATION: ${profile.instrumentation}`,
    `RHYTHM AND GROOVE: ${profile.rhythm}`,
    `HARMONY AND MELODY: ${profile.harmony}`,
    `ARRANGEMENT: ${profile.arrangement}`,
    `PRODUCTION: ${profile.production}`,
    `WEIRDNESS ${context.weirdness}/100: create originality only inside the selected ${context.subgenre} DNA.`,
    `STYLE INFLUENCE ${context.styleInfluence}/100: change only how strongly authentic ${context.subgenre} conventions are expressed; never permit cross-genre drift.`,
    context.vocalMode === 'instrumental'
      ? 'Vocal lock: strictly instrumental.'
      : `Vocal lock: ${context.vocalMode}, language ${context.vocalLanguageName}. Preserve and perform the supplied lyrics.`,
    `FINAL VALIDATION: before rendering, verify that the result sounds specifically like ${context.subgenre}, belongs to ${context.genreFamily} > ${context.genre}, and clearly carries the ${context.mood} atmosphere.`
  ].filter(Boolean).join('\n');
}

export default function RealMusicIntelligenceBridge() {
  useEffect(() => {
    if ((window as any).__sonaraRealMusicIntelligenceBridgeV2) return;
    (window as any).__sonaraRealMusicIntelligenceBridgeV2 = true;

    const nativeFetch = window.fetch.bind(window);

    const syncPromptBpm = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLTextAreaElement) || target.id !== 'sonara-prompt') return;
      const promptBpm = extractPromptBpm(target.value);
      if (!promptBpm) return;
      const section = target.closest('section');
      const bpmInput = section?.querySelector('input[aria-label="BPM preferiti"]') as HTMLInputElement | null;
      if (bpmInput && Number(bpmInput.value) !== promptBpm) setNativeValue(bpmInput, String(promptBpm));
    };

    document.addEventListener('input', syncPromptBpm, true);

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

            // Always use the CURRENT visible prompt. The old bridge cached a stale prompt
            // after taxonomy changes and could send the previous genre/subgenre instead.
            const creatorIntent = live.prompt || String(originalBody.rawPrompt || originalBody.prompt || '').trim();
            const explicitPromptBpm = extractPromptBpm(creatorIntent);
            const authoritativeBpm = explicitPromptBpm ?? live.bpm;
            const executionContext = { ...live, bpm: authoritativeBpm };
            const contract = taxonomyExecutionContract(executionContext, creatorIntent);
            const headers = new Headers(baseRequest.headers);
            headers.set('content-type', 'application/json');
            headers.set('x-sonara-musical-dna', 'taxonomy-first-v2');
            headers.set('x-sonara-family', live.genreFamily);
            headers.set('x-sonara-genre', live.genre);
            headers.set('x-sonara-subgenre', live.subgenre);
            headers.set('x-sonara-atmosphere', live.mood);

            if (url.pathname === '/api/lyrics') {
              const target = new URL('/api/lyrics-context', window.location.origin);
              const nextBody = {
                ...originalBody,
                musicPrompt: contract,
                genreFamily: live.genreFamily,
                genre: live.genre,
                subgenre: live.subgenre,
                mood: live.mood,
                keySignature: live.keySignature,
                weirdness: live.weirdness,
                styleInfluence: live.styleInfluence,
                bpm: authoritativeBpm,
                requestedBpm: authoritativeBpm,
                songDurationSec: live.durationSec,
                sonaraTaxonomyAuthoritative: true,
                sonaraCreatorStylePriority: false,
                sonaraRealLyricsContext: true
              };
              return nativeFetch(new Request(target.toString(), {
                method: 'POST',
                headers,
                body: JSON.stringify(nextBody),
                credentials: baseRequest.credentials,
                cache: 'no-store',
                redirect: baseRequest.redirect
              }));
            }

            const existingFinalPrompt = String(originalBody.prompt || '').trim();
            const nextBody = {
              ...originalBody,
              prompt: `${contract}\n\nSONARA PRODUCTION DETAILS:\n${existingFinalPrompt}`.slice(0, 12000),
              rawPrompt: creatorIntent,
              genreFamily: live.genreFamily,
              genre_family: live.genreFamily,
              genre: live.genre,
              subgenre: live.subgenre,
              mood: live.mood,
              atmosphere: live.mood,
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
              sonaraTaxonomyAuthoritative: true,
              sonaraCreatorStylePriority: false,
              promptGenreAuthoritative: true,
              sonaraRealPrompt: true,
              sonaraRealPromptVersion: 'taxonomy-first-v2',
              sonaraLyricsAuthoritative: true
            };
            headers.set('x-sonara-real-prompt', 'taxonomy-first-v2');
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
            console.warn('[SONARA][Music Taxonomy Bridge]', error instanceof Error ? error.message : String(error));
          }
        }
      }
      return nativeFetch(input as any, init);
    };

    return () => {
      document.removeEventListener('input', syncPromptBpm, true);
      window.fetch = nativeFetch;
      delete (window as any).__sonaraRealMusicIntelligenceBridgeV2;
    };
  }, []);

  return null;
}
