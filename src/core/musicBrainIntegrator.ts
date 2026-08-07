import { SONARA_MUSIC_DNA, type MusicDNAProfile } from './musicDNA';
import { resolveRecommendedEqPresetId } from './eqPresetMap';

export interface MusicBrainInput {
  prompt: string;
  genre: string;
  subgenre: string;
  mood: string;
  bpm: number;
}

export interface MusicBrainEnhancedContext {
  enhancedPrompt: string;
  recommendedGenre: string;
  recommendedSubgenre: string;
  recommendedMood: string;
  recommendedEQPreset: string;
  recommendedEQPresetId: string;
}

interface RecalledDnaRecord {
  prompt?: string;
  genre?: string;
  subgenre?: string;
  bpm?: number;
  keySignature?: string;
  swingPct?: number;
  instruments?: string[];
}

interface BrainRecallResponse {
  status?: string;
  recalledDna?: RecalledDnaRecord | null;
  isMemoryMatch?: boolean;
  matchConfidence?: number;
}

const BROAD_GENRES = new Set([
  'electronic',
  'edm',
  'dance',
  'house',
  'hip hop',
  'pop'
]);

const normalize = (value: string) => value.trim().toLowerCase();

const findDnaProfile = (genre: string, subgenre: string): MusicDNAProfile | undefined => {
  const genreNorm = normalize(genre);
  const subgenreNorm = normalize(subgenre);

  const direct = SONARA_MUSIC_DNA.find((item) => normalize(item.genre) === genreNorm);
  if (direct) return direct;

  if (!subgenreNorm) return undefined;

  return SONARA_MUSIC_DNA.find((item) =>
    item.subgenres.some((sub) => normalize(sub) === subgenreNorm)
  );
};

const inferMoodFromPrompt = (prompt: string): string | null => {
  const value = normalize(prompt);
  const moodKeywords: Array<{ key: string; mood: string }> = [
    { key: 'dark', mood: 'Dark' },
    { key: 'cinematic', mood: 'Cinematic' },
    { key: 'chill', mood: 'Chill' },
    { key: 'aggressive', mood: 'Aggressive' },
    { key: 'energetic', mood: 'Energetic' },
    { key: 'emotional', mood: 'Emotional' },
    { key: 'happy', mood: 'Happy' },
    { key: 'urban', mood: 'Urban' },
    { key: 'radio', mood: 'Radio' }
  ];

  const found = moodKeywords.find((entry) => value.includes(entry.key));
  return found ? found.mood : null;
};

const toPreferredGenre = (userGenre: string, recalledGenre?: string): string => {
  if (!recalledGenre) return userGenre;

  const userNorm = normalize(userGenre);
  if (!userNorm) return recalledGenre;

  if (userNorm === normalize(recalledGenre)) return userGenre;

  // Preserve user intent for broad categories by not hard-overwriting.
  if (BROAD_GENRES.has(userNorm)) return userGenre;

  return recalledGenre;
};

const toPreferredSubgenre = (userSubgenre: string, recalledSubgenre?: string): string => {
  if (!recalledSubgenre) return userSubgenre;
  if (!userSubgenre.trim()) return recalledSubgenre;
  if (normalize(userSubgenre) === normalize(recalledSubgenre)) return userSubgenre;

  // Keep user subgenre as first choice unless recall confidence is explicit in App decision.
  return userSubgenre;
};

const buildEnhancedPrompt = (inputPrompt: string, recalled?: RecalledDnaRecord | null): string => {
  const base = inputPrompt.trim();
  if (!base || !recalled) return base;

  const hints: string[] = [];

  if (recalled.subgenre) {
    hints.push(`reference benchmark style: ${recalled.subgenre}`);
  }

  if (typeof recalled.bpm === 'number' && recalled.bpm > 0) {
    hints.push(`target groove around ${recalled.bpm} BPM`);
  }

  if (recalled.keySignature) {
    hints.push(`harmonic center inspired by ${recalled.keySignature}`);
  }

  if (typeof recalled.swingPct === 'number' && recalled.swingPct > 0) {
    hints.push(`rhythmic swing feel near ${recalled.swingPct}%`);
  }

  if (Array.isArray(recalled.instruments) && recalled.instruments.length > 0) {
    hints.push(`instrument palette hint: ${recalled.instruments.slice(0, 3).join(', ')}`);
  }

  if (hints.length === 0) return base;

  return `${base} Keep the original intent, but enhance production details with ${hints.join('; ')}.`;
};

const fallbackContext = (input: MusicBrainInput, profile?: MusicDNAProfile): MusicBrainEnhancedContext => {
  const recommendedEQPreset = profile?.eqPreset || 'Club Master';
  return {
    enhancedPrompt: input.prompt.trim(),
    recommendedGenre: input.genre,
    recommendedSubgenre: input.subgenre,
    recommendedMood: input.mood || inferMoodFromPrompt(input.prompt) || profile?.moods[0] || 'Energetic',
    recommendedEQPreset,
    recommendedEQPresetId: resolveRecommendedEqPresetId(recommendedEQPreset, input.genre, input.subgenre)
  };
};

export const resolveMusicBrainContext = async (
  input: MusicBrainInput
): Promise<MusicBrainEnhancedContext> => {
  const profile = findDnaProfile(input.genre, input.subgenre);
  const fallback = fallbackContext(input, profile);

  try {
    const recallGenre = input.subgenre || input.genre;

    const response = await fetch('/api/music/brain/recall', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: input.prompt,
        genre: recallGenre
      })
    });

    if (!response.ok) {
      return fallback;
    }

    const data = (await response.json()) as BrainRecallResponse;
    const recalled = data.recalledDna;

    if (!data.isMemoryMatch || !recalled) {
      return fallback;
    }

    const recommendedGenre = toPreferredGenre(input.genre, recalled.genre || profile?.genre);
    const recommendedSubgenre = toPreferredSubgenre(input.subgenre, recalled.subgenre || profile?.subgenres[0]);

    const recommendedMood =
      input.mood ||
      inferMoodFromPrompt(input.prompt) ||
      inferMoodFromPrompt(recalled.prompt || '') ||
      profile?.moods[0] ||
      'Energetic';

    const recommendedEQPreset = profile?.eqPreset || 'Club Master';
    const recommendedEQPresetId = resolveRecommendedEqPresetId(
      recommendedEQPreset,
      recommendedGenre,
      recommendedSubgenre
    );

    return {
      enhancedPrompt: buildEnhancedPrompt(input.prompt, recalled),
      recommendedGenre,
      recommendedSubgenre,
      recommendedMood,
      recommendedEQPreset,
      recommendedEQPresetId
    };
  } catch {
    return fallback;
  }
};
