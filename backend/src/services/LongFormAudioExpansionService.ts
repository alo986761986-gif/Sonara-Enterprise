export interface LongFormSection {
  startSec: number;
  durationSec: number;
  energy: number;
}

export interface LongFormExpansionReport {
  strategy: 'BAR_ALIGNED_NEURAL_CORE_EXPANSION';
  sourceDurationSec: number;
  targetDurationSec: number;
  outputDurationSec: number;
  sampleRate: number;
  crossfadeMs: number;
  loopCount: number;
  sectionCount: number;
}

interface ParsedPcm16StereoWav {
  sampleRate: number;
  dataOffset: number;
  frameCount: number;
}

/**
 * Expands a loopable neural core into a long-form PCM16 stereo WAV.
 * Loop boundaries use a short crossfade, while the supplied arrangement
 * controls section energy. Subtle mid/side variation prevents identical
 * repetitions without changing pitch, tempo or bar alignment.
 */
export class LongFormAudioExpansionService {
  public static expand(
    inputBuffer: Buffer,
    targetDurationSec: number,
    sections: LongFormSection[] = []
  ): { processedBuffer: Buffer; report: LongFormExpansionReport } {
    const parsed = this.parsePcm16StereoWav(inputBuffer);
    const targetFrames = Math.max(
      parsed.frameCount,
      Math.round(Number(targetDurationSec) * parsed.sampleRate)
    );

    if (!Number.isFinite(targetFrames) || targetFrames <= 0) {
      throw new Error('LONG_FORM_INVALID_DURATION: target duration must be positive.');
    }

    if (targetFrames === parsed.frameCount) {
      return {
        processedBuffer: Buffer.from(inputBuffer),
        report: {
          strategy: 'BAR_ALIGNED_NEURAL_CORE_EXPANSION',
          sourceDurationSec: Number((parsed.frameCount / parsed.sampleRate).toFixed(3)),
          targetDurationSec: Number(targetDurationSec),
          outputDurationSec: Number((targetFrames / parsed.sampleRate).toFixed(3)),
          sampleRate: parsed.sampleRate,
          crossfadeMs: 0,
          loopCount: 1,
          sectionCount: sections.length
        }
      };
    }

    const crossfadeFrames = Math.max(
      1,
      Math.min(
        Math.round(parsed.sampleRate * 0.35),
        Math.floor(parsed.frameCount / 8)
      )
    );
    const cycleFrames = parsed.frameCount - crossfadeFrames;
    if (cycleFrames <= crossfadeFrames) {
      throw new Error('LONG_FORM_CORE_TOO_SHORT: neural core cannot be looped safely.');
    }

    const output = this.createPcm16StereoWav(parsed.sampleRate, targetFrames);
    const normalizedSections = sections
      .filter(section =>
        Number.isFinite(section.startSec) &&
        Number.isFinite(section.durationSec) &&
        section.durationSec > 0
      )
      .sort((left, right) => left.startSec - right.startSec);

    const widthPattern = [0.92, 1.04, 0.98, 1.08];
    const cycleGainPattern = [0.98, 1.0, 0.99, 1.01];
    const sectionTransitionFrames = Math.max(1, Math.round(parsed.sampleRate * 1.5));
    const fadeInFrames = Math.max(1, Math.round(parsed.sampleRate * 0.25));
    const fadeOutFrames = Math.max(1, Math.round(parsed.sampleRate * 1.0));
    let activeSectionIndex = 0;

    for (let outputFrame = 0; outputFrame < targetFrames; outputFrame += 1) {
      const phase = outputFrame % cycleFrames;
      const cycleIndex = Math.floor(outputFrame / cycleFrames);
      let left: number;
      let right: number;

      // Preserve the genuine opening on the first cycle. Crossfading starts
      // only at the first wrap boundary, so the rendered song never begins
      // with audio taken from the end of the neural core.
      if (cycleIndex > 0 && phase < crossfadeFrames) {
        const mix = phase / crossfadeFrames;
        const tailFrame = parsed.frameCount - crossfadeFrames + phase;
        const headFrame = phase;
        const tail = this.readFrame(inputBuffer, parsed.dataOffset, tailFrame);
        const head = this.readFrame(inputBuffer, parsed.dataOffset, headFrame);
        left = tail.left * (1 - mix) + head.left * mix;
        right = tail.right * (1 - mix) + head.right * mix;
      } else {
        const frame = this.readFrame(inputBuffer, parsed.dataOffset, phase);
        left = frame.left;
        right = frame.right;
      }

      while (
        activeSectionIndex < normalizedSections.length - 1 &&
        outputFrame / parsed.sampleRate >=
          normalizedSections[activeSectionIndex].startSec +
          normalizedSections[activeSectionIndex].durationSec
      ) {
        activeSectionIndex += 1;
      }

      const activeSection = normalizedSections[activeSectionIndex];
      const currentEnergy = activeSection
        ? Math.max(0, Math.min(1, Number(activeSection.energy)))
        : 1;
      const currentSectionGain = 0.78 + currentEnergy * 0.22;
      const previousSection = normalizedSections[Math.max(0, activeSectionIndex - 1)];
      const previousEnergy = previousSection
        ? Math.max(0, Math.min(1, Number(previousSection.energy)))
        : currentEnergy;
      const previousSectionGain = 0.78 + previousEnergy * 0.22;
      const sectionStartFrame = activeSection
        ? Math.round(activeSection.startSec * parsed.sampleRate)
        : 0;
      const sectionBlend = Math.max(
        0,
        Math.min(1, (outputFrame - sectionStartFrame) / sectionTransitionFrames)
      );
      const arrangementGain =
        previousSectionGain * (1 - sectionBlend) + currentSectionGain * sectionBlend;

      const mid = (left + right) * 0.5;
      const side = (left - right) * 0.5;
      const width = widthPattern[cycleIndex % widthPattern.length];
      const cycleGain = cycleGainPattern[cycleIndex % cycleGainPattern.length];
      left = (mid + side * width) * arrangementGain * cycleGain;
      right = (mid - side * width) * arrangementGain * cycleGain;

      const fadeIn = Math.min(1, outputFrame / fadeInFrames);
      const remainingFrames = targetFrames - 1 - outputFrame;
      const fadeOut = Math.min(1, remainingFrames / fadeOutFrames);
      const edgeGain = Math.max(0, Math.min(fadeIn, fadeOut));

      this.writeFrame(
        output,
        44,
        outputFrame,
        left * edgeGain,
        right * edgeGain
      );
    }

    return {
      processedBuffer: output,
      report: {
        strategy: 'BAR_ALIGNED_NEURAL_CORE_EXPANSION',
        sourceDurationSec: Number((parsed.frameCount / parsed.sampleRate).toFixed(3)),
        targetDurationSec: Number(Number(targetDurationSec).toFixed(3)),
        outputDurationSec: Number((targetFrames / parsed.sampleRate).toFixed(3)),
        sampleRate: parsed.sampleRate,
        crossfadeMs: Math.round((crossfadeFrames / parsed.sampleRate) * 1000),
        loopCount: Math.ceil(targetFrames / cycleFrames),
        sectionCount: normalizedSections.length
      }
    };
  }

  private static parsePcm16StereoWav(buffer: Buffer): ParsedPcm16StereoWav {
    if (
      !buffer ||
      buffer.length < 44 ||
      buffer.toString('ascii', 0, 4) !== 'RIFF' ||
      buffer.toString('ascii', 8, 12) !== 'WAVE'
    ) {
      throw new Error('LONG_FORM_INPUT_INVALID: expected a RIFF/WAVE file.');
    }

    let audioFormat = 0;
    let channels = 0;
    let sampleRate = 0;
    let bitsPerSample = 0;
    let dataOffset = -1;
    let dataSize = 0;
    let cursor = 12;

    while (cursor + 8 <= buffer.length) {
      const chunkId = buffer.toString('ascii', cursor, cursor + 4);
      const chunkSize = buffer.readUInt32LE(cursor + 4);
      const chunkDataOffset = cursor + 8;
      if (chunkDataOffset + chunkSize > buffer.length) {
        throw new Error(`LONG_FORM_INPUT_INVALID: malformed WAV chunk ${chunkId}.`);
      }

      if (chunkId === 'fmt ' && chunkSize >= 16) {
        audioFormat = buffer.readUInt16LE(chunkDataOffset);
        channels = buffer.readUInt16LE(chunkDataOffset + 2);
        sampleRate = buffer.readUInt32LE(chunkDataOffset + 4);
        bitsPerSample = buffer.readUInt16LE(chunkDataOffset + 14);
      } else if (chunkId === 'data') {
        dataOffset = chunkDataOffset;
        dataSize = chunkSize;
        break;
      }

      cursor = chunkDataOffset + chunkSize + (chunkSize % 2);
    }

    if (
      audioFormat !== 1 ||
      channels !== 2 ||
      bitsPerSample !== 16 ||
      sampleRate < 8000 ||
      dataOffset < 0
    ) {
      throw new Error(
        `LONG_FORM_INPUT_UNSUPPORTED: requires PCM16 stereo WAV; received format=${audioFormat}, channels=${channels}, bits=${bitsPerSample}, sampleRate=${sampleRate}.`
      );
    }

    const readableDataSize = Math.min(dataSize, buffer.length - dataOffset);
    const frameCount = Math.floor(readableDataSize / 4);
    if (frameCount <= 0) {
      throw new Error('LONG_FORM_INPUT_INVALID: WAV data chunk is empty.');
    }

    return { sampleRate, dataOffset, frameCount };
  }

  private static createPcm16StereoWav(sampleRate: number, frameCount: number): Buffer {
    const dataSize = frameCount * 4;
    const buffer = Buffer.alloc(44 + dataSize);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(2, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 4, 28);
    buffer.writeUInt16LE(4, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
    return buffer;
  }

  private static readFrame(
    buffer: Buffer,
    dataOffset: number,
    frameIndex: number
  ): { left: number; right: number } {
    const offset = dataOffset + frameIndex * 4;
    return {
      left: buffer.readInt16LE(offset) / 32768,
      right: buffer.readInt16LE(offset + 2) / 32768
    };
  }

  private static writeFrame(
    buffer: Buffer,
    dataOffset: number,
    frameIndex: number,
    left: number,
    right: number
  ) {
    const offset = dataOffset + frameIndex * 4;
    const safeLeft = Math.max(-1, Math.min(1, left));
    const safeRight = Math.max(-1, Math.min(1, right));
    buffer.writeInt16LE(Math.round(safeLeft * 32767), offset);
    buffer.writeInt16LE(Math.round(safeRight * 32767), offset + 2);
  }
}
