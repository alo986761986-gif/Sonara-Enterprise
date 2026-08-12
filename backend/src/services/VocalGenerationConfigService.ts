export type VocalMode = 'instrumental' | 'female' | 'male' | 'duet';
export type VocalStyle = 'natural' | 'warm' | 'intimate' | 'powerful' | 'airy' | 'raspy';

export interface VocalGenerationConfig {
  mode: VocalMode;
  style: VocalStyle;
  language: string;
  lyrics: string;
  updatedAt: string;
}

const VOCAL_MODES: VocalMode[] = ['instrumental', 'female', 'male', 'duet'];
const VOCAL_STYLES: VocalStyle[] = ['natural', 'warm', 'intimate', 'powerful', 'airy', 'raspy'];

const DEFAULT_CONFIG: VocalGenerationConfig = {
  mode: 'instrumental',
  style: 'natural',
  language: 'it',
  lyrics: '',
  updatedAt: new Date(0).toISOString()
};

export class VocalGenerationConfigService {
  private static config: VocalGenerationConfig = { ...DEFAULT_CONFIG };

  public static getConfig(): VocalGenerationConfig {
    return { ...this.config };
  }

  public static updateConfig(input: Partial<VocalGenerationConfig>): VocalGenerationConfig {
    const nextMode = VOCAL_MODES.includes(input.mode as VocalMode)
      ? input.mode as VocalMode
      : this.config.mode;

    const nextStyle = VOCAL_STYLES.includes(input.style as VocalStyle)
      ? input.style as VocalStyle
      : this.config.style;

    const rawLanguage = typeof input.language === 'string'
      ? input.language.trim().toLowerCase()
      : this.config.language;
    const nextLanguage = /^(unknown|[a-z]{2})$/.test(rawLanguage)
      ? rawLanguage
      : this.config.language;

    const nextLyrics = typeof input.lyrics === 'string'
      ? input.lyrics.slice(0, 4096)
      : this.config.lyrics;

    this.config = {
      mode: nextMode,
      style: nextStyle,
      language: nextLanguage,
      lyrics: nextLyrics,
      updatedAt: new Date().toISOString()
    };

    return this.getConfig();
  }

  public static isInstrumental(config: VocalGenerationConfig = this.config): boolean {
    return config.mode === 'instrumental';
  }

  public static buildPromptSuffix(config: VocalGenerationConfig = this.config): string {
    if (this.isInstrumental(config)) {
      return 'INSTRUMENTAL ONLY: no lead vocal, no sung lyrics, no spoken voice.';
    }

    const voiceType = config.mode === 'female'
      ? 'natural female lead vocal'
      : config.mode === 'male'
        ? 'natural male lead vocal'
        : 'natural male and female duet with clearly distinct voices';

    const styleMap: Record<VocalStyle, string> = {
      natural: 'balanced studio-natural delivery',
      warm: 'warm rounded timbre',
      intimate: 'intimate close-mic delivery',
      powerful: 'powerful controlled delivery',
      airy: 'airy breathy delivery with clear diction',
      raspy: 'lightly raspy organic timbre without harshness'
    };

    return [
      `VOCAL PERFORMANCE: ${voiceType}, ${styleMap[config.style]}.`,
      'REALISM PRIORITY: believable human phrasing, natural breaths, stable pitch, clear consonants, natural vibrato and emotionally coherent dynamics.',
      'Avoid robotic formants, metallic resonance, vocoder character, synthetic warble, doubled phantom syllables and obvious generative vocal artifacts.'
    ].join(' ');
  }

  public static buildLyricsEnvelope(config: VocalGenerationConfig = this.config): string {
    const instrumental = this.isInstrumental(config);
    const marker = `[SONARA_VOCAL_CONFIG language=${instrumental ? 'unknown' : config.language} mode=${config.mode} style=${config.style} instrumental=${instrumental ? 'true' : 'false'}]`;

    if (instrumental) {
      return `${marker}\n[Instrumental]`;
    }

    return `${marker}\n${config.lyrics.trim()}`;
  }
}
