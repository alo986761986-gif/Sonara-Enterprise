export interface GenreLockProfile {
  primaryGenre: string;
  subgenre: string;
  recommendedBpm: number;
  bpmRange: [number, number];
  keySignature: string;
  acousticKeywords: string[];
  bannedKeywords: string[];
  modelTier: string;
}

export class AceStepPromptEngine {
  private static readonly GENRE_PROFILES: Record<string, GenreLockProfile> = {
    'melodic house': {
      primaryGenre: 'House',
      subgenre: 'Melodic House',
      recommendedBpm: 124,
      bpmRange: [120, 126],
      keySignature: 'F Minor',
      acousticKeywords: ['lush analog synth plucks', 'emotional minor chord progression', 'sidechained sub bass', 'four-on-the-floor 4/4 kick', 'shimmering reverb pads', 'crisp 16th hi-hats'],
      bannedKeywords: ['country', 'acoustic guitar strum', 'heavy distortion metal', 'dubstep drop', 'trap 808 roll', 'pop vocal hook'],
      modelTier: 'GOLD'
    },
    'tech house': {
      primaryGenre: 'House',
      subgenre: 'Tech House',
      recommendedBpm: 126,
      bpmRange: [124, 128],
      keySignature: 'A Minor',
      acousticKeywords: ['snappy punchy kick', 'bouncy percussive bassline', 'rolling open hats', 'funky percussive stabs', 'tight 4/4 groove', 'minimal vocal chops'],
      bannedKeywords: ['orchestral strings', 'acoustic folk', 'rock guitar solo', 'country twang'],
      modelTier: 'GOLD'
    },
    'afro house': {
      primaryGenre: 'House',
      subgenre: 'Afro House',
      recommendedBpm: 120,
      bpmRange: [118, 123],
      keySignature: 'D Minor',
      acousticKeywords: ['polyrhythmic organic percussion', 'conga and djembe grooves', 'deep warm bass', 'atmospheric spiritual pads', 'hypnotic rhythmic shaker'],
      bannedKeywords: ['industrial synth', 'metal distortion', 'hardstyle kick', 'trap snare'],
      modelTier: 'GOLD'
    },
    'progressive house': {
      primaryGenre: 'House',
      subgenre: 'Progressive House',
      recommendedBpm: 126,
      bpmRange: [124, 128],
      keySignature: 'C Minor',
      acousticKeywords: ['euphoric build-up', 'layered melodic synth arpeggios', 'driving sidechained bassline', 'pristine 4/4 kick', 'rising white noise sweeps'],
      bannedKeywords: ['boom bap', 'country acoustic', 'trash metal', 'hip hop vocal'],
      modelTier: 'GOLD'
    },
    'deep house': {
      primaryGenre: 'House',
      subgenre: 'Deep House',
      recommendedBpm: 122,
      bpmRange: [120, 124],
      keySignature: 'E Minor',
      acousticKeywords: ['warm sub-bass rumble', 'atmospheric rhodes chords', 'mellow 4/4 kick', 'soulful synth pads', 'smooth shuffle hats'],
      bannedKeywords: ['hardstyle', 'heavy metal', 'aggressive screaming', 'screeching synth'],
      modelTier: 'GOLD'
    },
    'organic house': {
      primaryGenre: 'House',
      subgenre: 'Organic House',
      recommendedBpm: 118,
      bpmRange: [115, 122],
      keySignature: 'G Major',
      acousticKeywords: ['natural acoustic woodwinds', 'gentle organic percussion', 'warm analogue bass', 'soft ambient textures', 'subtle 4/4 kick'],
      bannedKeywords: ['industrial acid', 'harsh distortion', 'synthetic dubstep', 'edm snare drop'],
      modelTier: 'GOLD'
    },
    'house': {
      primaryGenre: 'House',
      subgenre: 'House',
      recommendedBpm: 124,
      bpmRange: [120, 128],
      keySignature: 'C Major',
      acousticKeywords: ['classic 4/4 four-on-the-floor kick', 'driving bassline', 'upbeat 16th hats', 'funky synth stabs'],
      bannedKeywords: ['country', 'metal', 'screamo'],
      modelTier: 'GOLD'
    },
    'trance': {
      primaryGenre: 'Trance',
      subgenre: 'Uplifting Trance',
      recommendedBpm: 138,
      bpmRange: [132, 140],
      keySignature: 'G Minor',
      acousticKeywords: ['rolling 16th bassline', 'soaring supersaw lead', 'euphoric breakdown', 'sidechained pad swells', 'driving 138 BPM kick'],
      bannedKeywords: ['lo-fi hip hop', 'boom bap', 'reggaeton dembow'],
      modelTier: 'GOLD'
    },
    'techno': {
      primaryGenre: 'Techno',
      subgenre: 'Peak Time Techno',
      recommendedBpm: 132,
      bpmRange: [130, 145],
      keySignature: 'F# Minor',
      acousticKeywords: ['heavy industrial rumble kick', 'resonant acid 303 synth line', 'hypnotic dark rhythm', 'driving percussion', 'raw analog processing'],
      bannedKeywords: ['country acoustic', 'pop vocals', 'happy piano chord'],
      modelTier: 'GOLD'
    },
    'drum & bass': {
      primaryGenre: 'Drum & Bass',
      subgenre: 'Neurofunk',
      recommendedBpm: 174,
      bpmRange: [170, 178],
      keySignature: 'F Minor',
      acousticKeywords: ['fast rolling breakbeat drums', 'heavy modulated reese bass', 'snappy 174 BPM snare', 'frantic sub-bass'],
      bannedKeywords: ['slow 4/4 house kick', 'lo-fi piano', 'ambient drone'],
      modelTier: 'GOLD'
    },
    'hip hop': {
      primaryGenre: 'Hip Hop',
      subgenre: 'Boom Bap',
      recommendedBpm: 90,
      bpmRange: [85, 95],
      keySignature: 'C Minor',
      acousticKeywords: ['heavy boom bap kick and snare', 'soulful vinyl sample chop', 'warm sub bass', 'dusty hi-hat groove'],
      bannedKeywords: ['140 bpm trance', 'edm festival drop', '4/4 house kick'],
      modelTier: 'SILVER'
    },
    'trap': {
      primaryGenre: 'Trap',
      subgenre: 'Modern Trap',
      recommendedBpm: 140,
      bpmRange: [130, 150],
      keySignature: 'C# Minor',
      acousticKeywords: ['booming 808 sub bass', 'fast rolling 32nd hi-hats', 'sharp rimshot snare', 'dark brass stabs'],
      bannedKeywords: ['country banjo', 'organic folk guitar', '4/4 house kick'],
      modelTier: 'SILVER'
    },
    'lo-fi': {
      primaryGenre: 'Lo-fi',
      subgenre: 'Lo-fi Chillhop',
      recommendedBpm: 80,
      bpmRange: [75, 88],
      keySignature: 'Ab Major',
      acousticKeywords: ['mellow vinyl crackle', 'dusty rhodes piano', 'relaxed unquantized swing drums', 'warm tape saturated bass'],
      bannedKeywords: ['aggressive dubstep', 'screaming metal', '140 bpm trance'],
      modelTier: 'SILVER'
    },
    'ambient': {
      primaryGenre: 'Ambient',
      subgenre: 'Drone Ambient',
      recommendedBpm: 70,
      bpmRange: [60, 90],
      keySignature: 'D Major',
      acousticKeywords: ['evolving synth pads', 'ethereal shimmer reverb', 'spacious drone textures', 'zero percussive kick'],
      bannedKeywords: ['heavy kick drum', 'fast snare roll', 'slap bass'],
      modelTier: 'SILVER'
    },
    'cinematic': {
      primaryGenre: 'Cinematic',
      subgenre: 'Orchestral Cinematic',
      recommendedBpm: 100,
      bpmRange: [80, 120],
      keySignature: 'D Minor',
      acousticKeywords: ['epic orchestral strings section', 'dramatic brass horns', 'thunderous taiko drums', 'cinematic staccato plucks'],
      bannedKeywords: ['electronic 4/4 kick', 'chip-tune synth', 'reggaeton beat'],
      modelTier: 'GOLD'
    }
  };

  public static detectGenreProfile(query: string, explicitGenre?: string): GenreLockProfile {
    const text = `${query || ''} ${explicitGenre || ''}`.toLowerCase();

    // Direct multi-word subgenre matching first
    for (const [key, profile] of Object.entries(this.GENRE_PROFILES)) {
      if (text.includes(key)) {
        return profile;
      }
    }

    // Single token genre fallback
    if (text.includes('techno')) return this.GENRE_PROFILES['techno'];
    if (text.includes('trance')) return this.GENRE_PROFILES['trance'];
    if (text.includes('dnb') || text.includes('drum and bass') || text.includes('drum & bass')) return this.GENRE_PROFILES['drum & bass'];
    if (text.includes('hiphop') || text.includes('hip hop') || text.includes('rap')) return this.GENRE_PROFILES['hip hop'];
    if (text.includes('trap')) return this.GENRE_PROFILES['trap'];
    if (text.includes('lofi') || text.includes('lo-fi') || text.includes('chill')) return this.GENRE_PROFILES['lo-fi'];
    if (text.includes('ambient')) return this.GENRE_PROFILES['ambient'];
    if (text.includes('cinematic') || text.includes('orchestral') || text.includes('film score')) return this.GENRE_PROFILES['cinematic'];
    if (text.includes('house')) return this.GENRE_PROFILES['house'];

    // Default fallback to Melodic House if electronic dance vibe is present
    return this.GENRE_PROFILES['melodic house'];
  }

  static formatPrompt(prompt: string) {
    return `[SONARA V12 ACE-STEP] ${prompt}`;
  }

  /**
   * Generates a genre-locked optimized prompt by automatically injecting high-fidelity
   * acoustic profiles and removing banned anti-genre keywords.
   */
  static async generatePrompt(query: string, explicitGenre?: string) {
    const originalQuery = query || 'Melodic House';

    const profile = this.detectGenreProfile(originalQuery, explicitGenre);

    // Filter out banned words from original query
    let cleanedQuery = originalQuery;
    profile.bannedKeywords.forEach(banned => {
      const reg = new RegExp(`\\b${banned}\\b`, 'gi');
      cleanedQuery = cleanedQuery.replace(reg, '');
    });
    cleanedQuery = cleanedQuery.replace(/\s+/g, ' ').trim();

    // Build Genre Lock Prompt Payload
    const genreLockTag = `GENRE_LOCK: [${profile.primaryGenre.toUpperCase()} -> ${profile.subgenre.toUpperCase()}]`;
    const tempoTag = `TEMPO: ${profile.recommendedBpm} BPM (${profile.bpmRange[0]}-${profile.bpmRange[1]} BPM)`;
    const keyTag = `KEY: ${profile.keySignature}`;
    const acousticString = profile.acousticKeywords.join(', ');

    const coreProduction = [
      'High Fidelity Master',
      'Professional Studio Separation',
      'Clean Low End',
      'Wide Stereo Field',
      'Transparent Mastering',
      'Zero Phase Distortion'
    ].join(', ');

    const optimizedBody = `${genreLockTag} | ${tempoTag} | ${keyTag} | ${cleanedQuery} | Style Elements: ${acousticString} | Mix Quality: ${coreProduction}`;
    const optimizedPrompt = this.formatPrompt(optimizedBody);

    return {
      status: 'success',
      originalQuery,
      genreProfile: profile,
      optimizedPrompt,
      genreLock: {
        locked: true,
        primaryGenre: profile.primaryGenre,
        subgenre: profile.subgenre,
        targetBpm: profile.recommendedBpm,
        bpmBounds: profile.bpmRange,
        keySignature: profile.keySignature,
        fidelityScore: 100.0
      },
      layers: {
        acousticSeparation: 'High Instrument Separation, Surgical EQ carving to eliminate masking',
        lowEndClarity: 'Deep Punchy Kick, Clean Low End, Mono Bass alignment to resolve muddiness',
        transientEngine: 'Natural Dynamics, Balanced Compression, De-clicked High Frequencies',
        stereoField: 'Wide Stereo space, Symphonic Panning'
      },
      injectedKeywords: profile.acousticKeywords
    };
  }
}
