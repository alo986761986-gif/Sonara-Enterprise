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
      bpmRange: [118, 132],
      keySignature: 'C Minor',
      acousticKeywords: ['classic four-on-the-floor kick', 'grooving bassline', 'open hi-hats', 'syncopated percussion', 'club-focused mix'],
      bannedKeywords: ['country', 'metal', 'screamo'],
      modelTier: 'GOLD'
    },
    'techno': {
      primaryGenre: 'Techno',
      subgenre: 'Techno',
      recommendedBpm: 132,
      bpmRange: [124, 155],
      keySignature: 'F# Minor',
      acousticKeywords: ['driving kick drum', 'hypnotic percussion', 'raw analog synth texture', 'repetitive club groove', 'controlled low-end rumble'],
      bannedKeywords: ['country acoustic', 'happy pop chorus'],
      modelTier: 'GOLD'
    },
    'trance': {
      primaryGenre: 'Trance',
      subgenre: 'Trance',
      recommendedBpm: 138,
      bpmRange: [128, 150],
      keySignature: 'G Minor',
      acousticKeywords: ['rolling bassline', 'euphoric synth lead', 'long tension-and-release arrangement', 'wide pads', 'driving dance kick'],
      bannedKeywords: ['boom bap', 'reggaeton dembow'],
      modelTier: 'GOLD'
    },
    'drum & bass': {
      primaryGenre: 'Drum & Bass',
      subgenre: 'Drum & Bass',
      recommendedBpm: 174,
      bpmRange: [165, 180],
      keySignature: 'F Minor',
      acousticKeywords: ['fast breakbeat drums', 'deep sub bass', 'snappy backbeat snare', 'high-energy syncopation', 'detailed break editing'],
      bannedKeywords: ['slow four-on-the-floor house groove'],
      modelTier: 'GOLD'
    },
    'dubstep': {
      primaryGenre: 'Bass Music',
      subgenre: 'Dubstep',
      recommendedBpm: 140,
      bpmRange: [135, 150],
      keySignature: 'D Minor',
      acousticKeywords: ['half-time drum feel', 'sub-heavy bass design', 'syncopated bass modulation', 'impactful drops', 'wide electronic sound design'],
      bannedKeywords: ['acoustic country groove'],
      modelTier: 'GOLD'
    },
    'garage': {
      primaryGenre: 'Garage / Bass',
      subgenre: 'UK Garage',
      recommendedBpm: 132,
      bpmRange: [125, 140],
      keySignature: 'A Minor',
      acousticKeywords: ['shuffled two-step drums', 'skippy percussion', 'warm sub bass', 'chopped vocal texture', 'syncopated club groove'],
      bannedKeywords: ['straight heavy metal drums'],
      modelTier: 'GOLD'
    },
    'breakbeat': {
      primaryGenre: 'Breakbeat',
      subgenre: 'Breakbeat',
      recommendedBpm: 132,
      bpmRange: [120, 145],
      keySignature: 'E Minor',
      acousticKeywords: ['syncopated broken beat', 'punchy kick and snare', 'funky bass movement', 'edited drum breaks', 'energetic electronic arrangement'],
      bannedKeywords: ['strict four-on-the-floor only'],
      modelTier: 'GOLD'
    },
    'hardstyle': {
      primaryGenre: 'Hard Dance',
      subgenre: 'Hardstyle',
      recommendedBpm: 150,
      bpmRange: [145, 160],
      keySignature: 'F Minor',
      acousticKeywords: ['distorted pitched kick', 'high-energy hard dance rhythm', 'large euphoric lead', 'dramatic build and drop', 'aggressive transient design'],
      bannedKeywords: ['soft acoustic folk'],
      modelTier: 'GOLD'
    },
    'hardcore': {
      primaryGenre: 'Hard Dance',
      subgenre: 'Hardcore',
      recommendedBpm: 175,
      bpmRange: [165, 220],
      keySignature: 'F Minor',
      acousticKeywords: ['very fast distorted kick pattern', 'relentless high-energy rhythm', 'hard electronic bass', 'rave stabs', 'intense dynamic impact'],
      bannedKeywords: ['laid-back acoustic ballad'],
      modelTier: 'GOLD'
    },
    'hip hop': {
      primaryGenre: 'Hip Hop',
      subgenre: 'Hip Hop',
      recommendedBpm: 90,
      bpmRange: [70, 115],
      keySignature: 'C Minor',
      acousticKeywords: ['strong kick and snare pocket', 'sample-oriented musical texture', 'deep bass', 'humanized hi-hat groove', 'head-nod rhythm'],
      bannedKeywords: ['trance supersaw', 'four-on-the-floor house kick'],
      modelTier: 'SILVER'
    },
    'trap': {
      primaryGenre: 'Hip Hop / Trap',
      subgenre: 'Trap',
      recommendedBpm: 140,
      bpmRange: [120, 160],
      keySignature: 'C# Minor',
      acousticKeywords: ['booming 808 sub bass', 'fast hi-hat rolls', 'sharp snare', 'dark melodic motifs', 'modern trap drum programming'],
      bannedKeywords: ['country banjo', 'four-on-the-floor house kick'],
      modelTier: 'SILVER'
    },
    'r&b': {
      primaryGenre: 'R&B / Soul',
      subgenre: 'R&B',
      recommendedBpm: 90,
      bpmRange: [65, 120],
      keySignature: 'Eb Minor',
      acousticKeywords: ['smooth groove', 'warm bass', 'lush extended chords', 'polished drums', 'soulful harmonic movement'],
      bannedKeywords: ['hardstyle kick'],
      modelTier: 'GOLD'
    },
    'soul': {
      primaryGenre: 'R&B / Soul',
      subgenre: 'Soul',
      recommendedBpm: 95,
      bpmRange: [70, 125],
      keySignature: 'Bb Major',
      acousticKeywords: ['expressive soulful harmony', 'warm live-style rhythm section', 'organic bass', 'rich chord voicings', 'vintage-inspired tone'],
      bannedKeywords: ['industrial techno rumble'],
      modelTier: 'GOLD'
    },
    'pop': {
      primaryGenre: 'Pop',
      subgenre: 'Pop',
      recommendedBpm: 118,
      bpmRange: [80, 145],
      keySignature: 'C Major',
      acousticKeywords: ['clear hook-driven structure', 'polished modern drums', 'supportive bassline', 'memorable melodic motif', 'radio-ready production'],
      bannedKeywords: ['extreme noise wall'],
      modelTier: 'GOLD'
    },
    'rock': {
      primaryGenre: 'Rock',
      subgenre: 'Rock',
      recommendedBpm: 120,
      bpmRange: [80, 180],
      keySignature: 'E Minor',
      acousticKeywords: ['live drum kit feel', 'electric guitar layers', 'electric bass', 'dynamic verse-chorus energy', 'band-oriented mix'],
      bannedKeywords: ['four-on-the-floor club-only arrangement'],
      modelTier: 'GOLD'
    },
    'metal': {
      primaryGenre: 'Metal',
      subgenre: 'Metal',
      recommendedBpm: 150,
      bpmRange: [60, 220],
      keySignature: 'D Minor',
      acousticKeywords: ['heavy distorted guitars', 'powerful live-style drums', 'aggressive low-end', 'tight rhythmic riffing', 'dense high-impact mix'],
      bannedKeywords: ['soft lounge jazz'],
      modelTier: 'GOLD'
    },
    'punk': {
      primaryGenre: 'Punk',
      subgenre: 'Punk',
      recommendedBpm: 175,
      bpmRange: [120, 210],
      keySignature: 'E Major',
      acousticKeywords: ['fast energetic drums', 'raw electric guitars', 'driving bass guitar', 'direct song structure', 'urgent live-band feel'],
      bannedKeywords: ['ambient drone only'],
      modelTier: 'SILVER'
    },
    'jazz': {
      primaryGenre: 'Jazz',
      subgenre: 'Jazz',
      recommendedBpm: 120,
      bpmRange: [60, 200],
      keySignature: 'Bb Major',
      acousticKeywords: ['extended jazz harmony', 'dynamic acoustic rhythm section', 'expressive improvisational phrasing', 'natural instrument separation', 'human swing feel'],
      bannedKeywords: ['hardstyle kick'],
      modelTier: 'GOLD'
    },
    'blues': {
      primaryGenre: 'Blues',
      subgenre: 'Blues',
      recommendedBpm: 95,
      bpmRange: [60, 150],
      keySignature: 'A Major',
      acousticKeywords: ['blues scale phrasing', 'shuffle or straight groove', 'expressive guitar or piano', 'warm bass', 'organic drum feel'],
      bannedKeywords: ['trance supersaw'],
      modelTier: 'SILVER'
    },
    'classical': {
      primaryGenre: 'Classical',
      subgenre: 'Classical',
      recommendedBpm: 100,
      bpmRange: [40, 180],
      keySignature: 'D Minor',
      acousticKeywords: ['natural orchestral dynamics', 'detailed acoustic instrument separation', 'musical phrasing and development', 'wide concert-hall image', 'transparent dynamics'],
      bannedKeywords: ['club kick', '808 trap roll'],
      modelTier: 'GOLD'
    },
    'country': {
      primaryGenre: 'Country / Americana',
      subgenre: 'Country',
      recommendedBpm: 105,
      bpmRange: [70, 160],
      keySignature: 'G Major',
      acousticKeywords: ['acoustic and electric guitar interplay', 'natural drum kit', 'warm bass guitar', 'roots-oriented arrangement', 'clear melodic storytelling feel'],
      bannedKeywords: ['industrial techno rumble'],
      modelTier: 'SILVER'
    },
    'reggae': {
      primaryGenre: 'Reggae / Caribbean',
      subgenre: 'Reggae',
      recommendedBpm: 82,
      bpmRange: [65, 120],
      keySignature: 'A Minor',
      acousticKeywords: ['offbeat guitar or keyboard skank', 'deep round bass', 'laid-back drum pocket', 'spacious dub-aware mix', 'syncopated Caribbean groove'],
      bannedKeywords: ['hardstyle kick'],
      modelTier: 'GOLD'
    },
    'latin': {
      primaryGenre: 'Latin',
      subgenre: 'Latin',
      recommendedBpm: 105,
      bpmRange: [75, 150],
      keySignature: 'D Minor',
      acousticKeywords: ['syncopated Latin percussion', 'rhythmic bass movement', 'dance-oriented groove', 'bright melodic phrasing', 'clear percussion separation'],
      bannedKeywords: ['industrial noise wall'],
      modelTier: 'GOLD'
    },
    'african': {
      primaryGenre: 'African',
      subgenre: 'African',
      recommendedBpm: 112,
      bpmRange: [90, 145],
      keySignature: 'D Minor',
      acousticKeywords: ['polyrhythmic percussion', 'interlocking rhythmic patterns', 'warm bass groove', 'organic melodic motifs', 'danceable African rhythmic feel'],
      bannedKeywords: ['metal blast beat'],
      modelTier: 'GOLD'
    },
    'folk': {
      primaryGenre: 'Folk / Traditional',
      subgenre: 'Folk',
      recommendedBpm: 100,
      bpmRange: [60, 150],
      keySignature: 'G Major',
      acousticKeywords: ['organic acoustic instrumentation', 'natural dynamics', 'clear melodic storytelling', 'human performance feel', 'intimate room tone'],
      bannedKeywords: ['hard electronic kick'],
      modelTier: 'SILVER'
    },
    'ambient': {
      primaryGenre: 'Ambient / Downtempo',
      subgenre: 'Ambient',
      recommendedBpm: 70,
      bpmRange: [40, 110],
      keySignature: 'D Major',
      acousticKeywords: ['evolving pads', 'spacious reverb', 'slow-moving textures', 'wide stereo depth', 'minimal rhythmic pressure'],
      bannedKeywords: ['heavy kick drum', 'fast snare roll'],
      modelTier: 'SILVER'
    },
    'disco': {
      primaryGenre: 'Disco / Funk',
      subgenre: 'Disco',
      recommendedBpm: 118,
      bpmRange: [105, 130],
      keySignature: 'A Minor',
      acousticKeywords: ['steady dance kick', 'funky bass guitar', 'bright rhythm guitar or strings', 'open hi-hats', 'uplifting dancefloor groove'],
      bannedKeywords: ['doom metal riff'],
      modelTier: 'GOLD'
    },
    'funk': {
      primaryGenre: 'Disco / Funk',
      subgenre: 'Funk',
      recommendedBpm: 108,
      bpmRange: [85, 130],
      keySignature: 'E Minor',
      acousticKeywords: ['syncopated bass groove', 'tight drums', 'rhythmic guitar or clavinet', 'punchy horn-like stabs', 'high groove density'],
      bannedKeywords: ['ambient drone only'],
      modelTier: 'GOLD'
    },
    'cinematic': {
      primaryGenre: 'Cinematic / Soundtrack',
      subgenre: 'Cinematic',
      recommendedBpm: 100,
      bpmRange: [50, 140],
      keySignature: 'D Minor',
      acousticKeywords: ['dramatic orchestral or hybrid layers', 'wide cinematic dynamics', 'strong thematic development', 'deep impact percussion when appropriate', 'large spatial image'],
      bannedKeywords: ['chip-tune unless requested'],
      modelTier: 'GOLD'
    },
    'experimental': {
      primaryGenre: 'Experimental',
      subgenre: 'Experimental',
      recommendedBpm: 110,
      bpmRange: [40, 220],
      keySignature: 'C Minor',
      acousticKeywords: ['unconventional sound design', 'nonstandard structure', 'textural contrast', 'creative spatial processing', 'distinctive timbral identity'],
      bannedKeywords: [],
      modelTier: 'SILVER'
    }
  };

  private static cloneForSubgenre(profile: GenreLockProfile, subgenre: string): GenreLockProfile {
    return {
      ...profile,
      subgenre,
      acousticKeywords: [...profile.acousticKeywords],
      bannedKeywords: [...profile.bannedKeywords]
    };
  }

  private static profileForExplicitGenre(explicitGenre: string): GenreLockProfile | null {
    const raw = explicitGenre.trim();
    const genre = raw.toLowerCase();
    if (!genre) return null;

    const exact = this.GENRE_PROFILES[genre];
    if (exact) return exact;

    const choose = (baseKey: string) => this.cloneForSubgenre(this.GENRE_PROFILES[baseKey], raw);

    if (genre.includes('house')) return choose('house');
    if (genre.includes('techno') || genre.includes('schranz') || genre.includes('hardgroove')) return choose('techno');
    if (genre.includes('trance') || genre.includes('psytrance') || genre.includes('goa')) return choose('trance');
    if (genre.includes('drum & bass') || genre.includes('drum and bass') || genre.includes('dnb') || genre.includes('jungle') || genre.includes('neurofunk') || genre.includes('techstep') || genre.includes('breakcore')) return choose('drum & bass');
    if (genre.includes('dubstep') || genre.includes('riddim') || genre.includes('brostep') || genre.includes('future bass') || genre === 'wave') return choose('dubstep');
    if (genre.includes('garage') || genre.includes('bassline') || genre.includes('grime') || genre.includes('uk bass')) return choose('garage');
    if (genre.includes('break') || genre.includes('electro') || genre.includes('footwork') || genre.includes('jersey club') || genre.includes('baltimore club')) return choose('breakbeat');
    if (genre.includes('hardstyle') || genre.includes('rawstyle')) return choose('hardstyle');
    if (genre.includes('hardcore') || genre.includes('gabber') || genre.includes('frenchcore') || genre.includes('speedcore') || genre.includes('terrorcore') || genre.includes('hardtek') || genre.includes('free tekno')) return choose('hardcore');
    if (genre.includes('trap')) return choose('trap');
    if (genre.includes('hip hop') || genre.includes('boom bap') || genre.includes('drill') || genre.includes('phonk') || genre.includes('rap') || genre.includes('g-funk')) return choose('hip hop');
    if (genre.includes('r&b') || genre.includes('rnb')) return choose('r&b');
    if (genre.includes('soul') || genre.includes('motown') || genre.includes('new jack swing')) return choose('soul');
    if (genre.includes('pop') || genre.includes('k-pop') || genre.includes('j-pop') || genre.includes('hyperpop')) return choose('pop');
    if (genre.includes('metal')) return choose('metal');
    if (genre.includes('punk') || genre.includes('emo') || genre.includes('post-hardcore') || genre.includes('screamo')) return choose('punk');
    if (genre.includes('rock') || genre.includes('grunge') || genre.includes('shoegaze')) return choose('rock');
    if (genre.includes('jazz')) return choose('jazz');
    if (genre.includes('blues')) return choose('blues');
    if (genre.includes('classical') || genre.includes('baroque') || genre.includes('orchestral') || genre.includes('symphonic') || genre.includes('opera') || genre.includes('choral') || genre.includes('piano solo')) return choose('classical');
    if (genre.includes('country') || genre.includes('americana') || genre.includes('bluegrass') || genre.includes('honky tonk') || genre.includes('western swing')) return choose('country');
    if (genre.includes('reggae') || genre === 'dub' || genre.includes('dancehall') || genre.includes('ragga') || genre.includes('ska') || genre.includes('rocksteady') || genre.includes('soca') || genre.includes('calypso') || genre.includes('zouk') || genre.includes('kompa')) return choose('reggae');
    if (genre.includes('latin') || genre.includes('reggaeton') || genre.includes('dembow') || genre.includes('salsa') || genre.includes('bachata') || genre.includes('merengue') || genre.includes('cumbia') || genre.includes('bossa') || genre.includes('samba') || genre.includes('tango') || genre.includes('mambo') || genre.includes('bolero') || genre.includes('ranchera') || genre.includes('corridos') || genre.includes('norteño')) return choose('latin');
    if (genre.includes('afrobeat') || genre.includes('afrobeats') || genre.includes('amapiano') || genre.includes('highlife') || genre.includes('juju') || genre.includes('fuji') || genre.includes('kwaito') || genre.includes('gqom') || genre.includes('kuduro') || genre.includes('makossa') || genre.includes('soukous') || genre.includes('mbalax') || genre.includes('gnawa') || genre.includes('desert blues') || genre.includes('afro fusion')) return choose('african');
    if (genre.includes('disco') || genre.includes('boogie') || genre.includes('hi-nrg') || genre.includes('eurodance')) return choose('disco');
    if (genre.includes('funk')) return choose('funk');
    if (genre.includes('ambient') || genre.includes('downtempo') || genre.includes('chill') || genre.includes('trip hop') || genre.includes('vaporwave') || genre.includes('synthwave') || genre.includes('retrowave') || genre.includes('idm') || genre.includes('glitch') || genre.includes('lo-fi')) return choose('ambient');
    if (genre.includes('cinematic') || genre.includes('score') || genre.includes('soundtrack') || genre.includes('trailer')) return choose('cinematic');
    if (genre.includes('folk') || genre.includes('flamenco') || genre.includes('fado') || genre.includes('klezmer') || genre.includes('arabic') || genre.includes('middle eastern') || genre.includes('bollywood') || genre.includes('bhangra') || genre.includes('gamelan') || genre.includes('traditional') || genre.includes('world')) return choose('folk');
    if (genre.includes('experimental') || genre.includes('avant-garde') || genre.includes('noise') || genre.includes('industrial') || genre.includes('darkwave') || genre === 'ebm' || genre.includes('witch house') || genre.includes('deconstructed club')) return choose('experimental');

    return this.cloneForSubgenre(this.GENRE_PROFILES['experimental'], raw);
  }

  public static detectGenreProfile(query: string, explicitGenre?: string): GenreLockProfile {
    if (explicitGenre?.trim()) {
      const explicit = this.profileForExplicitGenre(explicitGenre);
      if (explicit) return explicit;
    }

    const text = String(query || '').toLowerCase();

    for (const [key, profile] of Object.entries(this.GENRE_PROFILES)) {
      if (text.includes(key)) return profile;
    }

    if (text.includes('techno')) return this.GENRE_PROFILES['techno'];
    if (text.includes('trance')) return this.GENRE_PROFILES['trance'];
    if (text.includes('drum and bass') || text.includes('dnb') || text.includes('jungle')) return this.GENRE_PROFILES['drum & bass'];
    if (text.includes('hip hop') || text.includes('hiphop') || text.includes('rap')) return this.GENRE_PROFILES['hip hop'];
    if (text.includes('rock')) return this.GENRE_PROFILES['rock'];
    if (text.includes('metal')) return this.GENRE_PROFILES['metal'];
    if (text.includes('jazz')) return this.GENRE_PROFILES['jazz'];
    if (text.includes('classical') || text.includes('orchestral')) return this.GENRE_PROFILES['classical'];
    if (text.includes('house')) return this.GENRE_PROFILES['house'];

    return this.GENRE_PROFILES['melodic house'];
  }

  static formatPrompt(prompt: string) {
    return `[SONARA V12 ACE-STEP] ${prompt}`;
  }

  static async generatePrompt(query: string, explicitGenre?: string) {
    const originalQuery = query || 'Melodic House';
    const profile = this.detectGenreProfile(originalQuery, explicitGenre);

    let cleanedQuery = originalQuery;
    profile.bannedKeywords.forEach(banned => {
      const reg = new RegExp(`\\b${banned}\\b`, 'gi');
      cleanedQuery = cleanedQuery.replace(reg, '');
    });
    cleanedQuery = cleanedQuery.replace(/\s+/g, ' ').trim();

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
