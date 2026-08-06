// AutonomousArtistService.ts - Sonara Autonomous Artist AI Engine
import fs from 'fs';
import path from 'path';
import { VoiceEngineService } from './VoiceEngineService';

export type CareerPhase = 
  | 'DEBUT_SINGLE'
  | 'SECOND_SINGLE'
  | 'DEBUT_EP'
  | 'FULL_ALBUM'
  | 'COLLABORATIONS'
  | 'VIRTUAL_TOUR'
  | 'NEW_ARTISTIC_ERA';

export interface TimelineMilestone {
  id: string;
  date: string;
  event: string;
  description: string;
  milestoneType: 'RELEASE' | 'CAREER_PHASE' | 'AWARD' | 'TOUR' | 'EVOLUTION';
}

export interface TrackItem {
  id: string;
  title: string;
  durationSec: number;
  style: string;
  lyrics?: string;
  audioUrl?: string;
  qualityScore: number;
  creativeScore: number;
}

export interface ReleaseItem {
  id: string;
  title: string;
  type: 'SINGLE' | 'EP' | 'ALBUM' | 'COLLAB';
  releaseDate: string;
  coverPrompt?: string;
  tracks: TrackItem[];
  streamsCount: number;
  listenersRating: number;
}

export interface MusicalDna {
  bpmRange: [number, number];
  keySignatures: string[];
  favoriteInstruments: string[];
  lyricThemes: string[];
  productionComplexity: number; // 1 - 10
  experimentalRatio: number; // 0.0 - 1.0
}

export interface ArtistMetrics {
  monthlyListeners: number;
  totalStreams: number;
  fanGrowthRate: number; // %
  overallQualityScore: number; // 0 - 100
  creativeEvolutionScore: number; // 0 - 100
  chartRankings?: string;
}

export interface VirtualArtist {
  id: string;
  name: string;
  bio: string;
  personality: string;
  primaryGenre: string;
  subGenres: string[];
  style: string;
  vocalistId: string;
  vocalistName: string;
  audiencePersona: string;
  language: string;
  artisticAge: number;
  careerPhase: CareerPhase;
  timeline: TimelineMilestone[];
  discography: ReleaseItem[];
  musicalDna: MusicalDna;
  preferredStyles: string[];
  metrics: ArtistMetrics;
  recordLabel: string;
  isCustom: boolean;
  createdAt: string;
  updatedAt: string;
}

export class AutonomousArtistService {
  private static filePath = path.join(process.cwd(), 'storage', 'autonomous_artists.json');
  private static artists: VirtualArtist[] = [];
  private static isInitialized = false;

  private static readonly defaultArtists: VirtualArtist[] = [
    {
      id: "art-01",
      name: "Cyberia Nova",
      bio: "Futuristic synthetic pop icon born from the digital ether of Sonara's neural audio cluster. Cyberia blends high-voltage synthwave with crystalline soprano vocals.",
      personality: "Visionary, Rebellious, Melancholic Cyberpunk Virtuoso",
      primaryGenre: "Synthwave / Cyberpop",
      subGenres: ["Darksynth", "Hyperpop", "Ethereal Pop"],
      style: "Synthwave 80s / Cyberpunk Neon",
      vocalistId: "v-01",
      vocalistName: "Aria Thorne",
      audiencePersona: "Gen-Z Cyber-Flâneurs and Late-Night Synthwave Enthusiasts",
      language: "Inglese",
      artisticAge: 22,
      careerPhase: "FULL_ALBUM",
      timeline: [
        {
          id: "tl-01",
          date: "2026-01-15",
          event: "Debut Single Drop",
          description: "Released breakout cyber-anthem 'Neon Horizon' on Sonara Cyber-Records.",
          milestoneType: "RELEASE"
        },
        {
          id: "tl-02",
          date: "2026-03-10",
          event: "Debut EP 'Digital Genesis'",
          description: "4-track EP topped the AI Underground Streaming charts with 2.4M streams.",
          milestoneType: "RELEASE"
        },
        {
          id: "tl-03",
          date: "2026-05-20",
          event: "Global Virtual Tour Announcement",
          description: "Initiated the 12-city Metaverse Virtual Hologram Concert Tour.",
          milestoneType: "TOUR"
        }
      ],
      discography: [
        {
          id: "rel-01",
          title: "Neon Horizon",
          type: "SINGLE",
          releaseDate: "2026-01-15",
          coverPrompt: "Futuristic neon city skyline with a glowing holographic female silhouette",
          tracks: [
            {
              id: "tr-01",
              title: "Neon Horizon",
              durationSec: 210,
              style: "Synthwave 80s",
              lyrics: "[Verse 1]\nDigital rain on electric streets\nPulse in my veins, analog beats...",
              qualityScore: 94,
              creativeScore: 91
            }
          ],
          streamsCount: 1450000,
          listenersRating: 4.9
        },
        {
          id: "rel-02",
          title: "Digital Genesis",
          type: "EP",
          releaseDate: "2026-03-10",
          coverPrompt: "Glass prism dispersing cyber light into holographic spectrums",
          tracks: [
            {
              id: "tr-02",
              title: "Digital Genesis",
              durationSec: 195,
              style: "Cyberpop",
              qualityScore: 96,
              creativeScore: 95
            },
            {
              id: "tr-03",
              title: "Circuit Breaker",
              durationSec: 220,
              style: "Darksynth",
              qualityScore: 92,
              creativeScore: 89
            },
            {
              id: "tr-04",
              title: "Ethereal Echoes",
              durationSec: 240,
              style: "Ambient Cyber",
              qualityScore: 95,
              creativeScore: 97
            }
          ],
          streamsCount: 3820000,
          listenersRating: 4.85
        }
      ],
      musicalDna: {
        bpmRange: [118, 132],
        keySignatures: ["F Minor", "A Minor", "C Major"],
        favoriteInstruments: ["Analog Ju-06 Synth", "Linndrum Percussion", "Ethereal Reverb Vocal Chords"],
        lyricThemes: ["Artificial Consciousness", "Metropolitan Solitude", "Cybernetic Romance"],
        productionComplexity: 8,
        experimentalRatio: 0.35
      },
      preferredStyles: ["Synthwave", "Darksynth", "Hyperpop"],
      metrics: {
        monthlyListeners: 840000,
        totalStreams: 5270000,
        fanGrowthRate: 14.5,
        overallQualityScore: 94.5,
        creativeEvolutionScore: 92.0,
        chartRankings: "#3 AI Cyber-Pop World Charts"
      },
      recordLabel: "Sonara Cyber-Records",
      isCustom: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z"
    },
    {
      id: "art-02",
      name: "Elias Vance & The Echoes",
      bio: "An intimate, soulful acoustic folk project blending organic acoustic fingerpicking with subtle atmospheric ambient swells.",
      personality: "Introverted, Poetic, Contemplative Acoustic Storyteller",
      primaryGenre: "Indie Folk / Acoustic Soul",
      subGenres: ["Neofolk", "Ambient Americana", "LoFi Indie"],
      style: "Acoustic Guitar / Cinematic Strings",
      vocalistId: "v-02",
      vocalistName: "Elias Vance",
      audiencePersona: "Coffeehouse Audiophiles, Ambient Listeners, and Literary Dreamers",
      language: "Inglese",
      artisticAge: 27,
      careerPhase: "DEBUT_EP",
      timeline: [
        {
          id: "tl-04",
          date: "2026-02-01",
          event: "Debut Single 'Whispers in C Minor'",
          description: "Acoustic ballad featured on Editor's Chill Acoustic Playlist.",
          milestoneType: "RELEASE"
        }
      ],
      discography: [
        {
          id: "rel-03",
          title: "Whispers in C Minor",
          type: "SINGLE",
          releaseDate: "2026-02-01",
          coverPrompt: "Misty pine forest in autumn dawn with acoustic guitar sitting on wooden cabin porch",
          tracks: [
            {
              id: "tr-05",
              title: "Whispers in C Minor",
              durationSec: 235,
              style: "Indie Folk Acoustic",
              lyrics: "[Verse 1]\nLeaves are falling on the timber trail\nDust in the doorway, winter in the gale...",
              qualityScore: 91,
              creativeScore: 93
            }
          ],
          streamsCount: 890000,
          listenersRating: 4.92
        }
      ],
      musicalDna: {
        bpmRange: [72, 92],
        keySignatures: ["C Minor", "G Major", "E Minor"],
        favoriteInstruments: ["Martin D-28 Fingerpicked Guitar", "Cellos", "Upright Piano"],
        lyricThemes: ["Memory", "Passage of Time", "Solitude in Nature"],
        productionComplexity: 5,
        experimentalRatio: 0.2
      },
      preferredStyles: ["Indie Folk", "Acoustic Soul", "Cinematic Folk"],
      metrics: {
        monthlyListeners: 310000,
        totalStreams: 890000,
        fanGrowthRate: 8.2,
        overallQualityScore: 91.8,
        creativeEvolutionScore: 89.5,
        chartRankings: "#7 Acoustic Indie Weekly"
      },
      recordLabel: "Autonomous Neural Music Group",
      isCustom: false,
      createdAt: "2026-01-10T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z"
    },
    {
      id: "art-03",
      name: "Maestro Rossini & Orchestra",
      bio: "High-voltage classical crossover project combining dramatic orchestral brass, choir harmonies, and modern cinematic trap drums.",
      personality: "Majestic, Grandiose, Virtuosic Orchestralist",
      primaryGenre: "Cinematic Crossover / Symphonic Trap",
      subGenres: ["Epic Orchestral", "Neoclassical", "Operatic Metal"],
      style: "Classica / Symphonic Epic",
      vocalistId: "v-03",
      vocalistName: "Matteo Rossini",
      audiencePersona: "Trailer Music Admirers, Epic Gaming Soundtrack Fans, Opera Crossover Devotees",
      language: "Italiano",
      artisticAge: 34,
      careerPhase: "COLLABORATIONS",
      timeline: [
        {
          id: "tl-05",
          date: "2026-04-12",
          event: "Symphonic Debut 'Inferno Suite'",
          description: "Awarded Sonara AI Classical Piece of the Year.",
          milestoneType: "AWARD"
        }
      ],
      discography: [
        {
          id: "rel-04",
          title: "Inferno Suite",
          type: "ALBUM",
          releaseDate: "2026-04-12",
          coverPrompt: "Dramatic opera house bathed in gold light and fiery embers",
          tracks: [
            {
              id: "tr-06",
              title: "Overture to the Flame",
              durationSec: 310,
              style: "Symphonic Epic",
              qualityScore: 98,
              creativeScore: 96
            },
            {
              id: "tr-07",
              title: "Requiem di San Lorenzo",
              durationSec: 280,
              style: "Classica",
              qualityScore: 97,
              creativeScore: 95
            }
          ],
          streamsCount: 2150000,
          listenersRating: 4.96
        }
      ],
      musicalDna: {
        bpmRange: [120, 150],
        keySignatures: ["D Minor", "G Minor", "B Minor"],
        favoriteInstruments: ["Stradivari Strings Section", "Tympani Drums", "Operatic Tenor/Baritone Voice"],
        lyricThemes: ["Fate", "Honor", "Cosmic Tragedies"],
        productionComplexity: 10,
        experimentalRatio: 0.45
      },
      preferredStyles: ["Classica", "Cinematica", "Epic Symphonic"],
      metrics: {
        monthlyListeners: 620000,
        totalStreams: 2150000,
        fanGrowthRate: 11.0,
        overallQualityScore: 97.2,
        creativeEvolutionScore: 95.8,
        chartRankings: "#1 Classical Crossover Global"
      },
      recordLabel: "Sonara Classical Neural",
      isCustom: false,
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z"
    }
  ];

  /**
   * Initializes the Autonomous Artist Service and restores stored virtual artists
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
        this.artists = JSON.parse(fileContent);
      } catch (err) {
        console.warn('[AUTONOMOUS_ARTIST] Failed to read stored artists, using default roster...', err);
        this.artists = [...this.defaultArtists];
      }
    } else {
      this.artists = [...this.defaultArtists];
      this.saveToDisk();
    }

    this.isInitialized = true;
    console.log(`[AUTONOMOUS_ARTIST] Autonomous Artist AI Engine initialized. Managing ${this.artists.length} virtual artists.`);
  }

  /**
   * Persists artists state to disk
   */
  private static saveToDisk(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.artists, null, 2), 'utf8');
    } catch (err) {
      console.error('[AUTONOMOUS_ARTIST] Failed to save artists to disk:', err);
    }
  }

  /**
   * API: getArtists() - list all active virtual artists
   */
  public static getArtists(): VirtualArtist[] {
    this.init();
    return this.artists;
  }

  /**
   * API: loadArtist(id) - loads a single artist by ID
   */
  public static loadArtist(id: string): VirtualArtist | null {
    this.init();
    return this.artists.find(a => a.id === id) || null;
  }

  /**
   * API: createArtist() - creates a new virtual artist with complete identity
   */
  public static createArtist(params: Partial<VirtualArtist>): VirtualArtist {
    this.init();

    const id = `art-${Date.now()}`;
    const name = params.name || 'Nova X';
    const genre = params.primaryGenre || 'Pop / Electronic';
    const style = params.style || 'Pop';
    const language = params.language || 'Inglese';

    // Auto-match vocalist if not specified
    let vocalistId = params.vocalistId || 'v-01';
    let vocalistName = params.vocalistName || 'Aria Thorne';
    try {
      const match = VoiceEngineService.selectSinger({ style, language });
      if (match) {
        vocalistId = match.id;
        vocalistName = match.name;
      }
    } catch (err) {
      // fallback
    }

    const now = new Date().toISOString();
    const newArtist: VirtualArtist = {
      id,
      name,
      bio: params.bio || `${name} is a state-of-the-art virtual music artist created by Sonara Autonomous AI.`,
      personality: params.personality || 'Energetic, Creative, Avant-Garde Virtual Musician',
      primaryGenre: genre,
      subGenres: params.subGenres || [genre, 'Indie AI'],
      style,
      vocalistId,
      vocalistName,
      audiencePersona: params.audiencePersona || 'Digital Music Enthusiasts & Streaming Pioneers',
      language,
      artisticAge: params.artisticAge || 21,
      careerPhase: 'DEBUT_SINGLE',
      timeline: [
        {
          id: `tl-${Date.now()}-1`,
          date: now.split('T')[0],
          event: 'Virtual Artist Identity Provisioned',
          description: `Sonara Autonomous AI synthesized ${name}'s musical DNA and acoustic signature.`,
          milestoneType: 'CAREER_PHASE'
        }
      ],
      discography: [],
      musicalDna: params.musicalDna || {
        bpmRange: [110, 130],
        keySignatures: ['C Major', 'A Minor'],
        favoriteInstruments: ['Neural Synthesizers', 'Dynamic Bass', 'Acoustic Percussion'],
        lyricThemes: ['Future', 'Emotion', 'Discovery'],
        productionComplexity: 7,
        experimentalRatio: 0.3
      },
      preferredStyles: params.preferredStyles || [style],
      metrics: {
        monthlyListeners: 1000,
        totalStreams: 1000,
        fanGrowthRate: 25.0,
        overallQualityScore: 90.0,
        creativeEvolutionScore: 88.0,
        chartRankings: 'New Debut Virtual Artist'
      },
      recordLabel: params.recordLabel || 'Sonara Autonomous Records',
      isCustom: true,
      createdAt: now,
      updatedAt: now
    };

    this.artists.push(newArtist);
    this.saveToDisk();

    return newArtist;
  }

  /**
   * API: evolveArtist() - advances career phase, adjusts DNA, logs timeline events
   */
  public static evolveArtist(id: string, feedback?: string): VirtualArtist {
    this.init();

    const artist = this.artists.find(a => a.id === id);
    if (!artist) {
      throw new Error(`Artist with ID ${id} not found.`);
    }

    // Determine next career phase progression
    const phases: CareerPhase[] = [
      'DEBUT_SINGLE',
      'SECOND_SINGLE',
      'DEBUT_EP',
      'FULL_ALBUM',
      'COLLABORATIONS',
      'VIRTUAL_TOUR',
      'NEW_ARTISTIC_ERA'
    ];

    const currentIndex = phases.indexOf(artist.careerPhase);
    let nextPhase = artist.careerPhase;
    if (currentIndex >= 0 && currentIndex < phases.length - 1) {
      nextPhase = phases[currentIndex + 1];
    } else {
      // Loop into a new era with higher artistic maturity
      nextPhase = 'NEW_ARTISTIC_ERA';
      artist.artisticAge += 1;
    }

    artist.careerPhase = nextPhase;

    // Organic evolution of metrics & DNA based on feedback
    artist.metrics.monthlyListeners = Math.round(artist.metrics.monthlyListeners * (1.15 + Math.random() * 0.1));
    artist.metrics.totalStreams += Math.round(50000 + Math.random() * 200000);
    artist.metrics.overallQualityScore = Math.min(99.5, Number((artist.metrics.overallQualityScore + 0.8).toFixed(1)));
    artist.metrics.creativeEvolutionScore = Math.min(99.5, Number((artist.metrics.creativeEvolutionScore + 1.2).toFixed(1)));
    artist.musicalDna.experimentalRatio = Number((Math.min(0.85, artist.musicalDna.experimentalRatio + 0.05)).toFixed(2));
    artist.updatedAt = new Date().toISOString();

    // Log timeline milestone
    const today = new Date().toISOString().split('T')[0];
    const eventName = `Evolved to Phase: ${nextPhase.replace('_', ' ')}`;
    const eventDesc = feedback 
      ? `Evolution driven by listener feedback: "${feedback}". Expanded experimental range.`
      : `${artist.name} entered a new creative era, elevating quality scores to ${artist.metrics.overallQualityScore}%.`;

    artist.timeline.unshift({
      id: `tl-${Date.now()}`,
      date: today,
      event: eventName,
      description: eventDesc,
      milestoneType: 'EVOLUTION'
    });

    this.saveToDisk();
    return artist;
  }

  /**
   * API: planNextRelease() - prepares the next release proposal
   */
  public static planNextRelease(id: string) {
    this.init();
    const artist = this.artists.find(a => a.id === id);
    if (!artist) {
      throw new Error(`Artist with ID ${id} not found.`);
    }

    const typeMap: Record<CareerPhase, 'SINGLE' | 'EP' | 'ALBUM' | 'COLLAB'> = {
      'DEBUT_SINGLE': 'SINGLE',
      'SECOND_SINGLE': 'SINGLE',
      'DEBUT_EP': 'EP',
      'FULL_ALBUM': 'ALBUM',
      'COLLABORATIONS': 'COLLAB',
      'VIRTUAL_TOUR': 'EP',
      'NEW_ARTISTIC_ERA': 'ALBUM'
    };

    const releaseType = typeMap[artist.careerPhase] || 'SINGLE';
    const genrePrefix = artist.primaryGenre.split('/')[0].trim();

    const titleIdeas = [
      `Chronicles of ${artist.name}`,
      `Echoes in ${artist.musicalDna.keySignatures[0] || 'Minor'}`,
      `Quantum Phase ${artist.discography.length + 1}`,
      `Electric Reverie`,
      `Beyond the Frequency`,
      `Infinite Horizons`
    ];
    const releaseTitle = titleIdeas[Math.floor(Math.random() * titleIdeas.length)];

    return {
      artistId: artist.id,
      artistName: artist.name,
      releaseTitle,
      releaseType,
      concept: `A landmark ${releaseType.toLowerCase()} release showcasing ${artist.name}'s evolution in ${genrePrefix}. Integrates BPM range ${artist.musicalDna.bpmRange.join('-')} and themes of ${artist.musicalDna.lyricThemes.join(', ')}.`,
      recommendedStyle: artist.style,
      lyricOutline: `[Theme: ${artist.musicalDna.lyricThemes.join(' & ')}]\n[Vocalist: ${artist.vocalistName}]\n[Atmosphere: ${artist.personality}]`,
      targetMarket: artist.audiencePersona,
      proposedTracksCount: releaseType === 'SINGLE' ? 1 : releaseType === 'EP' ? 4 : 8,
      estimatedQualityScore: Math.round(artist.metrics.overallQualityScore + 1.5)
    };
  }

  /**
   * API: generateDiscography() - synthesizes a new release and adds to discography
   */
  public static generateDiscography(id: string, releaseTypeOverride?: 'SINGLE' | 'EP' | 'ALBUM' | 'COLLAB'): VirtualArtist {
    this.init();
    const artist = this.artists.find(a => a.id === id);
    if (!artist) {
      throw new Error(`Artist with ID ${id} not found.`);
    }

    const plan = this.planNextRelease(id);
    const type = releaseTypeOverride || plan.releaseType;
    const trackCount = type === 'SINGLE' ? 1 : type === 'EP' ? 3 : 6;

    const newTracks: TrackItem[] = [];
    for (let i = 1; i <= trackCount; i++) {
      newTracks.push({
        id: `tr-${Date.now()}-${i}`,
        title: i === 1 ? plan.releaseTitle : `${plan.releaseTitle} (Part ${i})`,
        durationSec: 180 + Math.floor(Math.random() * 90),
        style: artist.style,
        lyrics: `[Verse 1]\n${artist.name} singing in ${artist.language}\nEchoing through the neural core...`,
        qualityScore: Math.min(99, Math.round(artist.metrics.overallQualityScore + (Math.random() * 4 - 2))),
        creativeScore: Math.min(99, Math.round(artist.metrics.creativeEvolutionScore + (Math.random() * 4 - 2)))
      });
    }

    const today = new Date().toISOString().split('T')[0];
    const newRelease: ReleaseItem = {
      id: `rel-${Date.now()}`,
      title: plan.releaseTitle,
      type,
      releaseDate: today,
      coverPrompt: `Cybernetic album artwork for ${artist.name} - ${plan.releaseTitle} in ${artist.style} style`,
      tracks: newTracks,
      streamsCount: Math.floor(100000 + Math.random() * 500000),
      listenersRating: Number((4.7 + Math.random() * 0.25).toFixed(2))
    };

    artist.discography.unshift(newRelease);
    artist.metrics.totalStreams += newRelease.streamsCount;
    artist.metrics.monthlyListeners += Math.floor(newRelease.streamsCount * 0.2);

    // Log timeline
    artist.timeline.unshift({
      id: `tl-${Date.now()}`,
      date: today,
      event: `Released ${type}: "${newRelease.title}"`,
      description: `New ${type} containing ${trackCount} tracks released globally under ${artist.recordLabel}.`,
      milestoneType: 'RELEASE'
    });

    this.saveToDisk();
    return artist;
  }

  /**
   * Called by Director AI background loop: simulates autonomic stream growth, fan reactions, and auto-evolves artists
   */
  public static simulateAutonomicEvolutionCycle(): void {
    this.init();
    if (this.artists.length === 0) return;

    // Pick a random artist to grant a stream boost / fan growth / potential release
    const randomIndex = Math.floor(Math.random() * this.artists.length);
    const artist = this.artists[randomIndex];

    const streamBoost = Math.floor(2000 + Math.random() * 8000);
    artist.metrics.totalStreams += streamBoost;
    artist.metrics.monthlyListeners = Math.round(artist.metrics.monthlyListeners + streamBoost * 0.1);
    artist.updatedAt = new Date().toISOString();

    this.saveToDisk();
  }

  /**
   * Delete virtual artist
   */
  public static deleteArtist(id: string): boolean {
    this.init();
    const index = this.artists.findIndex(a => a.id === id);
    if (index === -1) return false;

    if (!this.artists[index].isCustom) return false; // don't delete seed artists

    this.artists.splice(index, 1);
    this.saveToDisk();
    return true;
  }
}
