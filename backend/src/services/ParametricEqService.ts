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
   * Applies a real cascaded parametric EQ to a stereo PCM16 WAV buffer.
   * Input/output gain are included in both the audible preview and exported file.
   */
  public static processWavBuffer(
    inputBuffer: Buffer,
    bands: EqBandConfig[],
    options: { inputGainDb?: number; outputGainDb?: number } = {}
  ): EqProcessingResult {
    if (
      !inputBuffer ||
      inputBuffer.length < 44 ||
      inputBuffer.toString('ascii', 0, 4) !== 'RIFF' ||
      inputBuffer.toString('ascii', 8, 12) !== 'WAVE'
    ) {
      throw new Error('EQ_INPUT_INVALID: expected a valid RIFF/WAVE file.');
    }

    let audioFormat = 0;
    let numChannels = 0;
    let sampleRate = 0;
    let bitsPerSample = 0;
    let dataOffset = -1;
    let dataSize = 0;
    let cursor = 12;

    while (cursor + 8 <= inputBuffer.length) {
      const chunkId = inputBuffer.toString('ascii', cursor, cursor + 4);
      const chunkSize = inputBuffer.readUInt32LE(cursor + 4);
      const chunkDataOffset = cursor + 8;

      if (chunkDataOffset + chunkSize > inputBuffer.length) {
        throw new Error(`EQ_INPUT_INVALID: malformed WAV chunk ${chunkId}.`);
      }

      if (chunkId === 'fmt ' && chunkSize >= 16) {
        audioFormat = inputBuffer.readUInt16LE(chunkDataOffset);
        numChannels = inputBuffer.readUInt16LE(chunkDataOffset + 2);
        sampleRate = inputBuffer.readUInt32LE(chunkDataOffset + 4);
        bitsPerSample = inputBuffer.readUInt16LE(chunkDataOffset + 14);
      } else if (chunkId === 'data') {
        dataOffset = chunkDataOffset;
        dataSize = chunkSize;
        break;
      }

      cursor = chunkDataOffset + chunkSize + (chunkSize % 2);
    }

    if (
      audioFormat !== 1 ||
      numChannels !== 2 ||
      bitsPerSample !== 16 ||
      sampleRate < 8000 ||
      dataOffset < 0 ||
      dataSize < 4
    ) {
      throw new Error(
        `EQ_INPUT_UNSUPPORTED: requires PCM16 stereo WAV; received format=${audioFormat}, channels=${numChannels}, bits=${bitsPerSample}, sampleRate=${sampleRate}.`
      );
    }

    const readableDataSize = Math.min(dataSize, inputBuffer.length - dataOffset);
    const totalSamples = Math.floor(readableDataSize / 4);
    if (totalSamples <= 0) {
      throw new Error('EQ_INPUT_INVALID: WAV data chunk is empty.');
    }

    const clampDb = (value: unknown) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.max(-24, Math.min(24, parsed)) : 0;
    };
    const inputGainDb = clampDb(options.inputGainDb);
    const outputGainDb = clampDb(options.outputGainDb);
    const inputGainLinear = Math.pow(10, inputGainDb / 20);
    const outputGainLinear = Math.pow(10, outputGainDb / 20);

    const samplesL = new Float32Array(totalSamples);
    const samplesR = new Float32Array(totalSamples);

    for (let index = 0; index < totalSamples; index += 1) {
      const byteOffset = dataOffset + index * 4;
      samplesL[index] = (inputBuffer.readInt16LE(byteOffset) / 32768) * inputGainLinear;
      samplesR[index] = (inputBuffer.readInt16LE(byteOffset + 2) / 32768) * inputGainLinear;
    }

    const safeBands = Array.isArray(bands) ? bands : [];
    const hasSolo = safeBands.some(band => Boolean(band.solo));
    const activeBands = safeBands
      .filter(band =>
        band.enabled &&
        !band.bypass &&
        (!hasSolo || Boolean(band.solo)) &&
        (
          Number(band.gain) !== 0 ||
          band.type === 'highpass' ||
          band.type === 'lowpass' ||
          band.type === 'notch'
        )
      )
      .map(band => ({
        ...band,
        freq: Math.max(10, Math.min(sampleRate / 2 - 10, Number(band.freq) || 1000)),
        gain: Math.max(-24, Math.min(24, Number(band.gain) || 0)),
        q: Math.max(0.1, Math.min(18, Number(band.q) || 1))
      }));

    for (const band of activeBands) {
      const coefficients = calculateBiquadCoeffs(
        band.type,
        band.freq,
        band.gain,
        band.q,
        sampleRate
      );

      let x1L = 0;
      let x2L = 0;
      let y1L = 0;
      let y2L = 0;
      let x1R = 0;
      let x2R = 0;
      let y1R = 0;
      let y2R = 0;

      for (let index = 0; index < totalSamples; index += 1) {
        const inputL = samplesL[index];
        const outputL =
          coefficients.b0 * inputL +
          coefficients.b1 * x1L +
          coefficients.b2 * x2L -
          coefficients.a1 * y1L -
          coefficients.a2 * y2L;
        x2L = x1L;
        x1L = inputL;
        y2L = y1L;
        y1L = outputL;
        samplesL[index] = outputL;

        const inputR = samplesR[index];
        const outputR =
          coefficients.b0 * inputR +
          coefficients.b1 * x1R +
          coefficients.b2 * x2R -
          coefficients.a1 * y1R -
          coefficients.a2 * y2R;
        x2R = x1R;
        x1R = inputR;
        y2R = y1R;
        y1R = outputR;
        samplesR[index] = outputR;
      }
    }

    const outputBuffer = Buffer.from(inputBuffer);
    let maxL = 0;
    let maxR = 0;
    let sumSquares = 0;
    let dotProduct = 0;
    let normL = 0;
    let normR = 0;

    for (let index = 0; index < totalSamples; index += 1) {
      const processedL = samplesL[index] * outputGainLinear;
      const processedR = samplesR[index] * outputGainLinear;
      const sampleL = Math.max(-1, Math.min(1, processedL));
      const sampleR = Math.max(-1, Math.min(1, processedR));

      maxL = Math.max(maxL, Math.abs(sampleL));
      maxR = Math.max(maxR, Math.abs(sampleR));
      sumSquares += (sampleL * sampleL + sampleR * sampleR) * 0.5;
      dotProduct += sampleL * sampleR;
      normL += sampleL * sampleL;
      normR += sampleR * sampleR;

      const byteOffset = dataOffset + index * 4;
      outputBuffer.writeInt16LE(Math.round(sampleL * 32767), byteOffset);
      outputBuffer.writeInt16LE(Math.round(sampleR * 32767), byteOffset + 2);
    }

    const rms = Math.sqrt(sumSquares / Math.max(1, totalSamples));
    const loudness = Number((20 * Math.log10(rms + 1e-9)).toFixed(1));
    const truePeak = Number((20 * Math.log10(Math.max(maxL, maxR) + 1e-9)).toFixed(2));
    const phaseCorrelation =
      normL > 0 && normR > 0
        ? Number((dotProduct / Math.sqrt(normL * normR)).toFixed(3))
        : 0;

    return {
      processedBuffer: outputBuffer,
      metrics: {
        lufs: loudness,
        truePeakDbtp: truePeak,
        peakL: Number(maxL.toFixed(3)),
        peakR: Number(maxR.toFixed(3)),
        stereoPhaseCorrelation: phaseCorrelation,
        activeBandsCount: activeBands.length
      }
    };
  }
}
