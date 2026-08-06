import fs from 'fs';
import path from 'path';

export interface QualityScoreBreakdown {
  genreFidelity: number;  // 0.0 - 10.0
  grooveScore: number;    // 0.0 - 10.0
  mixingScore: number;    // 0.0 - 10.0
  masteringScore: number; // 0.0 - 10.0
  dynamicScore: number;   // 0.0 - 10.0
  stereoScore: number;    // 0.0 - 10.0
  clarityScore: number;   // 0.0 - 10.0
  creativityScore: number;// 0.0 - 10.0
  overallScore: number;   // 0.0 - 10.0
}

export interface AudioQualityMetrics {
  lufs: number;
  truePeakDbtp: number;
  stereoPhaseCorrelation: number;
  noiseFloorDbfs: number;
}

export interface TrackDnaRecord {
  id: string;
  prompt: string;
  genre: string;
  subgenre: string;
  bpm: number;
  keySignature: string;
  structure: string[];
  instruments: string[];
  swingPct: number;
  chords: string[];
  audioQuality: AudioQualityMetrics;
  scores: QualityScoreBreakdown;
  isBenchmark: boolean;
  createdAt: string;
  usageCount: number;
}

export interface SystemEvolutionStats {
  totalAnalyzedTracks: number;
  benchmarkDnaCount: number;
  averageOverallScore: number;
  genreBreakdown: Record<string, number>;
  categoryScores: QualityScoreBreakdown;
  evolutionGrowthPercent: number;
  topProductions: TrackDnaRecord[];
}

export class MusicDnaLibraryService {
  private static readonly DB_PATH = path.join(process.cwd(), 'data', 'music_brain_db.json');
  private static tracks: TrackDnaRecord[] = [];
  private static isInitialized = false;

  private static ensureInitialized() {
    if (this.isInitialized) return;
    try {
      const dir = path.dirname(this.DB_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.DB_PATH)) {
        const raw = fs.readFileSync(this.DB_PATH, 'utf-8');
        this.tracks = JSON.parse(raw);
      } else {
        // Seed initial reference benchmarks for all major genres
        this.tracks = this.generateSeedBenchmarks();
        this.persist();
      }
    } catch (e) {
      console.error('[MusicDnaLibraryService] Failed to load persistence DB:', e);
      this.tracks = this.generateSeedBenchmarks();
    }
    this.isInitialized = true;
  }

  private static persist() {
    try {
      fs.writeFileSync(this.DB_PATH, JSON.stringify(this.tracks, null, 2), 'utf-8');
    } catch (e) {
      console.error('[MusicDnaLibraryService] Failed to persist DB:', e);
    }
  }

  private static generateSeedBenchmarks(): TrackDnaRecord[] {
    return [
      {
        id: 'dna_house_master_01',
        prompt: 'Classic Deep House four-on-the-floor groove with warm analog rhodes and open hat on off-beat',
        genre: 'House',
        subgenre: 'Deep House',
        bpm: 124,
        keySignature: 'F Minor',
        structure: ['Intro', 'Groove Verse', 'Rhodes Solo', 'Main Drop', 'Outro'],
        instruments: ['Four-on-the-Floor Kick', 'Offbeat Open Hat', 'Analog Rhodes', 'Sub Bass', 'Clap Layer'],
        swingPct: 12.0,
        chords: ['Fm7', 'Dbmaj7', 'Abmaj7', 'Eb7'],
        audioQuality: { lufs: -14.0, truePeakDbtp: -1.0, stereoPhaseCorrelation: 0.94, noiseFloorDbfs: -85.0 },
        scores: {
          genreFidelity: 9.6, grooveScore: 9.5, mixingScore: 9.4, masteringScore: 9.5,
          dynamicScore: 9.3, stereoScore: 9.4, clarityScore: 9.5, creativityScore: 9.2,
          overallScore: 9.45
        },
        isBenchmark: true,
        createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
        usageCount: 42
      },
      {
        id: 'dna_techhouse_master_02',
        prompt: 'Tech House minimal rolling syncopated bassline with tight punchy kick and perc loops',
        genre: 'Tech House',
        subgenre: 'Tech House Minimal',
        bpm: 126,
        keySignature: 'A Minor',
        structure: ['Intro Beat', 'Percussive Build', 'Tech Drop', 'Breakdown', 'Outro'],
        instruments: ['Short Punchy Kick', 'Syncopated Bassline', 'Percussion Loops', 'Minimal Vocal Chop'],
        swingPct: 15.0,
        chords: ['Am7', 'Fmaj7', 'Cmaj7', 'Em7'],
        audioQuality: { lufs: -13.8, truePeakDbtp: -1.0, stereoPhaseCorrelation: 0.92, noiseFloorDbfs: -82.0 },
        scores: {
          genreFidelity: 9.7, grooveScore: 9.8, mixingScore: 9.6, masteringScore: 9.5,
          dynamicScore: 9.4, stereoScore: 9.3, clarityScore: 9.7, creativityScore: 9.4,
          overallScore: 9.55
        },
        isBenchmark: true,
        createdAt: new Date(Date.now() - 86400000 * 8).toISOString(),
        usageCount: 58
      },
      {
        id: 'dna_melodic_master_03',
        prompt: 'Melodic House organic lush pads with soaring synth lead and progressive drop',
        genre: 'Melodic House',
        subgenre: 'Melodic Techno & House',
        bpm: 123,
        keySignature: 'F Minor',
        structure: ['Atmospheric Intro', 'Melodic Verse', 'Crescendo Build', 'Euphoric Drop', 'Outro'],
        instruments: ['Kick', 'Organic Shaker', 'Lush Pad Array', 'Melodic Synth Lead', 'Sub Bass'],
        swingPct: 8.0,
        chords: ['Fm9', 'Abmaj9', 'Dbmaj9', 'Bbm9'],
        audioQuality: { lufs: -14.1, truePeakDbtp: -1.0, stereoPhaseCorrelation: 0.96, noiseFloorDbfs: -88.0 },
        scores: {
          genreFidelity: 9.8, grooveScore: 9.3, mixingScore: 9.7, masteringScore: 9.6,
          dynamicScore: 9.6, stereoScore: 9.8, clarityScore: 9.6, creativityScore: 9.7,
          overallScore: 9.64
        },
        isBenchmark: true,
        createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
        usageCount: 71
      },
      {
        id: 'dna_afrohouse_master_04',
        prompt: 'Afro House organic congas bongos polyrhythms with tribal chant and deep bass',
        genre: 'Afro House',
        subgenre: 'Ancestral Afro House',
        bpm: 120,
        keySignature: 'D Minor',
        structure: ['Percussion Intro', 'Tribal Groove', 'Chant Bridge', 'Polyrhythmic Drop', 'Outro'],
        instruments: ['Congas', 'Bongos', 'Afro Shakers', 'Tribal Chant', 'Deep Organ Bass'],
        swingPct: 22.0,
        chords: ['Dm9', 'Gm7', 'Bbmaj7', 'A7alt'],
        audioQuality: { lufs: -14.0, truePeakDbtp: -1.0, stereoPhaseCorrelation: 0.95, noiseFloorDbfs: -84.0 },
        scores: {
          genreFidelity: 9.9, grooveScore: 9.9, mixingScore: 9.5, masteringScore: 9.5,
          dynamicScore: 9.5, stereoScore: 9.6, clarityScore: 9.5, creativityScore: 9.8,
          overallScore: 9.66
        },
        isBenchmark: true,
        createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
        usageCount: 63
      },
      {
        id: 'dna_progressive_master_05',
        prompt: 'Progressive House driving 16th bassline with gradual evolution atmospheric risers',
        genre: 'Progressive House',
        subgenre: 'Progressive EDM',
        bpm: 128,
        keySignature: 'C Minor',
        structure: ['Driving Intro', 'Layered Build 1', 'Subtle Peak', 'Main Drop', 'Outro'],
        instruments: ['Solid Kick', '16th Driving Bassline', 'Pluck Arpeggio', 'White Noise Sweeps'],
        swingPct: 5.0,
        chords: ['Cm7', 'Abmaj7', 'Fm7', 'Bb7'],
        audioQuality: { lufs: -13.9, truePeakDbtp: -1.0, stereoPhaseCorrelation: 0.93, noiseFloorDbfs: -86.0 },
        scores: {
          genreFidelity: 9.5, grooveScore: 9.4, mixingScore: 9.6, masteringScore: 9.6,
          dynamicScore: 9.7, stereoScore: 9.5, clarityScore: 9.6, creativityScore: 9.3,
          overallScore: 9.52
        },
        isBenchmark: true,
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        usageCount: 39
      }
    ];
  }

  public static recallOptimalDna(prompt: string, genre: string): {
    recalledDna: TrackDnaRecord | null;
    isMemoryMatch: boolean;
    matchConfidence: number;
    appliedFeatures: string[];
  } {
    this.ensureInitialized();
    const query = (prompt + ' ' + genre).toLowerCase();

    let bestMatch: TrackDnaRecord | null = null;
    let highestScore = 0;

    for (const track of this.tracks) {
      if (!track.isBenchmark) continue;
      let score = 0;

      // Genre exact/partial match
      if (query.includes(track.genre.toLowerCase())) score += 40;
      if (query.includes(track.subgenre.toLowerCase())) score += 20;

      // Keywords match
      const keywords = track.prompt.toLowerCase().split(' ');
      for (const kw of keywords) {
        if (kw.length > 3 && query.includes(kw)) {
          score += 5;
        }
      }

      if (score > highestScore) {
        highestScore = score;
        bestMatch = track;
      }
    }

    if (bestMatch && highestScore >= 30) {
      bestMatch.usageCount += 1;
      this.persist();

      return {
        recalledDna: bestMatch,
        isMemoryMatch: true,
        matchConfidence: Math.min(99, Math.round(70 + highestScore * 0.3)),
        appliedFeatures: [
          `Matched Benchmark DNA #${bestMatch.id}`,
          `Inherited ${bestMatch.swingPct}% Swing & Precision Timing Grid`,
          `Applied Key Signature ${bestMatch.keySignature} & Harmonic Progression (${bestMatch.chords.join(' -> ')})`,
          `Configured ${bestMatch.instruments.length} Layered Instruments (${bestMatch.instruments.slice(0, 3).join(', ')})`
        ]
      };
    }

    return {
      recalledDna: null,
      isMemoryMatch: false,
      matchConfidence: 0,
      appliedFeatures: ['New Musical DNA initialized. Learning parameters for this prompt...']
    };
  }

  public static registerGeneration(record: Omit<TrackDnaRecord, 'id' | 'createdAt' | 'usageCount' | 'isBenchmark'>): TrackDnaRecord {
    this.ensureInitialized();

    const id = `dna_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const isBenchmark = record.scores.overallScore >= 8.5;

    const fullRecord: TrackDnaRecord = {
      ...record,
      id,
      isBenchmark,
      createdAt: new Date().toISOString(),
      usageCount: 1
    };

    this.tracks.unshift(fullRecord);
    this.persist();
    return fullRecord;
  }

  public static searchDnaLibrary(params: {
    query?: string;
    genre?: string;
    minScore?: number;
    onlyBenchmarks?: boolean;
    limit?: number;
  }): TrackDnaRecord[] {
    this.ensureInitialized();

    return this.tracks.filter(t => {
      if (params.genre && params.genre !== 'All' && t.genre.toLowerCase() !== params.genre.toLowerCase()) {
        return false;
      }
      if (params.minScore && t.scores.overallScore < params.minScore) {
        return false;
      }
      if (params.onlyBenchmarks && !t.isBenchmark) {
        return false;
      }
      if (params.query) {
        const q = params.query.toLowerCase();
        const match = t.prompt.toLowerCase().includes(q) ||
                      t.genre.toLowerCase().includes(q) ||
                      t.subgenre.toLowerCase().includes(q) ||
                      t.keySignature.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    }).slice(0, params.limit || 50);
  }

  public static getSystemEvolutionStats(): SystemEvolutionStats {
    this.ensureInitialized();

    const total = this.tracks.length;
    const benchmarks = this.tracks.filter(t => t.isBenchmark);

    const genreMap: Record<string, number> = {};
    let sumGenre = 0, sumGroove = 0, sumMix = 0, sumMaster = 0, sumDyn = 0, sumStereo = 0, sumClar = 0, sumCreat = 0, sumOverall = 0;

    for (const t of this.tracks) {
      genreMap[t.genre] = (genreMap[t.genre] || 0) + 1;
      sumGenre += t.scores.genreFidelity;
      sumGroove += t.scores.grooveScore;
      sumMix += t.scores.mixingScore;
      sumMaster += t.scores.masteringScore;
      sumDyn += t.scores.dynamicScore;
      sumStereo += t.scores.stereoScore;
      sumClar += t.scores.clarityScore;
      sumCreat += t.scores.creativityScore;
      sumOverall += t.scores.overallScore;
    }

    const count = Math.max(1, total);

    return {
      totalAnalyzedTracks: total,
      benchmarkDnaCount: benchmarks.length,
      averageOverallScore: Number((sumOverall / count).toFixed(2)),
      genreBreakdown: genreMap,
      categoryScores: {
        genreFidelity: Number((sumGenre / count).toFixed(2)),
        grooveScore: Number((sumGroove / count).toFixed(2)),
        mixingScore: Number((sumMix / count).toFixed(2)),
        masteringScore: Number((sumMaster / count).toFixed(2)),
        dynamicScore: Number((sumDyn / count).toFixed(2)),
        stereoScore: Number((sumStereo / count).toFixed(2)),
        clarityScore: Number((sumClar / count).toFixed(2)),
        creativityScore: Number((sumCreat / count).toFixed(2)),
        overallScore: Number((sumOverall / count).toFixed(2))
      },
      evolutionGrowthPercent: Number((12.4 + benchmarks.length * 1.5).toFixed(1)),
      topProductions: benchmarks.sort((a, b) => b.scores.overallScore - a.scores.overallScore).slice(0, 5)
    };
  }
}
