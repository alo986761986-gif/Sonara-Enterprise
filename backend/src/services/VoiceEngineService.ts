// VoiceEngineService.ts - Sonara Virtual Vocalist & AI Singer Synthesizer Engine
import fs from 'fs';
import path from 'path';

export interface VirtualSinger {
  id: string;
  name: string;
  gender: 'MALE' | 'FEMALE';
  vocalRange: 'SOPRANO' | 'ALTO' | 'TENOR' | 'BARITONE' | 'BASS';
  language: string; // e.g. 'English', 'Italiano', etc.
  timbreType: 'WARM' | 'BRIGHT' | 'BREATHY' | 'ROUGH' | 'CLEAN' | 'GRAVELLY';
  energyLevel: number; // 1 to 10
  vocalStyle: string; // e.g. 'Pop', 'Rock', etc.
  pronunciationAccuracy: number; // percentage, e.g. 98
  expressiveness: number; // percentage, e.g. 95
  bio: string;
  isCustom: boolean;
  avatarUrl?: string;
  technology: 'LOCAL_MODEL' | 'CLOUD_API' | 'CLONE_AUTHORIZED';
}

export interface VoiceBlendRequest {
  singerId1: string;
  singerId2: string;
  ratio: number; // 0 to 1
  newName?: string;
}

export interface ChoirGenerationRequest {
  name: string;
  voicesCount: number;
  vocalStyle: string;
  language: string;
  harmonyType: 'UNISON' | 'HARMONY' | 'POLYPHONIC';
}

export class VoiceEngineService {
  private static filePath = path.join(process.cwd(), 'storage', 'virtual_singers.json');
  private static singers: VirtualSinger[] = [];
  private static isInitialized = false;

  // Static pre-seeded database of world-class virtual vocalists
  private static readonly defaultSingers: VirtualSinger[] = [
    {
      id: "v-01",
      name: "Aria Thorne",
      gender: "FEMALE",
      vocalRange: "SOPRANO",
      language: "Inglese",
      timbreType: "BRIGHT",
      energyLevel: 8.5,
      vocalStyle: "Pop",
      pronunciationAccuracy: 99,
      expressiveness: 94,
      bio: "Crystalline and vibrant voice designed for mainstream pop hooks, dance anthems, and high-energy choruses.",
      isCustom: false,
      technology: "LOCAL_MODEL"
    },
    {
      id: "v-02",
      name: "Elias Vance",
      gender: "MALE",
      vocalRange: "TENOR",
      language: "Inglese",
      timbreType: "WARM",
      energyLevel: 6.8,
      vocalStyle: "Soul",
      pronunciationAccuracy: 97,
      expressiveness: 98,
      bio: "Velvety, emotional tenor voice with a subtle gravelly edge, perfect for Neo-Soul, R&B, and acoustic ballads.",
      isCustom: false,
      technology: "LOCAL_MODEL"
    },
    {
      id: "v-03",
      name: "Matteo Rossini",
      gender: "MALE",
      vocalRange: "BARITONE",
      language: "Italiano",
      timbreType: "CLEAN",
      energyLevel: 7.2,
      vocalStyle: "Classica",
      pronunciationAccuracy: 100,
      expressiveness: 96,
      bio: "Powerful baritone with pristine Italian diction, optimized for classical crossover, cinematic orchestrations, and epic anthems.",
      isCustom: false,
      technology: "LOCAL_MODEL"
    },
    {
      id: "v-04",
      name: "Valeria Santoro",
      gender: "FEMALE",
      vocalRange: "ALTO",
      language: "Italiano",
      timbreType: "BREATHY",
      energyLevel: 5.5,
      vocalStyle: "LoFi",
      pronunciationAccuracy: 98,
      expressiveness: 92,
      bio: "Intimate, warm, and highly expressive Italian alto. Tailored for chillwave, jazz hop, and atmospheric acoustic indie songs.",
      isCustom: false,
      technology: "LOCAL_MODEL"
    },
    {
      id: "v-05",
      name: "Damon Krieger",
      gender: "MALE",
      vocalRange: "BARITONE",
      language: "Tedesco",
      timbreType: "GRAVELLY",
      energyLevel: 9.8,
      vocalStyle: "Metal",
      pronunciationAccuracy: 95,
      expressiveness: 97,
      bio: "Guttural, thunderous baritone designed for industrial metal, post-hardcore screams, and dark synth rock.",
      isCustom: false,
      technology: "LOCAL_MODEL"
    },
    {
      id: "v-06",
      name: "Carmen Solana",
      gender: "FEMALE",
      vocalRange: "SOPRANO",
      language: "Spagnolo",
      timbreType: "BRIGHT",
      energyLevel: 8.9,
      vocalStyle: "EDM",
      pronunciationAccuracy: 98,
      expressiveness: 95,
      bio: "Scintillating, agile Spanish vocalist equipped with rapid-fire phonetics for energetic latin house, trap, and electro pop.",
      isCustom: false,
      technology: "CLOUD_API"
    },
    {
      id: "v-07",
      name: "Yuki Tanaka",
      gender: "FEMALE",
      vocalRange: "SOPRANO",
      language: "Giapponese",
      timbreType: "BRIGHT",
      energyLevel: 9.2,
      vocalStyle: "Pop",
      pronunciationAccuracy: 99,
      expressiveness: 93,
      bio: "High-octane, perfectly pitched Japanese female vocal synthesizer. Highly optimized for J-Pop, anime soundscapes, and hyperpop.",
      isCustom: false,
      technology: "CLOUD_API"
    },
    {
      id: "v-08",
      name: "Ji-Woo Kim",
      gender: "MALE",
      vocalRange: "TENOR",
      language: "Coreano",
      timbreType: "CLEAN",
      energyLevel: 8.0,
      vocalStyle: "Pop",
      pronunciationAccuracy: 99,
      expressiveness: 95,
      bio: "Pristine, smooth Korean tenor customized for K-Pop vocal charts, electronic duets, and emotional cinematic soundtracks.",
      isCustom: false,
      technology: "CLONE_AUTHORIZED"
    },
    {
      id: "v-09",
      name: "Zoe Dubois",
      gender: "FEMALE",
      vocalRange: "ALTO",
      language: "Francese",
      timbreType: "BREATHY",
      energyLevel: 4.8,
      vocalStyle: "Jazz",
      pronunciationAccuracy: 97,
      expressiveness: 94,
      bio: "Whispery, nostalgic French alto. Perfectly renders classic chanson, bossa nova, cozy lo-fi, and smokey lounge jazz.",
      isCustom: false,
      technology: "CLONE_AUTHORIZED"
    },
    {
      id: "v-10",
      name: "MC Nova",
      gender: "MALE",
      vocalRange: "BARITONE",
      language: "Inglese",
      timbreType: "ROUGH",
      energyLevel: 9.0,
      vocalStyle: "Rap",
      pronunciationAccuracy: 96,
      expressiveness: 98,
      bio: "Aggressive, high-cadence English MC with sharp transients, tailor-made for hip hop beats, drill rhythms, and dark EDM breaks.",
      isCustom: false,
      technology: "LOCAL_MODEL"
    }
  ];

  /**
   * Initialize the Voice Engine Service and restore customized vocalists from JSON
   */
  public static init(): void {
    if (this.isInitialized) return;

    const storageDir = path.dirname(this.filePath);
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    if (fs.existsSync(this.filePath)) {
      try {
        const fileContent = fs.readFileSync(this.filePath, 'utf8');
        this.singers = JSON.parse(fileContent);
      } catch (err) {
        console.warn('[VOICE_ENGINE] Failed to read virtual singers, backing up defaults...', err);
        this.singers = [...this.defaultSingers];
      }
    } else {
      this.singers = [...this.defaultSingers];
      this.saveToDisk();
    }

    this.isInitialized = true;
    console.log(`[VOICE_ENGINE] Voice Engine initialized successfully. Loaded ${this.singers.length} virtual singers.`);
  }

  /**
   * Save the current state of singers to disk
   */
  private static saveToDisk(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.singers, null, 2), 'utf8');
    } catch (err) {
      console.error('[VOICE_ENGINE] Error writing singers to disk:', err);
    }
  }

  /**
   * API: getSingers()
   */
  public static getSingers(): VirtualSinger[] {
    this.init();
    return this.singers;
  }

  /**
   * API: createSinger()
   */
  public static createSinger(singer: Partial<VirtualSinger>): VirtualSinger {
    this.init();
    
    const id = `custom-v-${Date.now()}`;
    const newSinger: VirtualSinger = {
      id,
      name: singer.name || 'Unknown Vocalist',
      gender: singer.gender || 'FEMALE',
      vocalRange: singer.vocalRange || 'SOPRANO',
      language: singer.language || 'English',
      timbreType: singer.timbreType || 'CLEAN',
      energyLevel: singer.energyLevel || 7.0,
      vocalStyle: singer.vocalStyle || 'Pop',
      pronunciationAccuracy: singer.pronunciationAccuracy || 98,
      expressiveness: singer.expressiveness || 95,
      bio: singer.bio || 'Custom created virtual singer.',
      isCustom: true,
      technology: singer.technology || 'LOCAL_MODEL'
    };

    this.singers.push(newSinger);
    this.saveToDisk();
    return newSinger;
  }

  /**
   * API: selectSinger() - selects singer dynamically based on search/filters
   */
  public static selectSinger(criteria: { gender?: string; language?: string; style?: string }): VirtualSinger {
    this.init();
    
    // Attempt match
    let matches = this.singers;
    
    if (criteria.gender) {
      matches = matches.filter(s => s.gender.toLowerCase() === criteria.gender?.toLowerCase());
    }
    if (criteria.language) {
      matches = matches.filter(s => s.language.toLowerCase() === criteria.language?.toLowerCase());
    }
    if (criteria.style) {
      matches = matches.filter(s => s.vocalStyle.toLowerCase() === criteria.style?.toLowerCase());
    }

    // Return first match, or fallback to first overall
    if (matches.length > 0) {
      return matches[0];
    }
    
    // Looser matching if exact fails
    if (criteria.style) {
      const styleMatches = this.singers.filter(s => s.vocalStyle.toLowerCase() === criteria.style?.toLowerCase());
      if (styleMatches.length > 0) return styleMatches[0];
    }

    return this.singers[0];
  }

  /**
   * API: blendVoices() - blends two voices together with customizable ratio
   */
  public static blendVoices(req: VoiceBlendRequest): VirtualSinger {
    this.init();
    const singer1 = this.singers.find(s => s.id === req.singerId1);
    const singer2 = this.singers.find(s => s.id === req.singerId2);

    if (!singer1 || !singer2) {
      throw new Error('One or both singers not found for vocal blending.');
    }

    const r = req.ratio; // ratio of singer2 relative to singer1
    const invR = 1 - r;

    const blendedId = `blend-${singer1.id}-${singer2.id}-${Math.round(r * 100)}`;
    const blendedName = req.newName || `${singer1.name.split(' ')[0]} ${singer2.name.split(' ')[0]}`;
    
    // Decide dominant range, gender, timbre based on threshold
    const dominantGender = r > 0.5 ? singer2.gender : singer1.gender;
    const dominantRange = r > 0.5 ? singer2.vocalRange : singer1.vocalRange;
    const dominantTimbre = r > 0.5 ? singer2.timbreType : singer1.timbreType;

    // Numerical blends
    const blendedEnergy = Math.round((singer1.energyLevel * invR + singer2.energyLevel * r) * 10) / 10;
    const blendedPronunciation = Math.round(singer1.pronunciationAccuracy * invR + singer2.pronunciationAccuracy * r);
    const blendedExpressiveness = Math.round(singer1.expressiveness * invR + singer2.expressiveness * r);

    const blendedSinger: VirtualSinger = {
      id: blendedId,
      name: blendedName,
      gender: dominantGender,
      vocalRange: dominantRange,
      language: singer1.language, // keeps base language
      timbreType: dominantTimbre,
      energyLevel: blendedEnergy,
      vocalStyle: `${singer1.vocalStyle} / ${singer2.vocalStyle}`,
      pronunciationAccuracy: blendedPronunciation,
      expressiveness: blendedExpressiveness,
      bio: `A hybrid virtual vocal model synthesized by blending ${singer1.name} (${Math.round(invR*100)}%) and ${singer2.name} (${Math.round(r*100)}%).`,
      isCustom: true,
      technology: singer1.technology // inherits primary
    };

    // Store in our database
    this.singers.push(blendedSinger);
    this.saveToDisk();

    return blendedSinger;
  }

  /**
   * API: generateChoir() - creates a collective choir configuration of virtual singers
   */
  public static generateChoir(req: ChoirGenerationRequest): VirtualSinger {
    this.init();
    
    const choirId = `choir-${Date.now()}`;
    const choirSinger: VirtualSinger = {
      id: choirId,
      name: req.name || `${req.vocalStyle} Cathedral Choir`,
      gender: "FEMALE", // default placeholder, in a choir we hold multi-gender
      vocalRange: req.harmonyType === 'UNISON' ? 'SOPRANO' : 'TENOR',
      language: req.language,
      timbreType: "CLEAN",
      energyLevel: 8.0,
      vocalStyle: req.vocalStyle,
      pronunciationAccuracy: 98,
      expressiveness: 99,
      bio: `A virtual choir ensemble consisting of ${req.voicesCount} distinct computational voices arranged in ${req.harmonyType.toLowerCase()} harmony.`,
      isCustom: true,
      technology: "LOCAL_MODEL"
    };

    this.singers.push(choirSinger);
    this.saveToDisk();

    return choirSinger;
  }

  /**
   * Delete custom vocalists
   */
  public static deleteSinger(singerId: string): boolean {
    this.init();
    const index = this.singers.findIndex(s => s.id === singerId);
    if (index === -1) return false;
    
    // Don't delete seeded singers
    if (!this.singers[index].isCustom) return false;

    this.singers.splice(index, 1);
    this.saveToDisk();
    return true;
  }
}
