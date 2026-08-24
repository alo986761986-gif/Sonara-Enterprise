import type { EqPreset } from '../components/eq/ProfessionalAudioEqualizer';

export const BUILT_IN_PROFESSIONAL_EQ_PRESETS: EqPreset[] = [
  {
    id: 'flat',
    name: 'Transparent Master',
    category: 'Mastering',
    description: 'Risposta neutra, headroom pulito e target streaming universale.',
    bands: { 20: { gain: 0, type: 'highpass' }, 20000: { gain: 0, type: 'lowpass' } },
    mastering: { inputGainDb: 0, outputGainDb: -1, targetLufs: -14, truePeakDbtp: -1, stereoPhaseCorrelation: 0.96 }
  },
  {
    id: 'streaming_balanced',
    name: 'Streaming Balanced',
    category: 'Mastering',
    description: 'Bilanciamento moderno per piattaforme streaming, con bassi controllati e presenza naturale.',
    bands: { 40: { gain: 0.8, type: 'lowshelf' }, 300: { gain: -1.2, q: 1.3 }, 3000: { gain: 0.8, q: 1.1 }, 12000: { gain: 1.2, type: 'highshelf' } },
    mastering: { inputGainDb: 0.5, outputGainDb: -1, targetLufs: -14, truePeakDbtp: -1, stereoPhaseCorrelation: 0.95 }
  },
  {
    id: 'club_punch',
    name: 'Club Punch',
    category: 'Electronic',
    description: 'Sub e kick solidi, low-mid scolpiti e alte definite per impianti club.',
    bands: { 20: { gain: 0, type: 'highpass' }, 60: { gain: 3.5, q: 1.3 }, 100: { gain: 1.8, q: 1.2 }, 300: { gain: -2.4, q: 1.6 }, 6000: { gain: 1.8 }, 14000: { gain: 2.2, type: 'highshelf' } },
    mastering: { inputGainDb: 1, outputGainDb: -0.8, targetLufs: -9, truePeakDbtp: -0.8, stereoPhaseCorrelation: 0.92 }
  },
  {
    id: 'deep_house',
    name: 'Deep House Warm',
    category: 'Electronic',
    description: 'Sub vellutato, medi morbidi e brillantezza analogica per Deep House.',
    bands: { 40: { gain: 3.8, q: 1.3, type: 'lowshelf' }, 100: { gain: 1.5 }, 400: { gain: -1.8, q: 1.5 }, 3000: { gain: -0.8 }, 10000: { gain: 1.6 } },
    mastering: { inputGainDb: 0.5, outputGainDb: -1, targetLufs: -10, truePeakDbtp: -1, stereoPhaseCorrelation: 0.93 }
  },
  {
    id: 'tech_house',
    name: 'Tech House Tight',
    category: 'Electronic',
    description: 'Kick focalizzato, medi inferiori asciutti e transienti ritmici incisivi.',
    bands: { 40: { gain: 1.8 }, 80: { gain: 3.8, q: 1.6 }, 250: { gain: -2.8, q: 1.8 }, 500: { gain: -1.3 }, 6000: { gain: 3, q: 1.3 }, 14000: { gain: 2, type: 'highshelf' } },
    mastering: { inputGainDb: 1, outputGainDb: -0.8, targetLufs: -9, truePeakDbtp: -0.8, stereoPhaseCorrelation: 0.92 }
  },
  {
    id: 'edm',
    name: 'EDM Festival',
    category: 'Electronic',
    description: 'Curva energica con sub massiccio, medi puliti e top-end brillante.',
    bands: { 60: { gain: 4.5, q: 1.5 }, 400: { gain: -3, q: 1.7 }, 3000: { gain: 1.7 }, 8000: { gain: 2.8 }, 14000: { gain: 3, type: 'highshelf' } },
    mastering: { inputGainDb: 1.5, outputGainDb: -0.7, targetLufs: -8, truePeakDbtp: -0.7, stereoPhaseCorrelation: 0.9 }
  },
  {
    id: 'drum_bass',
    name: 'Drum & Bass Impact',
    category: 'Electronic',
    description: 'Sub profondo, snare presente e alte veloci senza asprezza.',
    bands: { 40: { gain: 3, type: 'lowshelf' }, 80: { gain: 2.2 }, 250: { gain: -2 }, 2000: { gain: 1.5 }, 5000: { gain: 2.4 }, 12000: { gain: 1.7, type: 'highshelf' } },
    mastering: { inputGainDb: 1, outputGainDb: -0.8, targetLufs: -9, truePeakDbtp: -0.8, stereoPhaseCorrelation: 0.91 }
  },
  {
    id: 'hip_hop_trap',
    name: 'Hip-Hop / Trap',
    category: 'Urban',
    description: '808 profondo, spazio alla voce e hi-hat nitidi con true peak controllato.',
    bands: { 40: { gain: 3.2, type: 'lowshelf' }, 80: { gain: 2 }, 300: { gain: -2.2, q: 1.4 }, 3000: { gain: 1.6 }, 8000: { gain: 2.2 }, 14000: { gain: 1.5, type: 'highshelf' } },
    mastering: { inputGainDb: 0.8, outputGainDb: -1, targetLufs: -10, truePeakDbtp: -1, stereoPhaseCorrelation: 0.93 }
  },
  {
    id: 'pop_vocal',
    name: 'Pop Vocal Focus',
    category: 'Pop',
    description: 'Riduce il fango, porta la voce in avanti e aggiunge aria al mix.',
    bands: { 100: { gain: 0.8 }, 300: { gain: -2, q: 1.5 }, 1000: { gain: 0.7 }, 3000: { gain: 2.2, q: 1.2 }, 6000: { gain: 1.2 }, 14000: { gain: 2.5, type: 'highshelf' } },
    mastering: { inputGainDb: 0.5, outputGainDb: -1, targetLufs: -11, truePeakDbtp: -1, stereoPhaseCorrelation: 0.95 }
  },
  {
    id: 'rnb_soul',
    name: 'R&B Silk',
    category: 'Urban',
    description: 'Low-end caldo, medi setosi e aria morbida per voci e armonie.',
    bands: { 60: { gain: 2.3 }, 200: { gain: 1 }, 500: { gain: -1.2 }, 2000: { gain: 1.2 }, 10000: { gain: 1.7 }, 16000: { gain: 2, type: 'highshelf' } },
    mastering: { inputGainDb: 0.3, outputGainDb: -1, targetLufs: -12, truePeakDbtp: -1, stereoPhaseCorrelation: 0.95 }
  },
  {
    id: 'rock_modern',
    name: 'Modern Rock',
    category: 'Band',
    description: 'Basso compatto, chitarre presenti e batteria incisiva senza durezza.',
    bands: { 80: { gain: 2 }, 250: { gain: -1.4 }, 800: { gain: 1.1 }, 3000: { gain: 2 }, 6000: { gain: 1.2 }, 12000: { gain: 1.4, type: 'highshelf' } },
    mastering: { inputGainDb: 0.8, outputGainDb: -1, targetLufs: -10, truePeakDbtp: -1, stereoPhaseCorrelation: 0.94 }
  },
  {
    id: 'acoustic_natural',
    name: 'Acoustic Natural',
    category: 'Acoustic',
    description: 'Toglie rimbombo, conserva il corpo e valorizza dettaglio e ambiente.',
    bands: { 40: { gain: 0, type: 'highpass' }, 150: { gain: 0.8 }, 300: { gain: -1.8 }, 2000: { gain: 1 }, 5000: { gain: 1.5 }, 12000: { gain: 1.8, type: 'highshelf' } },
    mastering: { inputGainDb: 0, outputGainDb: -1, targetLufs: -14, truePeakDbtp: -1, stereoPhaseCorrelation: 0.97 }
  },
  {
    id: 'afro_house',
    name: 'Afro House Organic',
    category: 'Electronic',
    description: 'Percussioni organiche, sub caldo e spazio aperto per groove complessi.',
    bands: { 60: { gain: 3.2 }, 200: { gain: 2 }, 400: { gain: -1.2 }, 800: { gain: 1.8 }, 3000: { gain: 1.5 }, 12000: { gain: 2.5, type: 'highshelf' } },
    mastering: { inputGainDb: 0.6, outputGainDb: -1, targetLufs: -10, truePeakDbtp: -1, stereoPhaseCorrelation: 0.93 }
  },
  {
    id: 'reggaeton',
    name: 'Reggaeton Drive',
    category: 'Latin',
    description: 'Dembow solido, basso definito e presenza vocale brillante.',
    bands: { 60: { gain: 2.7 }, 100: { gain: 1.5 }, 300: { gain: -2 }, 2000: { gain: 1.2 }, 4000: { gain: 2 }, 10000: { gain: 2, type: 'highshelf' } },
    mastering: { inputGainDb: 0.8, outputGainDb: -0.9, targetLufs: -9.5, truePeakDbtp: -0.9, stereoPhaseCorrelation: 0.93 }
  },
  {
    id: 'cinematic_wide',
    name: 'Cinematic Wide',
    category: 'Film',
    description: 'Profondità orchestrale, medi leggibili e apertura sulle alte frequenze.',
    bands: { 40: { gain: 1.2, type: 'lowshelf' }, 150: { gain: 1 }, 400: { gain: -1 }, 2000: { gain: 1.2 }, 6000: { gain: 1.5 }, 16000: { gain: 2.5, type: 'highshelf' } },
    mastering: { inputGainDb: 0, outputGainDb: -1.5, targetLufs: -16, truePeakDbtp: -1.5, stereoPhaseCorrelation: 0.9 }
  },
  {
    id: 'podcast_voice',
    name: 'Voice / Podcast Clean',
    category: 'Voice',
    description: 'Taglio dei rumori bassi, intelligibilità e controllo delle sibilanti.',
    bands: { 80: { gain: 0, type: 'highpass' }, 200: { gain: -1.3 }, 400: { gain: -1.8 }, 2000: { gain: 2 }, 4000: { gain: 1.8 }, 8000: { gain: -1 } },
    mastering: { inputGainDb: 1, outputGainDb: -1, targetLufs: -16, truePeakDbtp: -1, stereoPhaseCorrelation: 0.99 }
  },
  {
    id: 'vinyl_warmth',
    name: 'Analog Warmth',
    category: 'Color',
    description: 'Corpo caldo, medio-alte levigate e brillantezza vintage controllata.',
    bands: { 60: { gain: 1.5, type: 'lowshelf' }, 200: { gain: 1.2 }, 500: { gain: 0.8 }, 4000: { gain: -1 }, 10000: { gain: -1.3 }, 16000: { gain: -2, type: 'highshelf' } },
    mastering: { inputGainDb: 0.5, outputGainDb: -1.2, targetLufs: -13, truePeakDbtp: -1.2, stereoPhaseCorrelation: 0.96 }
  },
  {
    id: 'air_detail',
    name: 'Air & Detail',
    category: 'Mastering',
    description: 'Apre il mix con presenza controllata e aria senza rendere aggressivi i transienti.',
    bands: { 250: { gain: -0.8 }, 1000: { gain: 0.5 }, 3000: { gain: 1 }, 8000: { gain: 1.5 }, 12000: { gain: 2.5, type: 'highshelf' }, 16000: { gain: 2, type: 'highshelf' } },
    mastering: { inputGainDb: 0, outputGainDb: -1, targetLufs: -14, truePeakDbtp: -1, stereoPhaseCorrelation: 0.95 }
  }
];
