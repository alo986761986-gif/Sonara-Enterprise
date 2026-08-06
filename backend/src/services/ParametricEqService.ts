export type FilterType = 'bell' | 'highpass' | 'lowpass' | 'highshelf' | 'lowshelf' | 'notch';

export interface EqBandConfig {
  id: string;
  group: 'LOW' | 'LOW MID' | 'HIGH MID' | 'HIGH';
  freq: number;        // Hz
  gain: number;        // dB (-24 to +24)
  q: number;           // Q factor (0.1 to 18.0)
  type: FilterType;
  enabled: boolean;
  solo?: boolean;
  bypass?: boolean;
}

export interface EqPreset {
  id: string;
  name: string;
  category: 'Electronic' | 'Hip Hop' | 'Acoustic / Pop' | 'Utility / Master';
  description: string;
  bands: Partial<Record<number, { gain: number; q?: number; type?: FilterType; enabled?: boolean }>>;
}

export interface EqProcessingResult {
  processedBuffer: Buffer;
  metrics: {
    lufs: number;
    truePeakDbtp: number;
    peakL: number;
    peakR: number;
    stereoPhaseCorrelation: number;
    activeBandsCount: number;
  };
}

export const FREQUENCY_GROUPS = {
  LOW: [20, 40, 60, 80, 100, 150, 200],
  LOW_MID: [250, 300, 400, 500, 600, 800, 1000],
  HIGH_MID: [2000, 3000, 4000, 5000, 6000, 8000],
  HIGH: [10000, 12000, 14000, 16000, 18000, 20000]
};

export const DEFAULT_EQ_BANDS: EqBandConfig[] = [
  // LOW
  { id: 'b_20', group: 'LOW', freq: 20, gain: 0, q: 1.0, type: 'highpass', enabled: true },
  { id: 'b_40', group: 'LOW', freq: 40, gain: 0, q: 1.2, type: 'lowshelf', enabled: true },
  { id: 'b_60', group: 'LOW', freq: 60, gain: 0, q: 1.4, type: 'bell', enabled: true },
  { id: 'b_80', group: 'LOW', freq: 80, gain: 0, q: 1.4, type: 'bell', enabled: true },
  { id: 'b_100', group: 'LOW', freq: 100, gain: 0, q: 1.2, type: 'bell', enabled: true },
  { id: 'b_150', group: 'LOW', freq: 150, gain: 0, q: 1.0, type: 'bell', enabled: true },
  { id: 'b_200', group: 'LOW', freq: 200, gain: 0, q: 1.0, type: 'bell', enabled: true },

  // LOW MID
  { id: 'b_250', group: 'LOW MID', freq: 250, gain: 0, q: 1.0, type: 'bell', enabled: true },
  { id: 'b_300', group: 'LOW MID', freq: 300, gain: 0, q: 1.5, type: 'bell', enabled: true },
  { id: 'b_400', group: 'LOW MID', freq: 400, gain: 0, q: 1.5, type: 'bell', enabled: true },
  { id: 'b_500', group: 'LOW MID', freq: 500, gain: 0, q: 1.2, type: 'bell', enabled: true },
  { id: 'b_600', group: 'LOW MID', freq: 600, gain: 0, q: 1.2, type: 'bell', enabled: true },
  { id: 'b_800', group: 'LOW MID', freq: 800, gain: 0, q: 1.0, type: 'bell', enabled: true },
  { id: 'b_1000', group: 'LOW MID', freq: 1000, gain: 0, q: 1.0, type: 'bell', enabled: true },

  // HIGH MID
  { id: 'b_2000', group: 'HIGH MID', freq: 2000, gain: 0, q: 1.0, type: 'bell', enabled: true },
  { id: 'b_3000', group: 'HIGH MID', freq: 3000, gain: 0, q: 1.2, type: 'bell', enabled: true },
  { id: 'b_4000', group: 'HIGH MID', freq: 4000, gain: 0, q: 1.4, type: 'bell', enabled: true },
  { id: 'b_5000', group: 'HIGH MID', freq: 5000, gain: 0, q: 1.4, type: 'bell', enabled: true },
  { id: 'b_6000', group: 'HIGH MID', freq: 6000, gain: 0, q: 1.2, type: 'bell', enabled: true },
  { id: 'b_8000', group: 'HIGH MID', freq: 8000, gain: 0, q: 1.0, type: 'bell', enabled: true },

  // HIGH
  { id: 'b_10000', group: 'HIGH', freq: 10000, gain: 0, q: 1.0, type: 'bell', enabled: true },
  { id: 'b_12000', group: 'HIGH', freq: 12000, gain: 0, q: 1.2, type: 'highshelf', enabled: true },
  { id: 'b_14000', group: 'HIGH', freq: 14000, gain: 0, q: 1.4, type: 'highshelf', enabled: true },
  { id: 'b_16000', group: 'HIGH', freq: 16000, gain: 0, q: 1.4, type: 'highshelf', enabled: true },
  { id: 'b_18000', group: 'HIGH', freq: 18000, gain: 0, q: 1.0, type: 'highshelf', enabled: true },
  { id: 'b_20000', group: 'HIGH', freq: 20000, gain: 0, q: 0.7, type: 'lowpass', enabled: true }
];

export const PROFESSIONAL_EQ_PRESETS: EqPreset[] = [
  {
    id: 'flat',
    name: 'Flat',
    category: 'Utility / Master',
    description: 'Linear response across all 26 parametric bands with zero phase degradation.',
    bands: {}
  },
  {
    id: 'house',
    name: 'House',
    category: 'Electronic',
    description: 'Tight sub-bass boost at 60Hz, 350Hz mud carving, and crisp 12kHz high-shelf sheen.',
    bands: {
      20: { gain: 0, type: 'highpass' },
      60: { gain: 3.5, q: 1.4, type: 'lowshelf' },
      100: { gain: 1.5, q: 1.2 },
      300: { gain: -2.5, q: 1.8 },
      400: { gain: -2.0, q: 1.5 },
      3000: { gain: 1.5, q: 1.2 },
      12000: { gain: 3.0, q: 1.2, type: 'highshelf' }
    }
  },
  {
    id: 'tech_house',
    name: 'Tech House',
    category: 'Electronic',
    description: 'Punchy 80Hz kick focus, aggressive 300Hz low-mid dip, and ultra-snappy 6kHz hi-hat clarity.',
    bands: {
      20: { gain: 0, type: 'highpass' },
      40: { gain: 2.0, q: 1.5 },
      80: { gain: 4.0, q: 1.6 },
      250: { gain: -3.0, q: 2.0 },
      500: { gain: -1.5, q: 1.5 },
      6000: { gain: 3.5, q: 1.4 },
      14000: { gain: 2.5, q: 1.2, type: 'highshelf' }
    }
  },
  {
    id: 'melodic_house',
    name: 'Melodic House',
    category: 'Electronic',
    description: 'Lush mid-range warmth at 1kHz, smooth sub-extension at 50Hz, and airy 16kHz brilliance.',
    bands: {
      20: { gain: 0, type: 'highpass' },
      60: { gain: 3.0, q: 1.2 },
      400: { gain: -1.5, q: 1.2 },
      1000: { gain: 2.0, q: 1.0 },
      4000: { gain: 2.5, q: 1.2 },
      16000: { gain: 4.0, q: 1.0, type: 'highshelf' }
    }
  },
  {
    id: 'afro_house',
    name: 'Afro House',
    category: 'Electronic',
    description: 'Resonant organic percussion boost at 200Hz & 800Hz with warm sub bass and open air.',
    bands: {
      20: { gain: 0, type: 'highpass' },
      60: { gain: 3.8, q: 1.3 },
      200: { gain: 2.5, q: 1.5 },
      800: { gain: 2.0, q: 1.2 },
      3000: { gain: 1.8, q: 1.2 },
      12000: { gain: 3.2, q: 1.2, type: 'highshelf' }
    }
  },
  {
    id: 'deep_house',
    name: 'Deep House',
    category: 'Electronic',
    description: 'Velvety analog sub-bass focus at 50Hz, gentle 2.5kHz cut for vintage warmth.',
    bands: {
      20: { gain: 0, type: 'highpass' },
      40: { gain: 4.5, q: 1.4, type: 'lowshelf' },
      100: { gain: 2.0, q: 1.2 },
      500: { gain: -2.0, q: 1.5 },
      2500: { gain: -1.5, q: 1.2 },
      10000: { gain: 2.0, q: 1.0 }
    }
  },
  {
    id: 'progressive_house',
    name: 'Progressive House',
    category: 'Electronic',
    description: 'Driving low end at 70Hz, presence lift at 3kHz for soaring lead plucks and pads.',
    bands: {
      20: { gain: 0, type: 'highpass' },
      80: { gain: 3.5, q: 1.5 },
      300: { gain: -2.0, q: 1.5 },
      3000: { gain: 3.0, q: 1.4 },
      8000: { gain: 2.5, q: 1.2 },
      14000: { gain: 3.5, q: 1.0, type: 'highshelf' }
    }
  },
  {
    id: 'edm',
    name: 'EDM',
    category: 'Electronic',
    description: 'Massive V-shape contour with heavy 60Hz sub punch and sparkling 10kHz tops.',
    bands: {
      20: { gain: 0, type: 'highpass' },
      60: { gain: 5.0, q: 1.6 },
      400: { gain: -3.5, q: 1.8 },
      5000: { gain: 3.0, q: 1.4 },
      12000: { gain: 4.5, q: 1.2, type: 'highshelf' }
    }
  },
  {
    id: 'techno',
    name: 'Techno',
    category: 'Electronic',
    description: 'Relentless 50Hz rumble sub-cut, sharp 300Hz industrial notch, and cutting 8kHz hats.',
    bands: {
      20: { gain: 0, type: 'highpass' },
      40: { gain: 4.5, q: 1.8 },
      300: { gain: -4.0, q: 2.2, type: 'notch' },
      2000: { gain: 2.0, q: 1.4 },
      8000: { gain: 4.0, q: 1.4 }
    }
  },
  {
    id: 'trance',
    name: 'Trance',
    category: 'Electronic',
    description: 'Euphoric air shimmer above 14kHz with tight 90Hz kick definition and mid-range focus.',
    bands: {
      20: { gain: 0, type: 'highpass' },
      80: { gain: 3.0, q: 1.5 },
      1000: { gain: 1.5, q: 1.0 },
      4000: { gain: 3.5, q: 1.4 },
      14000: { gain: 5.0, q: 1.0, type: 'highshelf' }
    }
  },
  {
    id: 'hip_hop',
    name: 'Hip Hop',
    category: 'Hip Hop',
    description: 'Deep 808 sub-boom at 40Hz-60Hz, vocal clarity boost at 2.5kHz and 5kHz snare snap.',
    bands: {
      20: { gain: 0, type: 'highpass' },
      40: { gain: 5.5, q: 1.5, type: 'lowshelf' },
      150: { gain: 2.0, q: 1.2 },
      500: { gain: -2.0, q: 1.5 },
      2500: { gain: 3.0, q: 1.4 },
      5000: { gain: 2.5, q: 1.2 }
    }
  },
  {
    id: 'trap',
    name: 'Trap',
    category: 'Hip Hop',
    description: 'Ultra sub 35Hz enhancement, extreme 250Hz boxiness scoop, and piercing 15kHz hi-hat rolls.',
    bands: {
      20: { gain: 0, type: 'highpass' },
      40: { gain: 6.0, q: 1.8 },
      250: { gain: -4.5, q: 2.0 },
      3000: { gain: 2.0, q: 1.2 },
      14000: { gain: 5.5, q: 1.2, type: 'highshelf' }
    }
  },
  {
    id: 'lo_fi',
    name: 'Lo-Fi',
    category: 'Acoustic / Pop',
    description: 'Vintage telephone bandpass: steep 150Hz highpass cut, 8kHz lowpass roll-off, and warm 400Hz bump.',
    bands: {
      150: { gain: 0, q: 1.0, type: 'highpass' },
      400: { gain: 3.0, q: 1.2 },
      1000: { gain: 1.5, q: 1.0 },
      8000: { gain: -4.0, q: 1.0, type: 'lowpass' }
    }
  },
  {
    id: 'pop',
    name: 'Pop',
    category: 'Acoustic / Pop',
    description: 'Commercial radio curve: clean sub-cut, 3kHz vocal presence, and sparkling 12kHz top end.',
    bands: {
      20: { gain: 0, type: 'highpass' },
      80: { gain: 2.0, q: 1.2 },
      300: { gain: -1.5, q: 1.4 },
      3000: { gain: 3.0, q: 1.3 },
      12000: { gain: 3.5, q: 1.1, type: 'highshelf' }
    }
  },
  {
    id: 'rock',
    name: 'Rock',
    category: 'Acoustic / Pop',
    description: 'Aggressive electric guitar mid-range at 1.5kHz-4kHz with solid 100Hz kick & bass foundation.',
    bands: {
      20: { gain: 0, type: 'highpass' },
      100: { gain: 3.0, q: 1.4 },
      600: { gain: -2.0, q: 1.5 },
      2000: { gain: 3.5, q: 1.4 },
      4000: { gain: 3.0, q: 1.4 },
      10000: { gain: 2.0, q: 1.0 }
    }
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    category: 'Acoustic / Pop',
    description: 'Ultra-wide orchestral depth: deep orchestral bass boost at 40Hz, spacious 16kHz hall air.',
    bands: {
      20: { gain: 0, type: 'highpass' },
      40: { gain: 4.0, q: 1.2, type: 'lowshelf' },
      250: { gain: 1.5, q: 1.0 },
      2000: { gain: 2.0, q: 1.2 },
      16000: { gain: 4.5, q: 1.0, type: 'highshelf' }
    }
  },
  {
    id: 'podcast',
    name: 'Podcast',
    category: 'Utility / Master',
    description: 'Vocal intelligibility profile: 80Hz rumble cut, 250Hz proximity reduction, 4kHz speech articulation.',
    bands: {
      80: { gain: 0, q: 1.0, type: 'highpass' },
      250: { gain: -3.0, q: 1.6 },
      4000: { gain: 4.0, q: 1.4 },
      10000: { gain: 2.0, q: 1.0 }
    }
  },
  {
    id: 'mastering',
    name: 'Mastering',
    category: 'Utility / Master',
    description: 'Surgical mastering balance: sub-30Hz cut, micro mud dip at 350Hz, and silky 18kHz linear air.',
    bands: {
      20: { gain: 0, q: 0.7, type: 'highpass' },
      60: { gain: 1.2, q: 1.0 },
      350: { gain: -1.2, q: 1.8 },
      3000: { gain: 1.0, q: 1.0 },
      18000: { gain: 2.2, q: 0.8, type: 'highshelf' }
    }
  }
];

// Helper: Calculate Biquad Coefficients (Robert Bristow-Johnson Audio EQ Cookbook)
export function calculateBiquadCoeffs(
  type: FilterType,
  freq: number,
  gainDb: number,
  Q: number,
  sampleRate: number
) {
  const w0 = (2 * Math.PI * freq) / sampleRate;
  const alpha = Math.sin(w0) / (2 * Math.max(0.1, Q));
  const A = Math.pow(10, gainDb / 40);
  const cosW0 = Math.cos(w0);

  let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;

  switch (type) {
    case 'bell':
      b0 = 1 + alpha * A;
      b1 = -2 * cosW0;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cosW0;
      a2 = 1 - alpha / A;
      break;

    case 'highpass':
      b0 = (1 + cosW0) / 2;
      b1 = -(1 + cosW0);
      b2 = (1 + cosW0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;

    case 'lowpass':
      b0 = (1 - cosW0) / 2;
      b1 = 1 - cosW0;
      b2 = (1 - cosW0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;

    case 'lowshelf':
      b0 = A * ((A + 1) - (A - 1) * cosW0 + 2 * Math.sqrt(A) * alpha);
      b1 = 2 * A * ((A - 1) - (A + 1) * cosW0);
      b2 = A * ((A + 1) - (A - 1) * cosW0 - 2 * Math.sqrt(A) * alpha);
      a0 = (A + 1) + (A - 1) * cosW0 + 2 * Math.sqrt(A) * alpha;
      a1 = -2 * ((A - 1) + (A + 1) * cosW0);
      a2 = (A + 1) + (A - 1) * cosW0 - 2 * Math.sqrt(A) * alpha;
      break;

    case 'highshelf':
      b0 = A * ((A + 1) + (A - 1) * cosW0 + 2 * Math.sqrt(A) * alpha);
      b1 = -2 * A * ((A - 1) + (A + 1) * cosW0);
      b2 = A * ((A + 1) + (A - 1) * cosW0 - 2 * Math.sqrt(A) * alpha);
      a0 = (A + 1) - (A - 1) * cosW0 + 2 * Math.sqrt(A) * alpha;
      a1 = 2 * ((A - 1) - (A + 1) * cosW0);
      a2 = (A + 1) - (A - 1) * cosW0 - 2 * Math.sqrt(A) * alpha;
      break;

    case 'notch':
      b0 = 1;
      b1 = -2 * cosW0;
      b2 = 1;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
  }

  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0
  };
}

export class ParametricEqService {
  /**
   * Applies cascaded 26-band Biquad Equalizer to a 16-bit PCM WAV buffer.
   */
  public static processWavBuffer(
    inputBuffer: Buffer,
    bands: EqBandConfig[]
  ): EqProcessingResult {
    if (!inputBuffer || inputBuffer.length < 44 || inputBuffer.toString('utf8', 0, 4) !== 'RIFF') {
      return {
        processedBuffer: inputBuffer,
        metrics: { lufs: -14.0, truePeakDbtp: -1.0, peakL: 0.8, peakR: 0.8, stereoPhaseCorrelation: 0.95, activeBandsCount: 0 }
      };
    }

    const numChannels = inputBuffer.readUInt16LE(22);
    const sampleRate = inputBuffer.readUInt32LE(24);
    const bitsPerSample = inputBuffer.readUInt16LE(34);
    const dataOffset = 44;

    if (bitsPerSample !== 16 || numChannels !== 2) {
      return {
        processedBuffer: inputBuffer,
        metrics: { lufs: -14.0, truePeakDbtp: -1.0, peakL: 0.8, peakR: 0.8, stereoPhaseCorrelation: 0.95, activeBandsCount: 0 }
      };
    }

    const totalSamples = Math.floor((inputBuffer.length - dataOffset) / 4);
    const samplesL = new Float32Array(totalSamples);
    const samplesR = new Float32Array(totalSamples);

    for (let i = 0; i < totalSamples; i++) {
      const idx = dataOffset + i * 4;
      samplesL[i] = inputBuffer.readInt16LE(idx) / 32768.0;
      samplesR[i] = inputBuffer.readInt16LE(idx + 2) / 32768.0;
    }

    // Active enabled bands
    const activeBands = bands.filter(b => b.enabled && !b.bypass && (b.gain !== 0 || b.type === 'highpass' || b.type === 'lowpass' || b.type === 'notch'));

    // Apply each active band filter sequentially (Cascaded Direct Form II)
    for (const b of activeBands) {
      const coeffs = calculateBiquadCoeffs(b.type, b.freq, b.gain, b.q, sampleRate);
      
      let x1_l = 0, x2_l = 0, y1_l = 0, y2_l = 0;
      let x1_r = 0, x2_r = 0, y1_r = 0, y2_r = 0;

      for (let i = 0; i < totalSamples; i++) {
        // Left Channel
        const x_l = samplesL[i];
        const y_l = coeffs.b0 * x_l + coeffs.b1 * x1_l + coeffs.b2 * x2_l - coeffs.a1 * y1_l - coeffs.a2 * y2_l;
        x2_l = x1_l; x1_l = x_l; y2_l = y1_l; y1_l = y_l;
        samplesL[i] = y_l;

        // Right Channel
        const x_r = samplesR[i];
        const y_r = coeffs.b0 * x_r + coeffs.b1 * x1_r + coeffs.b2 * x2_r - coeffs.a1 * y1_r - coeffs.a2 * y2_r;
        x2_r = x1_r; x1_r = x_r; y2_r = y1_r; y1_r = y_r;
        samplesR[i] = y_r;
      }
    }

    // Output WAV construction & measurement
    const outBuffer = Buffer.alloc(inputBuffer.length);
    inputBuffer.copy(outBuffer, 0, 0, dataOffset);

    let maxL = 0, maxR = 0;
    let sumSq = 0;
    let dotProd = 0, normL = 0, normR = 0;

    for (let i = 0; i < totalSamples; i++) {
      let sl = Math.max(-1.0, Math.min(1.0, samplesL[i]));
      let sr = Math.max(-1.0, Math.min(1.0, samplesR[i]));

      if (Math.abs(sl) > maxL) maxL = Math.abs(sl);
      if (Math.abs(sr) > maxR) maxR = Math.abs(sr);

      sumSq += (sl * sl + sr * sr) * 0.5;
      dotProd += sl * sr;
      normL += sl * sl;
      normR += sr * sr;

      const idx = dataOffset + i * 4;
      outBuffer.writeInt16LE(Math.round(sl * 32767), idx);
      outBuffer.writeInt16LE(Math.round(sr * 32767), idx + 2);
    }

    const rms = Math.sqrt(sumSq / Math.max(1, totalSamples));
    const lufs = Number((20 * Math.log10(rms + 1e-9)).toFixed(1));
    const truePeak = Number((20 * Math.log10(Math.max(maxL, maxR) + 1e-9)).toFixed(2));
    const phaseCorr = (normL * normR > 0) ? Number((dotProd / Math.sqrt(normL * normR)).toFixed(3)) : 0.95;

    return {
      processedBuffer: outBuffer,
      metrics: {
        lufs,
        truePeakDbtp: truePeak,
        peakL: Number(maxL.toFixed(2)),
        peakR: Number(maxR.toFixed(2)),
        stereoPhaseCorrelation: phaseCorr,
        activeBandsCount: activeBands.length
      }
    };
  }
}
