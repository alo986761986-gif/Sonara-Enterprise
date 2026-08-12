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
    const beatIncrement = bpm / (60 * sampleRate);

    let beatPhase = 0;
    let beatIndex = 0;
    let kickPhase = 0;
    let bassPhase = 0;
    let padPhaseA = 0;
    let padPhaseB = 0;
    let padPhaseC = 0;
    let pulsePhase = 0;
    let stereoPhase = 0;
    let noiseState = (genreSeed || 1) >>> 0;
    let offset = 44;

    for (let frame = 0; frame < totalFrames; frame += 1) {
      const halfBeatPhase = (beatPhase * 2) % 1;
      const barBeat = beatIndex % 4;

      let kickEnvelope = Math.max(0, 1 - beatPhase * 8);
      kickEnvelope *= kickEnvelope;
      const kickFrequency = 48 + 58 * kickEnvelope;
      kickPhase = this.wrapPhase(kickPhase + kickFrequency / sampleRate);
      const kick = this.triangle(kickPhase) * kickEnvelope * 0.62;

      const bassFrequency = barBeat === 2 ? fifthHz : rootHz;
      bassPhase = this.wrapPhase(bassPhase + bassFrequency / sampleRate);
      const bassGate = beatPhase < 0.78
        ? 1
        : Math.max(0, 1 - (beatPhase - 0.78) / 0.22);
      const bass = this.triangle(bassPhase) * 0.22 * bassGate;

      padPhaseA = this.wrapPhase(padPhaseA + (rootHz * 2) / sampleRate);
      padPhaseB = this.wrapPhase(padPhaseB + (rootHz * 2.5) / sampleRate);
      padPhaseC = this.wrapPhase(padPhaseC + (rootHz * 3) / sampleRate);
      const chordEnvelope = 0.45 + 0.55 * (1 - Math.abs(beatPhase * 2 - 1));
      const pad = (
        this.triangle(padPhaseA) +
        0.55 * this.triangle(padPhaseB) +
        0.4 * this.triangle(padPhaseC)
      ) * 0.05 * chordEnvelope;

      const hatGate = halfBeatPhase < 0.09
        ? Math.max(0, 1 - halfBeatPhase / 0.09)
        : 0;
      noiseState = (Math.imul(noiseState, 1664525) + 1013904223) >>> 0;
      const noise = (noiseState / 0xffffffff) * 2 - 1;
      const hat = noise * hatGate * 0.08;

      pulsePhase = this.wrapPhase(pulsePhase + (rootHz * 4) / sampleRate);
      const pulse = this.triangle(pulsePhase) * 0.022;

      stereoPhase = this.wrapPhase(stereoPhase + 0.12 / sampleRate);
      const stereoMotion = this.triangle(stereoPhase) * 0.04;
      const mono = this.softClip(kick + bass + pad + hat + pulse);
      const left = this.softClip(mono + pad * stereoMotion);
      const right = this.softClip(mono - pad * stereoMotion);

      buffer.writeInt16LE(Math.round(left * 32767), offset);
      buffer.writeInt16LE(Math.round(right * 32767), offset + 2);
      offset += 4;

      beatPhase += beatIncrement;
      if (beatPhase >= 1) {
        beatPhase -= 1;
        beatIndex += 1;
      }
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

  private static triangle(phase: number): number {
    return 1 - 4 * Math.abs(phase - 0.5);
  }

  private static wrapPhase(phase: number): number {
    return phase >= 1 ? phase - 1 : phase;
  }

  private static softClip(value: number): number {
    return Math.max(-0.98, Math.min(0.98, value));
  }
}
