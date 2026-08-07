export interface SonaraPromptInput {
  genre?: string;
  mood?: string;
  bpm?: number;
  userPrompt?: string;
  hasLyrics?: boolean;
}

export class SonaraPromptEngine {
  public static build(input: SonaraPromptInput): string {
    const genre = input.genre?.trim() || 'House';
    const mood = input.mood?.trim() || 'Energetic';
    const bpm = Math.max(60, Math.min(240, Number(input.bpm || 128)));
    const userPrompt =
      input.userPrompt?.trim() || 'Modern electronic dance track';

    return [
      `Create a professional ${genre} production at ${bpm} BPM.`,
      `${mood} mood with a steady, locked groove and consistent tempo.`,
      userPrompt
    ].join(' ');
  }
}const descriptors = [
  "Professional club-quality production",
  "Crystal-clear mix",
  "Wide stereo image",
  "Punchy kick drum",
  "Deep and controlled sub bass",
  "Clean sidechain compression",
  "Tight groove",
  "Perfect rhythmic consistency",
  "Balanced percussion",
  "Natural dynamics",
  "High instrument separation",
  "Warm analog atmosphere",
  "Smooth transitions",
  "Radio-ready mastering",
  "No clipping or distortion",
  "Consistent energy throughout the track"
];

if (input.hasLyrics) {
  descriptors.push(
    "Natural expressive vocal performance",
    "Clear vocal articulation",
    "Vocals perfectly integrated into the mix"
  );
}

return [
  `Create a professional ${genre} production at ${bpm} BPM.`,
  `${mood} mood with a steady four-on-the-floor groove.`,
  descriptors.join(". ") + ".",
  userPrompt
].join("\n\n");