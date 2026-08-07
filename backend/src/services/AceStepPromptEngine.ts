import {
  GENRE_CATALOG_NAMES,
  normalizeGenreName,
  resolveGenreSelection
} from '../../../shared/genreCatalog';
import {
  genreProductionPromptKeywords,
  resolveGenreProductionBlueprint
} from '../../../shared/genreProductionBlueprints';
import {
  resolveVocalProductionProfile,
  VocalProductionRequest,
  vocalProductionPromptKeywords
} from '../../../shared/vocalProfiles';

export interface GenreLockProfile {
  primaryGenre: string;
  subgenre: string;
  recommendedBpm: number;
  bpmRange: [number, number];
  keySignature: string;
  acousticKeywords: string[];
  bannedKeywords: string[];
  modelTier: string;
  familyId?: string;
  timeSignature?: string;
  isCatalogEntry?: boolean;
  styleBlueprint?: {
    atmosphere: string;
    groove: string;
    bass: string;
    harmony: string;
    soundPalette: string;
    arrangement: string;
    vocalStyle: string;
  };
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
    'pop edm': {
      primaryGenre: 'Electronic',
      subgenre: 'Pop EDM',
      recommendedBpm: 126,
      bpmRange: [120, 130],
      keySignature: 'C Minor',
      acousticKeywords: ['radio-ready dance groove', 'bright melodic synth hook', 'clean four-on-the-floor kick', 'sidechained bass', 'polished pop arrangement', 'uplifting festival chorus'],
      bannedKeywords: ['industrial techno rumble', 'raw acid techno', 'country twang', 'heavy metal distortion'],
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

  private static readonly GENRE_ALIASES: Record<string, string> = {
    'techno house': 'tech house',
    'classic house': 'house',
    'edm': 'pop edm',
    'edm pop': 'pop edm',
    'dance pop': 'pop edm',
    'uplifting trance': 'trance',
    'peak time techno': 'techno',
    'melodic techno': 'techno',
    'dnb': 'drum & bass',
    'drum and bass': 'drum & bass',
    'hip-hop': 'hip hop',
    'hiphop': 'hip hop',
    'rap': 'hip hop',
    'lofi': 'lo-fi',
    'lo fi': 'lo-fi',
    'chillhop': 'lo-fi',
    'film score': 'cinematic',
    'orchestral': 'cinematic'
  };

  private static normalizeGenre(value: string): string {
    return normalizeGenreName(value);
  }

  private static resolveExactGenreKey(value: string): string | null {
    const normalized = this.normalizeGenre(value);
    if (!normalized) return null;
    if (this.GENRE_PROFILES[normalized]) return normalized;
    return this.GENRE_ALIASES[normalized] || null;
  }

  private static resolveGenreKey(value: string): string | null {
    const normalized = this.normalizeGenre(value);
    if (!normalized) return null;
    if (this.GENRE_PROFILES[normalized]) return normalized;
    if (this.GENRE_ALIASES[normalized]) return this.GENRE_ALIASES[normalized];

    const candidates = [
      ...Object.keys(this.GENRE_PROFILES),
      ...Object.keys(this.GENRE_ALIASES)
    ].sort((left, right) => right.length - left.length);

    const matched = candidates.find(candidate => normalized.includes(candidate));
    if (!matched) return null;
    return this.GENRE_ALIASES[matched] || matched;
  }

  private static escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private static enrichProfile(
    profile: GenreLockProfile,
    selectedGenre: string
  ): GenreLockProfile {
    const selection = resolveGenreSelection(selectedGenre || profile.subgenre);
    return {
      ...profile,
      familyId: selection.familyId,
      timeSignature: selection.timeSignature,
      isCatalogEntry: selection.isCatalogEntry
    };
  }

  private static createOpenGenreProfile(selectedGenre: string): GenreLockProfile {
    const selection = resolveGenreSelection(selectedGenre);
    const exactGenre = String(selectedGenre || selection.matchedGenre || 'Custom Genre').trim();
    return {
      primaryGenre: selection.familyName,
      subgenre: exactGenre,
      recommendedBpm: selection.recommendedBpm,
      bpmRange: selection.bpmRange,
      keySignature: selection.keySignature,
      acousticKeywords: selection.acousticKeywords,
      bannedKeywords: [],
      modelTier: selection.isCatalogEntry ? 'GOLD' : 'OPEN',
      familyId: selection.familyId,
      timeSignature: selection.timeSignature,
      isCatalogEntry: selection.isCatalogEntry
    };
  }

  private static createCatalogGenreProfile(selectedGenre: string): GenreLockProfile | null {
    const blueprint = resolveGenreProductionBlueprint(selectedGenre);
    if (!blueprint.isCatalogEntry) return null;

    return {
      primaryGenre: blueprint.familyName,
      subgenre: blueprint.canonicalName,
      recommendedBpm: blueprint.recommendedBpm,
      bpmRange: blueprint.bpmRange,
      keySignature: blueprint.keySignature,
      acousticKeywords: [
        `authentic ${blueprint.canonicalName} style`,
        ...genreProductionPromptKeywords(blueprint)
      ],
      bannedKeywords: blueprint.bannedKeywords,
      modelTier: 'GOLD',
      familyId: blueprint.familyId,
      timeSignature: blueprint.timeSignature,
      isCatalogEntry: blueprint.isCatalogEntry,
      styleBlueprint: {
        atmosphere: blueprint.atmosphere,
        groove: blueprint.groove,
        bass: blueprint.bass,
        harmony: blueprint.harmony,
        soundPalette: blueprint.soundPalette,
        arrangement: blueprint.arrangement,
        vocalStyle: blueprint.vocalStyle
      }
    };
  }

  private static profileForExactSelection(selectedGenre: string): GenreLockProfile {
    // Every catalogued genre now has the same complete production blueprint:
    // atmosphere, groove, bass, harmony, timbre, arrangement and voice.
    const catalogProfile = this.createCatalogGenreProfile(selectedGenre);
    if (catalogProfile) return catalogProfile;

    const exactKey = this.resolveExactGenreKey(selectedGenre);
    const existingProfile = exactKey ? this.GENRE_PROFILES[exactKey] : null;

    // Reuse a handcrafted acoustic profile only when it describes the exact
    // selected style. Broad aliases such as "Trance" must not silently become
    // "Uplifting Trance", nor may "Techno" become "Peak Time Techno".
    if (
      existingProfile &&
      this.normalizeGenre(existingProfile.subgenre) === this.normalizeGenre(selectedGenre)
    ) {
      return this.enrichProfile(existingProfile, selectedGenre);
    }

    return this.createOpenGenreProfile(selectedGenre);
  }

  private static removeConflictingGenres(
    query: string,
    lockedKey: string,
    profile: GenreLockProfile
  ): string {
    let cleaned = String(query || '');
    const primaryGenre = this.normalizeGenre(profile.primaryGenre);
    const conflictingTerms = [
      ...Object.keys(this.GENRE_PROFILES),
      ...Object.keys(this.GENRE_ALIASES),
      ...GENRE_CATALOG_NAMES.map(name => this.normalizeGenre(name))
    ]
      .filter(term => {
        const resolved = this.GENRE_ALIASES[term] || term;
        return resolved !== lockedKey && this.normalizeGenre(term) !== primaryGenre;
      })
      .sort((left, right) => right.length - left.length);

    for (const term of conflictingTerms) {
      cleaned = cleaned.replace(
        new RegExp(`\\b${this.escapeRegExp(term)}\\b`, 'gi'),
        ' '
      );
    }

    return cleaned
      .replace(/\s*[,;/|]+\s*/g, ', ')
      .replace(/\b(?:and|plus)\s+with\b/gi, 'with')
      .replace(/\bwith\s+influence\b/gi, ' ')
      .replace(/\b(and|with|plus)\s*(?=,|$)/gi, ' ')
      .replace(/\s+,/g, ',')
      .replace(/,\s*,+/g, ', ')
      .replace(/^\s*,|,\s*$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  public static detectGenreProfile(query: string, explicitGenre?: string): GenreLockProfile {
    // The user's explicit selector is authoritative. Prompt text can describe
    // instruments and influences, but it must never silently replace the
    // selected primary genre.
    const explicitSelection = String(explicitGenre || '').trim();
    if (explicitSelection) {
      return this.profileForExactSelection(explicitSelection);
    }

    const text = this.normalizeGenre(query);

    const catalogSelection = resolveGenreSelection(text);
    if (catalogSelection.matchedGenre) {
      return this.profileForExactSelection(catalogSelection.matchedGenre);
    }

    // Legacy aliases remain supported when the text is not part of the open
    // catalog (for example shorthand such as DnB or hiphop).
    const detectedKey = this.resolveGenreKey(text);
    if (detectedKey) {
      const detectedCatalogProfile = this.createCatalogGenreProfile(detectedKey);
      return detectedCatalogProfile || this.enrichProfile(
        this.GENRE_PROFILES[detectedKey],
        detectedKey
      );
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
    return this.enrichProfile(
      this.GENRE_PROFILES['melodic house'],
      'Melodic House'
    );
  }

  static formatPrompt(prompt: string) {
    return `[SONARA V12 ACE-STEP] ${prompt}`;
  }

  /**
   * Generates a genre-locked optimized prompt by automatically injecting high-fidelity
   * acoustic profiles and removing banned anti-genre keywords.
   */
  static async generatePrompt(
    query: string,
    explicitGenre?: string,
    explicitBpm?: number,
    vocalRequest: VocalProductionRequest = {}
  ) {
    const originalQuery = query || 'Melodic House';

    const profile = this.detectGenreProfile(originalQuery, explicitGenre);
    const explicitSelection = String(explicitGenre || '').trim();
    const lockedGenreKey = this.normalizeGenre(
      explicitSelection || profile.subgenre || 'Melodic House'
    );

    // Remove competing genre labels before the model sees the prompt. The
    // selected genre remains the only primary style; the rest of the user's
    // musical description is preserved.
    let cleanedQuery = this.removeConflictingGenres(
      originalQuery,
      lockedGenreKey,
      profile
    );
    profile.bannedKeywords.forEach(banned => {
      const reg = new RegExp(`\\b${this.escapeRegExp(banned)}\\b`, 'gi');
      cleanedQuery = cleanedQuery.replace(reg, '');
    });
    cleanedQuery = cleanedQuery.replace(/\s+/g, ' ').trim();
    if (!cleanedQuery) {
      cleanedQuery = `Authentic ${profile.subgenre} instrumental production`;
    }

    const parsedBpm = Number(explicitBpm);
    const selectedBpm = Number.isFinite(parsedBpm) && parsedBpm >= 40 && parsedBpm <= 240
      ? Math.round(parsedBpm)
      : profile.recommendedBpm;

    // Build Genre Lock Prompt Payload
    const genreLockTag = `HARD_GENRE_LOCK: [${profile.primaryGenre.toUpperCase()} -> ${profile.subgenre.toUpperCase()}]`;
    const genreConstraint = `HARD_CONSTRAINT: the output must remain unmistakably ${profile.subgenre}; the selected genre overrides every genre word in user details; never substitute, merge, or relabel the primary genre`;
    const tempoTag = `HARD_TEMPO: exactly ${selectedBpm} BPM`;
    const keyTag = `KEY: ${profile.keySignature}`;
    const acousticString = profile.acousticKeywords.join(', ');
    const vocalProfile = resolveVocalProductionProfile({
      ...vocalRequest,
      genreVocalDirection:
        vocalRequest.genreVocalDirection || profile.styleBlueprint?.vocalStyle
    });
    const vocalKeywords = vocalProductionPromptKeywords(vocalProfile);
    const vocalString = vocalKeywords.join(', ');

    const coreProduction = [
      'High Fidelity Master',
      'Professional Studio Separation',
      'Clean Low End',
      'Wide Stereo Field',
      'Transparent Mastering',
      'Zero Phase Distortion'
    ].join(', ');

    const optimizedBody = `${genreLockTag} | ${genreConstraint} | ${tempoTag} | ${keyTag} | USER_DETAILS_SECONDARY: ${cleanedQuery} | Style Elements: ${acousticString} | Vocal Production: ${vocalString} | Mix Quality: ${coreProduction}`;
    const optimizedPrompt = this.formatPrompt(optimizedBody);

    return {
      status: 'success',
      originalQuery,
      genreProfile: profile,
      optimizedPrompt,
      genreLock: {
        locked: true,
        requestedGenre: explicitSelection || profile.subgenre,
        selectionWasExplicit: Boolean(explicitSelection),
        primaryGenre: profile.primaryGenre,
        subgenre: profile.subgenre,
        familyId: profile.familyId || 'custom',
        timeSignature: profile.timeSignature || '4/4',
        isCatalogEntry: Boolean(profile.isCatalogEntry),
        targetBpm: selectedBpm,
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
      vocalProfile,
      injectedKeywords: profile.acousticKeywords,
      injectedVocalKeywords: vocalKeywords
    };
  }
}
