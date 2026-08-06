import assert from 'node:assert/strict';
import { PatternGeneratorService } from '../src/services/PatternGeneratorService';
import { SongPlannerService } from '../src/services/SongPlannerService';
import { MixingMasteringEngineService } from '../src/services/MixingMasteringEngineService';

const SAMPLE_RATE = 44_100;
const BPM = 124;
const TEST_BARS = 8;

function createStereoPcm16Wav(
  totalBars: number,
  bpm: number,
  sampleRate: number = SAMPLE_RATE,
  shortfallFrames: number = 0,
  wideStereo: boolean = false
): Buffer {
  const channels = 2;
  const bytesPerFrame = channels * 2;
  const totalFrames = Math.round(totalBars * 4 * 60 / bpm * sampleRate) - shortfallFrames;
  const dataSize = totalFrames * bytesPerFrame;
  const wav = Buffer.alloc(44 + dataSize);

  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVE', 8, 'ascii');
  wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * bytesPerFrame, 28);
  wav.writeUInt16LE(bytesPerFrame, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(dataSize, 40);

  for (let frame = 0; frame < totalFrames; frame++) {
    const time = frame / sampleRate;
    const kickEnvelope = Math.exp(-((time * bpm / 60) % 1) * 12);
    const low = Math.sin(2 * Math.PI * 55 * time) * 0.32 * kickEnvelope;
    const mid = Math.sin(2 * Math.PI * 220 * time) * 0.12;
    const side = Math.sin(2 * Math.PI * 880 * time) * (wideStereo ? 0.5 : 0.04);
    const left = Math.max(-0.95, Math.min(0.95, low + mid + side));
    const right = Math.max(-0.95, Math.min(0.95, low + mid - side));
    const offset = 44 + frame * bytesPerFrame;
    wav.writeInt16LE(Math.round(left * 32767), offset);
    wav.writeInt16LE(Math.round(right * 32767), offset + 2);
  }

  return wav;
}

function readMaxPcmPeak(wav: Buffer): number {
  let peak = 0;
  for (let offset = 44; offset + 3 < wav.length; offset += 4) {
    peak = Math.max(
      peak,
      Math.abs(wav.readInt16LE(offset) / 32768),
      Math.abs(wav.readInt16LE(offset + 2) / 32768)
    );
  }
  return peak;
}

function testDeterministicRhythmGrid(): void {
  const first = PatternGeneratorService.generatePattern('Melodic House', 20260806);
  const second = PatternGeneratorService.generatePattern('Melodic House', 20260806);

  assert.deepEqual(first, second, 'same seed must generate the same groove');
  assert.equal(first.grid.timeSignature, '4/4');
  assert.equal(first.grid.stepsPerBar, 16);
  assert.equal(first.grid.phraseBars, 4);
  assert.equal(first.rhythm.kick.length, 16);
  assert.equal(first.rhythm.snare.length, 16);
  assert.match(first.promptDirective, /GROOVE_GRID: 4\/4/);
  assert.match(first.promptDirective, /KICK_STEPS\[1:1\.00,5:1\.00,9:1\.00,13:1\.00\]/);

  assert.equal(PatternGeneratorService.generatePattern('Peak Time Techno', 1).genre, 'techno');
  assert.equal(PatternGeneratorService.generatePattern('Neurofunk', 1).genre, 'drum & bass');
  assert.equal(PatternGeneratorService.generatePattern('Boom Bap', 1).genre, 'hip hop');
  assert.equal(PatternGeneratorService.generatePattern('Uplifting Trance', 1).genre, 'trance');
}

function testCompleteBarArrangement(): void {
  const plan = SongPlannerService.planSong(
    { genre: 'Melodic House', bpm: BPM },
    15
  );

  assert.equal(plan.totalBars, TEST_BARS);
  assert.equal(plan.sections.reduce((sum, section) => sum + section.bars, 0), TEST_BARS);
  assert.ok(plan.sections.every(section => section.startBar <= section.endBar));
  assert.equal(plan.sections.at(-1)?.endBar, TEST_BARS);
  assert.equal(plan.alignedDurationSec, 15.484);
  assert.match(plan.promptDirective, /never cut a measure/);
}

function testMasteringAndBarAlignment(): void {
  const input = createStereoPcm16Wav(TEST_BARS, BPM);
  const result = MixingMasteringEngineService.processBuffer(input, -14, -1, BPM);

  assert.ok(
    result.report.status === 'MASTER_AUDIT_PASSED'
      || result.report.status === 'MASTER_AUDIT_CORRECTED'
  );
  assert.equal(result.report.inputSupported, true);
  assert.equal(result.report.totalBars, TEST_BARS);
  assert.equal(result.report.barsAligned, true);
  assert.equal(result.report.integratedLufs, -14);
  assert.ok(result.report.truePeakDbtp <= -0.99, 'master must respect the -1 dBTP ceiling');
  assert.ok(result.report.stereoPhaseCorrelation >= 0.7, 'master must remain mono compatible');
  assert.equal(result.processedBuffer.toString('ascii', 0, 4), 'RIFF');
  assert.equal(result.processedBuffer.toString('ascii', 8, 12), 'WAVE');
  assert.equal(result.processedBuffer.readUInt32LE(40), result.processedBuffer.length - 44);

  const maxPeak = readMaxPcmPeak(result.processedBuffer);
  const ceiling = Math.pow(10, -1 / 20);
  assert.ok(maxPeak <= ceiling, `PCM peak ${maxPeak} exceeds limiter ceiling ${ceiling}`);

  const bypassed = MixingMasteringEngineService.processBuffer(Buffer.from('not-a-wave'));
  assert.equal(bypassed.report.status, 'MASTER_AUDIT_BYPASSED');
  assert.equal(bypassed.report.inputSupported, false);

  const shortWideInput = createStereoPcm16Wav(
    16,
    BPM,
    48_000,
    Math.round(0.039 * 48_000),
    true
  );
  const corrected = MixingMasteringEngineService.processBuffer(shortWideInput, -14, -1, BPM);
  assert.equal(corrected.report.status, 'MASTER_AUDIT_CORRECTED');
  assert.equal(corrected.report.totalBars, 16);
  assert.equal(corrected.report.barsAligned, true);
  assert.ok(corrected.report.stereoPhaseCorrelation >= 0.7);
  assert.ok(corrected.report.stereoWidthMultiplier < 1);
}

function run(): void {
  testDeterministicRhythmGrid();
  testCompleteBarArrangement();
  testMasteringAndBarAlignment();
  console.log('[PASS] rhythm grid, complete bars and mastering quality checks');
}

run();
