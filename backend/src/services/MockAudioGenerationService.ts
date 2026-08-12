export interface MockAudioGenerationParams {
  durationSec: number;
  bpm: number;
  genre?: string;
  mood?: string;
}

export interface MockAudioGenerationResult {
  audioBuffer: Buffer;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  durationSec: number;
}

export class MockAudioGenerationService {
  private static readonly SAMPLE_RATE = 44_100;
  private static readonly CHANNELS = 2;
  private static readonly BIT_DEPTH = 16;

  public static generate(params: MockAudioGenerationParams): MockAudioGenerationResult {
    const durationSec = Math.max(1, Math.min(240, Number(params.durationSec || 15)));
    const bpm = Math.max(40, Math.min(260, Number(params.bpm || 124)));
    const sampleRate = this.SAMPLE_RATE;
    const channels = this.CHANNELS;
    const bytesPerSample = this.BIT_DEPTH / 8;
    const totalFrames = Math.floor(durationSec * sampleRate);
    const dataSize = totalFrames * channels * bytesPerSample;
    const buffer = Buffer.allocUnsafe(44 + dataSize);

    this.writeWavHeader(buffer, dataSize, sampleRate, channels, this.BIT_DEPTH);

    const genreSeed = this.hashString(`${params.genre || 'Sonara'}|${params.mood || 'Mock'}`);
    const rootMidi = 36 + (genreSeed % 12);
    const rootHz = 440 * Math.pow(2, (rootMidi - 69) / 12);
    const fifthHz = rootHz * Math.pow(2, 7 / 12);
    const chordHz = rootHz * 2;
    const secondsPerBeat = 60 / bpm;
    const twoPi = Math.PI * 2;

    let offset = 44;

    for (let frame = 0; frame < totalFrames; frame += 1) {
      const t = frame / sampleRate;
      const beatPosition = (t / secondsPerBeat) % 1;
      const halfBeatPosition = (t / (secondsPerBeat / 2)) % 1;
      const barBeat = Math.floor(t / secondsPerBeat) % 4;

      const kickEnvelope = Math.exp(-beatPosition * 16);
      const kickFrequency = 48 + 52 * kickEnvelope;
      const kick = Math.sin(twoPi * kickFrequency * t) * kickEnvelope * 0.62;

      const bassGate = beatPosition < 0.78 ? 1 : Math.max(0, 1 - (beatPosition - 0.78) / 0.22);
      const bassFrequency = barBeat === 2 ? fifthHz : rootHz;
      const bass = Math.sin(twoPi * bassFrequency * t) * 0.24 * bassGate;

      const chordEnvelope = 0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, beatPosition));
      const pad = (
        Math.sin(twoPi * chordHz * t) +
        0.55 * Math.sin(twoPi * chordHz * 1.25 * t) +
        0.4 * Math.sin(twoPi * chordHz * 1.5 * t)
      ) * 0.055 * chordEnvelope;

      const hatEnvelope = halfBeatPosition < 0.08
        ? Math.exp(-halfBeatPosition * 55)
        : 0;
      const noise = this.pseudoNoise(frame + genreSeed);
      const hat = noise * hatEnvelope * 0.09;

      const pulse = Math.sin(twoPi * (rootHz * 4) * t) * 0.025 * (0.5 + 0.5 * Math.sin(twoPi * 0.2 * t));
      const mono = this.softClip(kick + bass + pad + hat + pulse);
      const stereoMotion = Math.sin(twoPi * 0.12 * t) * 0.035;
      const left = this.softClip(mono + pad * stereoMotion);
      const right = this.softClip(mono - pad * stereoMotion);

      buffer.writeInt16LE(Math.round(left * 32767), offset);
      buffer.writeInt16LE(Math.round(right * 32767), offset + 2);
      offset += 4;
    }

    return {
      audioBuffer: buffer,
      sampleRate,
      channels,
      bitDepth: this.BIT_DEPTH,
      durationSec
    };
  }

  private static writeWavHeader(
    buffer: Buffer,
    dataSize: number,
    sampleRate: number,
    channels: number,
    bitDepth: number
  ): void {
    const bytesPerSample = bitDepth / 8;
    const blockAlign = channels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;

    buffer.write('RIFF', 0, 'ascii');
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8, 'ascii');
    buffer.write('fmt ', 12, 'ascii');
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(channels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitDepth, 34);
    buffer.write('data', 36, 'ascii');
    buffer.writeUInt32LE(dataSize, 40);
  }

  private static hashString(value: string): number {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  private static pseudoNoise(seed: number): number {
    const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return ((value - Math.floor(value)) * 2) - 1;
  }

  private static softClip(value: number): number {
    return Math.max(-0.98, Math.min(0.98, Math.tanh(value * 1.15)));
  }
}
