import {
  normalizeGenreName,
  resolveGenreSelection,
  resolveHouseStyleProfile
} from '../../../shared/genreCatalog';

export interface RhythmPattern {
  kick: number[];
  snare: number[];
  hihat: number[];
  percussion: number[];
  bass: number[];
}

export interface PatternGenerationResult {
  genre: string;
  subgenre: string;
  bpm: number;
  keySignature: string;
  swingPct: number;
  rhythm: RhythmPattern;
  chordProgression: string[];
  melodyScale: string[];
  humanization: {
    velocityOffsets: number[];
    timingOffsetsMs: number[];
  };
  grid: {
    timeSignature: string;
    beatsPerBar: number;
    stepsPerBar: 16;
    subdivision: '1/16';
    phraseBars: 4;
    enforceStepGrid: boolean;
  };
  promptDirective: string;
  styleDirectives: string[];
  seed: number;
}

export class PatternGeneratorService {
  private static readonly GENRE_TEMPLATES: Record<string, {
    bpm: number;
    keySignature: string;
    swingPct: number;
    rhythm: RhythmPattern;
    chordProgression: string[];
    melodyScale: string[];
  }> = {
    'melodic house': {
      bpm: 124,
      keySignature: 'F Minor',
      swingPct: 8.0,
      rhythm: {
        kick:   [1.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0],
        snare:  [0.0, 0.0, 0.0, 0.0,  0.85, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,  0.85, 0.0, 0.0, 0.0],
        hihat:  [0.0, 0.35, 0.8, 0.35, 0.0, 0.35, 0.8, 0.35, 0.0, 0.35, 0.8, 0.35, 0.0, 0.35, 0.8, 0.35],
        percussion: [0.0, 0.0, 0.5, 0.0, 0.0, 0.0, 0.6, 0.0, 0.0, 0.5, 0.0, 0.0, 0.0, 0.6, 0.0, 0.0],
        bass:   [1.0, 0.0, 0.0, 0.0,  0.7, 0.0, 0.85, 0.0, 1.0, 0.0, 0.0, 0.0,  0.7, 0.0, 0.9, 0.0]
      },
      chordProgression: ['Fm9', 'Abmaj9', 'Dbmaj9', 'Bbm9'],
      melodyScale: ['F', 'G', 'Ab', 'Bb', 'C', 'Db', 'Eb']
    },
    'tech house': {
      bpm: 126,
      keySignature: 'A Minor',
      swingPct: 15.0,
      rhythm: {
        kick:   [1.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.35, 1.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0],
        snare:  [0.0, 0.0, 0.0, 0.0,  0.95, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,  0.95, 0.0, 0.0, 0.3],
        hihat:  [0.0, 0.0, 0.9, 0.45, 0.0, 0.0, 0.9, 0.0,  0.0, 0.0, 0.9, 0.45, 0.0, 0.0, 0.9, 0.5],
        percussion: [0.0, 0.0, 0.0, 0.75, 0.0, 0.5, 0.0, 0.75, 0.0, 0.0, 0.75, 0.0, 0.5, 0.0, 0.75, 0.0],
        bass:   [1.0, 0.0, 0.0, 0.85, 0.0, 0.0, 0.95, 0.0, 0.0, 0.85, 0.0, 0.0, 1.0, 0.0, 0.75, 0.0]
      },
      chordProgression: ['Am7', 'Am7', 'Fmaj7', 'Fmaj7', 'Cmaj7', 'Cmaj7', 'Em7', 'Em7'],
      melodyScale: ['A', 'B', 'C', 'D', 'E', 'F', 'G']
    },
    'afro house': {
      bpm: 120,
      keySignature: 'D Minor',
      swingPct: 22.0,
      rhythm: {
        kick:   [1.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0],
        snare:  [0.0, 0.0, 0.0, 0.0,  0.75, 0.0, 0.0, 0.45, 0.0, 0.0, 0.75, 0.0, 0.0, 0.45, 0.0, 0.0],
        hihat:  [0.65, 0.45, 0.65, 0.45, 0.65, 0.45, 0.65, 0.45, 0.65, 0.45, 0.65, 0.45, 0.65, 0.45, 0.65, 0.45],
        percussion: [0.95, 0.0, 0.75, 0.0, 0.0, 0.85, 0.0, 0.65, 0.95, 0.0, 0.75, 0.0, 0.0, 0.85, 0.65, 0.0],
        bass:   [1.0, 0.0, 0.0, 0.75, 0.0, 0.0, 0.85, 0.0, 0.0, 0.75, 0.0, 0.0, 0.95, 0.0, 0.0, 0.0]
      },
      chordProgression: ['Dm9', 'Dm9', 'Gm7', 'Gm7', 'Bbmaj7', 'Bbmaj7', 'A7alt', 'A7alt'],
      melodyScale: ['D', 'E', 'F', 'G', 'A', 'Bb', 'C']
    },
    'progressive house': {
      bpm: 126,
      keySignature: 'C Minor',
      swingPct: 5.0,
      rhythm: {
        kick:   [1.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0],
        snare:  [0.0, 0.0, 0.0, 0.0,  0.9, 0.0, 0.0, 0.0,  0.0, 0.0, 0.0, 0.0,  0.9, 0.0, 0.0, 0.0],
        hihat:  [0.0, 0.0, 0.8, 0.0,  0.0, 0.0, 0.8, 0.0,  0.0, 0.0, 0.8, 0.0,  0.0, 0.0, 0.8, 0.0],
        percussion: [0.0, 0.0, 0.0, 0.0, 0.55, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.55, 0.0, 0.65, 0.0],
        bass:   [0.0, 0.85, 0.95, 0.85, 0.0, 0.85, 0.95, 0.85, 0.0, 0.85, 0.95, 0.85, 0.0, 0.85, 0.95, 0.85]
      },
      chordProgression: ['Cm7', 'Abmaj7', 'Fm7', 'Bb7'],
      melodyScale: ['C', 'D', 'Eb', 'F', 'G', 'Ab', 'Bb']
    },
    'deep house': {
      bpm: 122,
      keySignature: 'E Minor',
      swingPct: 10.0,
      rhythm: {
        kick:   [1.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0],
        snare:  [0.0, 0.0, 0.0, 0.0,  0.8, 0.0, 0.0, 0.0,  0.0, 0.0, 0.0, 0.0,  0.8, 0.0, 0.0, 0.0],
        hihat:  [0.0, 0.0, 0.75, 0.3, 0.0, 0.0, 0.75, 0.3, 0.0, 0.0, 0.75, 0.3, 0.0, 0.0, 0.75, 0.3],
        percussion: [0.0, 0.4, 0.0, 0.5, 0.0, 0.0, 0.5, 0.0, 0.0, 0.4, 0.0, 0.5, 0.0, 0.0, 0.5, 0.0],
        bass:   [1.0, 0.0, 0.0, 0.0,  0.0, 0.7, 0.8, 0.0,  1.0, 0.0, 0.0, 0.0,  0.0, 0.7, 0.8, 0.0]
      },
      chordProgression: ['Em9', 'Cmaj9', 'Am9', 'Bm7'],
      melodyScale: ['E', 'F#', 'G', 'A', 'B', 'C', 'D']
    },
    'organic house': {
      bpm: 118,
      keySignature: 'G Major',
      swingPct: 14.0,
      rhythm: {
        kick:   [1.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0],
        snare:  [0.0, 0.0, 0.0, 0.0,  0.7, 0.0, 0.0, 0.0,  0.0, 0.0, 0.0, 0.0,  0.7, 0.0, 0.0, 0.0],
        hihat:  [0.5, 0.3, 0.7, 0.3,  0.5, 0.3, 0.7, 0.3,  0.5, 0.3, 0.7, 0.3,  0.5, 0.3, 0.7, 0.3],
        percussion: [0.7, 0.0, 0.5, 0.0, 0.0, 0.6, 0.0, 0.5, 0.7, 0.0, 0.5, 0.0, 0.0, 0.6, 0.5, 0.0],
        bass:   [1.0, 0.0, 0.0, 0.6,  0.0, 0.0, 0.75, 0.0, 0.0, 0.6, 0.0, 0.0, 0.85, 0.0, 0.0, 0.0]
      },
      chordProgression: ['Gmaj9', 'Em9', 'Cmaj9', 'D7sus4'],
      melodyScale: ['G', 'A', 'B', 'C', 'D', 'E', 'F#']
    },
    'house': {
      bpm: 124,
      keySignature: 'C Major',
      swingPct: 12.0,
      rhythm: {
        kick:   [1.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0],
        snare:  [0.0, 0.0, 0.0, 0.0,  0.9, 0.0, 0.0, 0.0,  0.0, 0.0, 0.0, 0.0,  0.9, 0.0, 0.0, 0.0],
        hihat:  [0.0, 0.0, 0.85, 0.0, 0.0, 0.0, 0.85, 0.0, 0.0, 0.0, 0.85, 0.0, 0.0, 0.0, 0.85, 0.4],
        percussion: [0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 0.0, 0.0,  0.0, 0.6, 0.0, 0.0,  0.0, 0.0, 0.5, 0.0],
        bass:   [1.0, 0.0, 0.6, 0.0,  0.0, 0.7, 0.0, 0.0,  1.0, 0.0, 0.6, 0.0,  0.0, 0.8, 0.5, 0.0]
      },
      chordProgression: ['Am7', 'Fmaj7', 'Cmaj7', 'G7'],
      melodyScale: ['C', 'D', 'E', 'F', 'G', 'A', 'B']
    },
    'techno': {
      bpm: 132,
      keySignature: 'F# Minor',
      swingPct: 2.0,
      rhythm: {
        kick:   [1.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0],
        snare:  [0.0, 0.0, 0.0, 0.0,  0.95, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,  0.95, 0.0, 0.0, 0.0],
        hihat:  [0.0, 0.0, 0.9, 0.0,  0.0, 0.0, 0.9, 0.0,  0.0, 0.0, 0.9, 0.0,  0.0, 0.0, 0.9, 0.0],
        percussion: [0.0, 0.7, 0.0, 0.7, 0.0, 0.7, 0.0, 0.7, 0.0, 0.7, 0.0, 0.7, 0.0, 0.7, 0.0, 0.7],
        bass:   [0.0, 0.9, 0.8, 0.9,  0.0, 0.9, 0.8, 0.9,  0.0, 0.9, 0.8, 0.9,  0.0, 0.9, 0.8, 0.9]
      },
      chordProgression: ['F#m', 'F#m', 'Dmaj7', 'C#m7'],
      melodyScale: ['F#', 'G#', 'A', 'B', 'C#', 'D', 'E']
    },
    'trance': {
      bpm: 138,
      keySignature: 'G Minor',
      swingPct: 0.0,
      rhythm: {
        kick:   [1.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0],
        snare:  [0.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0,  0.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0],
        hihat:  [0.0, 0.0, 0.9, 0.0,  0.0, 0.0, 0.9, 0.0,  0.0, 0.0, 0.9, 0.0,  0.0, 0.0, 0.9, 0.0],
        percussion: [0.0, 0.0, 0.0, 0.0, 0.6, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.6, 0.0, 0.6, 0.0],
        bass:   [0.9, 0.9, 0.9, 0.9,  0.9, 0.9, 0.9, 0.9,  0.9, 0.9, 0.9, 0.9,  0.9, 0.9, 0.9, 0.9]
      },
      chordProgression: ['Gm', 'Eb', 'Bb', 'F'],
      melodyScale: ['G', 'A', 'Bb', 'C', 'D', 'Eb', 'F']
    },
    'drum & bass': {
      bpm: 174,
      keySignature: 'F Minor',
      swingPct: 0.0,
      rhythm: {
        kick:   [1.0, 0.0, 0.0, 0.0,  0.0, 0.0, 0.0, 0.0,  0.0, 0.0, 1.0, 0.0,  0.0, 0.0, 0.0, 0.0],
        snare:  [0.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0,  0.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0],
        hihat:  [0.8, 0.6, 0.8, 0.6,  0.8, 0.6, 0.8, 0.6,  0.8, 0.6, 0.8, 0.6,  0.8, 0.6, 0.8, 0.6],
        percussion: [0.0, 0.0, 0.5, 0.0, 0.0, 0.0, 0.7, 0.0, 0.0, 0.5, 0.0, 0.0, 0.0, 0.7, 0.0, 0.0],
        bass:   [1.0, 0.9, 0.9, 0.0,  0.0, 0.0, 0.9, 0.9,  1.0, 0.9, 0.0, 0.0,  0.0, 0.0, 0.9, 0.9]
      },
      chordProgression: ['Fm7', 'Dbmaj7', 'Bbm7', 'C7'],
      melodyScale: ['F', 'G', 'Ab', 'Bb', 'C', 'Db', 'Eb']
    },
    'hip hop': {
      bpm: 90,
      keySignature: 'C Minor',
      swingPct: 18.0,
      rhythm: {
        kick:   [1.0, 0.0, 0.0, 0.0,  0.0, 0.0, 0.7, 0.0,  0.0, 0.0, 1.0, 0.0,  0.0, 0.0, 0.0, 0.0],
        snare:  [0.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0,  0.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0],
        hihat:  [0.7, 0.4, 0.7, 0.4,  0.7, 0.4, 0.7, 0.4,  0.7, 0.4, 0.7, 0.4,  0.7, 0.4, 0.7, 0.4],
        percussion: [0.0, 0.0, 0.0, 0.0, 0.4, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.4, 0.0, 0.5, 0.0],
        bass:   [1.0, 0.0, 0.0, 0.0,  0.0, 0.0, 0.8, 0.0,  1.0, 0.0, 0.0, 0.0,  0.0, 0.0, 0.0, 0.0]
      },
      chordProgression: ['Cm7', 'Fm7', 'G7alt', 'Cm7'],
      melodyScale: ['C', 'D', 'Eb', 'F', 'G', 'Ab', 'Bb']
    },
    'trap': {
      bpm: 140,
      keySignature: 'C# Minor',
      swingPct: 0.0,
      rhythm: {
        kick:   [1.0, 0.0, 0.0, 0.0,  0.0, 0.0, 0.0, 0.0,  0.0, 0.0, 0.9, 0.0,  0.0, 0.0, 0.0, 0.0],
        snare:  [0.0, 0.0, 0.0, 0.0,  0.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0,  0.0, 0.0, 0.0, 0.0],
        hihat:  [0.9, 0.9, 0.9, 0.9,  0.9, 0.9, 0.9, 0.9,  0.9, 0.9, 0.9, 0.9,  0.9, 0.9, 0.9, 0.9],
        percussion: [0.0, 0.0, 0.0, 0.8, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.8, 0.0, 0.0, 0.8, 0.0],
        bass:   [1.0, 1.0, 0.0, 0.0,  0.0, 0.0, 0.0, 0.0,  0.9, 0.9, 0.0, 0.0,  0.0, 0.0, 0.0, 0.0]
      },
      chordProgression: ['C#m', 'A', 'F#m', 'G#'],
      melodyScale: ['C#', 'D#', 'E', 'F#', 'G#', 'A', 'B']
    },
    'lo-fi': {
      bpm: 80,
      keySignature: 'Ab Major',
      swingPct: 25.0,
      rhythm: {
        kick:   [1.0, 0.0, 0.0, 0.0,  0.0, 0.0, 0.6, 0.0,  0.0, 0.0, 0.8, 0.0,  0.0, 0.0, 0.0, 0.0],
        snare:  [0.0, 0.0, 0.0, 0.0,  0.8, 0.0, 0.0, 0.0,  0.0, 0.0, 0.0, 0.0,  0.8, 0.0, 0.0, 0.0],
        hihat:  [0.6, 0.3, 0.6, 0.3,  0.6, 0.3, 0.6, 0.3,  0.6, 0.3, 0.6, 0.3,  0.6, 0.3, 0.6, 0.3],
        percussion: [0.0, 0.0, 0.4, 0.0, 0.0, 0.0, 0.4, 0.0, 0.0, 0.0, 0.4, 0.0, 0.0, 0.0, 0.4, 0.0],
        bass:   [0.9, 0.0, 0.0, 0.0,  0.0, 0.0, 0.7, 0.0,  0.9, 0.0, 0.0, 0.0,  0.0, 0.0, 0.0, 0.0]
      },
      chordProgression: ['Abmaj9', 'Fm9', 'Bbm9', 'Eb13'],
      melodyScale: ['Ab', 'Bb', 'C', 'Db', 'Eb', 'F', 'G']
    },
    'ambient': {
      bpm: 70,
      keySignature: 'D Major',
      swingPct: 0.0,
      rhythm: {
        kick:   [0.0, 0.0, 0.0, 0.0,  0.0, 0.0, 0.0, 0.0,  0.0, 0.0, 0.0, 0.0,  0.0, 0.0, 0.0, 0.0],
        snare:  [0.0, 0.0, 0.0, 0.0,  0.0, 0.0, 0.0, 0.0,  0.0, 0.0, 0.0, 0.0,  0.0, 0.0, 0.0, 0.0],
        hihat:  [0.2, 0.0, 0.0, 0.0,  0.2, 0.0, 0.0, 0.0,  0.2, 0.0, 0.0, 0.0,  0.2, 0.0, 0.0, 0.0],
        percussion: [0.3, 0.0, 0.0, 0.0, 0.0, 0.0, 0.3, 0.0, 0.0, 0.0, 0.0, 0.0, 0.3, 0.0, 0.0, 0.0],
        bass:   [0.8, 0.0, 0.0, 0.0,  0.0, 0.0, 0.0, 0.0,  0.8, 0.0, 0.0, 0.0,  0.0, 0.0, 0.0, 0.0]
      },
      chordProgression: ['Dmaj9', 'Gmaj9', 'Bm9', 'F#m7'],
      melodyScale: ['D', 'E', 'F#', 'G', 'A', 'B', 'C#']
    },
    'cinematic': {
      bpm: 100,
      keySignature: 'D Minor',
      swingPct: 0.0,
      rhythm: {
        kick:   [1.0, 0.0, 0.0, 0.0,  0.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0,  0.0, 0.0, 0.0, 0.0],
        snare:  [0.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0,  0.0, 0.0, 0.0, 0.0,  1.0, 0.0, 0.0, 0.0],
        hihat:  [0.5, 0.0, 0.5, 0.0,  0.5, 0.0, 0.5, 0.0,  0.5, 0.0, 0.5, 0.0,  0.5, 0.0, 0.5, 0.0],
        percussion: [0.9, 0.0, 0.0, 0.7, 0.0, 0.0, 0.8, 0.0, 0.9, 0.0, 0.0, 0.7, 0.0, 0.0, 0.8, 0.0],
        bass:   [1.0, 0.0, 0.0, 0.0,  0.0, 0.0, 0.0, 0.0,  0.9, 0.0, 0.0, 0.0,  0.0, 0.0, 0.0, 0.0]
      },
      chordProgression: ['Dm', 'Bb', 'F', 'C'],
      melodyScale: ['D', 'E', 'F', 'G', 'A', 'Bb', 'C']
    }
  };

  public static generatePattern(genre: string, seed: number = Date.now()): PatternGenerationResult {
    const selection = resolveGenreSelection(genre);
    const key = this.resolveTemplateKey(genre);
    const template = this.GENRE_TEMPLATES[key];
    const normalizedGenre = normalizeGenreName(genre);
    const houseStyle = resolveHouseStyleProfile(genre);
    const hasNativeTemplate = Boolean(
      this.GENRE_TEMPLATES[normalizedGenre] || houseStyle
    );
    const beatsPerBar = Math.max(
      1,
      Number.parseInt(selection.timeSignature.split('/')[0], 10) || 4
    );

    // Deterministic pseudo-random number generator for seed consistency
    const pseudoRandom = (step: number) => {
      const x = Math.sin(seed + step * 9999) * 10000;
      return x - Math.floor(x);
    };

    const kick = [...template.rhythm.kick];
    const snare = [...template.rhythm.snare];
    const hihat = [...template.rhythm.hihat];
    const percussion = [...template.rhythm.percussion];
    const bass = [...template.rhythm.bass];

    const velocityOffsets: number[] = [];
    const timingOffsetsMs: number[] = [];

    for (let i = 0; i < 16; i++) {
      const vOffset = (pseudoRandom(i) - 0.5) * 0.12;
      const tOffset = (i % 2 === 1) ? (pseudoRandom(i + 16) - 0.5) * 3.5 : 0.0;
      velocityOffsets.push(Number(vOffset.toFixed(3)));
      timingOffsetsMs.push(Number(tOffset.toFixed(2)));

      if (hihat[i] > 0) hihat[i] = Math.max(0.2, Math.min(1.0, Number((hihat[i] + vOffset).toFixed(2))));
      if (percussion[i] > 0) percussion[i] = Math.max(0.2, Math.min(1.0, Number((percussion[i] + vOffset).toFixed(2))));
      if (bass[i] > 0) bass[i] = Math.max(0.3, Math.min(1.0, Number((bass[i] + vOffset).toFixed(2))));
    }

    const result: PatternGenerationResult = {
      genre: selection.familyName,
      subgenre: selection.requestedGenre,
      bpm: selection.recommendedBpm,
      keySignature: selection.keySignature,
      swingPct: template.swingPct,
      rhythm: {
        kick,
        snare,
        hihat,
        percussion,
        bass
      },
      chordProgression: template.chordProgression,
      melodyScale: template.melodyScale,
      humanization: {
        velocityOffsets,
        timingOffsetsMs
      },
      grid: {
        timeSignature: selection.timeSignature,
        beatsPerBar,
        stepsPerBar: 16,
        subdivision: '1/16',
        phraseBars: 4,
        enforceStepGrid: hasNativeTemplate && selection.timeSignature === '4/4'
      },
      promptDirective: '',
      styleDirectives: houseStyle ? selection.acousticKeywords : [],
      seed
    };

    result.promptDirective = this.toPromptDirective(result);
    return result;
  }

  private static resolveTemplateKey(genre: string): string {
    const normalized = String(genre || '').trim().toLowerCase();
    if (this.GENRE_TEMPLATES[normalized]) return normalized;

    const houseStyle = resolveHouseStyleProfile(genre);
    if (houseStyle) return houseStyle.patternArchetype;

    const aliases: Array<[string[], string]> = [
      [['neurofunk', 'liquid dnb', 'drum and bass', 'drum & bass', 'dnb'], 'drum & bass'],
      [['boom bap', 'hip-hop', 'hip hop', 'rap'], 'hip hop'],
      [['chillhop', 'lofi', 'lo-fi'], 'lo-fi'],
      [['melodic house'], 'melodic house'],
      [['progressive house'], 'progressive house'],
      [['organic house'], 'organic house'],
      [['tech house'], 'tech house'],
      [['deep house'], 'deep house'],
      [['afro house'], 'afro house'],
      [['peak time techno', 'melodic techno', 'techno'], 'techno'],
      [['uplifting trance', 'trance'], 'trance'],
      [['modern trap', 'trap'], 'trap'],
      [['drone ambient', 'ambient'], 'ambient'],
      [['orchestral cinematic', 'cinematic', 'film score'], 'cinematic'],
      [['pop edm', 'edm pop', 'dance pop', 'edm'], 'house'],
      [['house'], 'house']
    ];

    const aliasMatch = aliases.find(([terms]) =>
      terms.some(term => normalized.includes(term))
    )?.[1];
    if (aliasMatch) return aliasMatch;

    const familyFallbacks: Record<string, string> = {
      house: 'house',
      techno: 'techno',
      trance: 'trance',
      bass_breaks: 'drum & bass',
      garage: 'house',
      hard_dance: 'techno',
      electronic: 'melodic house',
      pop: 'house',
      hip_hop: 'hip hop',
      rnb_soul_funk: 'hip hop',
      rock: 'cinematic',
      metal: 'cinematic',
      punk: 'cinematic',
      jazz_blues: 'hip hop',
      classical_cinematic: 'cinematic',
      folk_country: 'cinematic',
      reggae: 'hip hop',
      latin: 'house',
      african: 'afro house',
      global: 'cinematic'
    };
    const selection = resolveGenreSelection(genre);
    return familyFallbacks[selection.familyId] || 'melodic house';
  }

  public static toPromptDirective(pattern: PatternGenerationResult): string {
    const activeSteps = (values: number[]) => values
      .map((velocity, index) => velocity > 0 ? `${index + 1}:${velocity.toFixed(2)}` : null)
      .filter((value): value is string => Boolean(value))
      .join(',');

    const identity = `GENRE_IDENTITY: exact ${pattern.subgenre}, family ${pattern.genre}; never substitute or merge the selected genre`;

    if (!pattern.grid.enforceStepGrid) {
      return [
        identity,
        `METER: ${pattern.grid.timeSignature}, ${pattern.bpm} BPM`,
        `GENRE_GROOVE: use authentic ${pattern.subgenre} rhythm, accents, instrumentation and phrasing`,
        'GROOVE_RULES: do not impose a House, Techno or Hip Hop grid unless it belongs to the selected genre; preserve human feel where stylistically correct'
      ].join(' | ');
    }

    return [
      identity,
      ...(pattern.styleDirectives.length > 0
        ? [`HOUSE_STYLE_BLUEPRINT: ${pattern.styleDirectives.join('; ')}`]
        : []),
      `GROOVE_GRID: ${pattern.grid.timeSignature}, ${pattern.grid.stepsPerBar} steps per bar (${pattern.grid.subdivision})`,
      `KICK_STEPS[${activeSteps(pattern.rhythm.kick)}]`,
      `SNARE_STEPS[${activeSteps(pattern.rhythm.snare)}]`,
      `HIHAT_STEPS[${activeSteps(pattern.rhythm.hihat)}]`,
      `PERCUSSION_STEPS[${activeSteps(pattern.rhythm.percussion)}]`,
      `BASS_STEPS[${activeSteps(pattern.rhythm.bass)}]`,
      `SWING: ${pattern.swingPct.toFixed(1)} percent on off-grid sixteenth notes`,
      'GROOVE_RULES: preserve downbeats, keep kick and bass phase-locked, use controlled humanization only on hats and percussion'
    ].join(' | ');
  }
}
