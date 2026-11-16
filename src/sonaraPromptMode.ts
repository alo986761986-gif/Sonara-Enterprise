/** The creator's exact prompt governs free mode. No taxonomy fallback. */
export type SonaraPromptMode = 'free' | 'guided';
export const SONARA_PROMPT_MODE_KEY = 'sonara.generation.prompt.mode.v1';

export function normalizePromptMode(value: unknown): SonaraPromptMode {
  return value === 'guided' ? 'guided' : 'free';
}

export function explicitPromptBpm(prompt: unknown): number | null {
  if (typeof prompt !== 'string') return null;
  const match = /\b(?:bpm\s*[:=]?\s*(\d{2,3})|(\d{2,3})\s*bpm)\b/i.exec(prompt);
  if (!match) return null;
  const bpm = Number(match[1] || match[2]);
  return Number.isInteger(bpm) && bpm >= 40 && bpm <= 220 ? bpm : null;
}

export interface FreePromptOptions {
  prompt: string;
  durationSec: number;
  title?: string;
  outputFormat?: string;
  audioQuality?: string;
}

/** Construct a minimal request without inherited genre, mood, style or BPM. */
export function buildFreePromptBody(input: FreePromptOptions) {
  const rawPrompt = input.prompt.trim();
  const bpm = explicitPromptBpm(rawPrompt);
  return {
    sonaraPromptMode: 'free' as const,
    sonaraFreePromptVersion: 'direct-v1',
    prompt: rawPrompt,
    rawPrompt,
    lyrics: '',
    duration: input.durationSec,
    durationSec: input.durationSec,
    ...(bpm === null ? {} : { bpm, sonaraExactRequestedBpm: bpm }),
    ...(input.title ? { title: input.title } : {}),
    outputFormat: input.outputFormat || 'wav',
    audioQuality: input.audioQuality || 'lossless',
    engineId: 'sonara_ace_step_v15_modal'
  };
}
