import { StabilityProvider, GenerationPayload } from '../providers/StabilityProvider';
import { JobManager } from '../jobs/JobManager';
import { JobQueueWorker } from '../workers/JobQueueWorker';
import { FirebaseStorageService } from '../storage/FirebaseStorage';
import { AudioAnalyzer } from './AudioAnalyzer';
import { MixingMasteringEngineService } from './MixingMasteringEngineService';
import { AceStepEngine } from '../engine/AceStepEngine';
import { LeVo2ResearchEngine } from '../engine/LeVo2ResearchEngine';
import fs from 'fs';
import path from 'path';

let jobCounter = 1000;
let projCounter = 500;

function normalizeEngineSelector(value?: string): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (['levo2', 'levo', 'levo2-research', 'sonara_levo2_research', 'levo2-v2-large'].includes(normalized)) {
    return 'levo2-research';
  }
  return 'ace-step';
}

export class MusicGenerationService {
  public static validateAudioBuffer(buffer: Buffer): boolean {
    if (!buffer || buffer.length < 100000) return false;
    const isWav = buffer.toString('utf8', 0, 4) === 'RIFF' && buffer.toString('utf8', 8, 12) === 'WAVE';
    const isMp3 = buffer.toString('utf8', 0, 3) === 'ID3' || (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0);
    const isFlac = buffer.toString('utf8', 0, 4) === 'fLaC';
    return isWav || isMp3 || isFlac;
  }

  public static createFallbackAudio(
    titleStr: string = 'Sonara Track',
    durationSec: number = 30,
    targetBpm: number = 128
  ): { audioBuffer: Buffer; audioPath: string } {
    const outputDir = path.join(process.cwd(), 'output', `dsp_fallback_${Date.now()}`);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const audioPath = path.join(outputDir, 'audio.wav');

    const sampleRate = 44100;
    const numChannels = 2;
    const bitsPerSample = 16;
    const numFrames = sampleRate * durationSec;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = numFrames * blockAlign;
    const bufferSize = 44 + dataSize;

    const buffer = Buffer.alloc(bufferSize);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * blockAlign, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    const bpm = Math.max(60, Math.min(200, targetBpm));
    const samplesPerBeat = (sampleRate * 60.0) / bpm;
    const samplesPerTick = samplesPerBeat / 4.0;
    const samplesPerBar = samplesPerBeat * 4.0;

    let kickPhase = 0;
    let bassPhase = 0;
    let leadPhase = 0;

    let offset = 44;
    for (let i = 0; i < numFrames; i++) {
      const tickIndex = Math.floor(i / samplesPerTick);
      const tickSampleOffset = i % samplesPerTick;
      const tickPhase = tickSampleOffset / samplesPerTick;

      const beatIndex = Math.floor(i / samplesPerBeat);
      const beatSampleOffset = i % samplesPerBeat;
      const beatPhase = beatSampleOffset / samplesPerBeat;

      const barIndex = Math.floor(i / samplesPerBar);
      const totalBars = Math.max(1, Math.floor(numFrames / samplesPerBar));
      const sectionProgress = barIndex / totalBars;

      let kickWeight = 0.45;
      let snareWeight = 0.30;
      let hihatWeight = 0.20;
      let bassWeight = 0.35;
      let leadWeight = 0.25;

      if (sectionProgress < 0.15) {
        kickWeight = 0.25; snareWeight = 0.0; hihatWeight = 0.15; bassWeight = 0.20; leadWeight = 0.10;
      } else if (sectionProgress < 0.35) {
        kickWeight = 0.40; snareWeight = 0.25; hihatWeight = 0.20; bassWeight = 0.30; leadWeight = 0.15;
      } else if (sectionProgress < 0.75) {
        kickWeight = 0.50; snareWeight = 0.35; hihatWeight = 0.25; bassWeight = 0.35; leadWeight = 0.30;
      } else if (sectionProgress < 0.88) {
        kickWeight = 0.0; snareWeight = 0.10; hihatWeight = 0.15; bassWeight = 0.20; leadWeight = 0.40;
      } else {
        kickWeight = 0.30; snareWeight = 0.0; hihatWeight = 0.15; bassWeight = 0.20; leadWeight = 0.10;
      }

      const kickEnv = Math.exp(-15.0 * beatPhase);
      const kickFreq = 45.0 + 75.0 * kickEnv;
      kickPhase += (2.0 * Math.PI * kickFreq) / sampleRate;
      const kickSignal = Math.sin(kickPhase) * kickEnv * kickWeight;

      const isSnareBeat = (beatIndex % 2) === 1;
      const snareEnv = isSnareBeat ? Math.exp(-18.0 * beatPhase) : 0.0;
      const snareNoise = (Math.sin(i * 0.1) * 0.5 + Math.sin(2.0 * Math.PI * 220.0 * (beatSampleOffset / sampleRate)) * 0.5);
      const snareSignal = snareNoise * snareEnv * snareWeight;

      const is16thTick = tickIndex % 2 === 1;
      const hihatEnv = Math.exp(-35.0 * tickPhase);
      const hihatNoise = Math.sin(i * 0.77);
      const hihatSignal = hihatNoise * hihatEnv * (is16thTick ? hihatWeight * 1.2 : hihatWeight * 0.7);

      const chordIdx = barIndex % 4;
      const bassFreqs = [130.81, 98.00, 110.00, 87.31];
      const currentBassFreq = bassFreqs[chordIdx];
      bassPhase += (2.0 * Math.PI * currentBassFreq) / sampleRate;
      const bassEnv = Math.exp(-7.0 * tickPhase);
      const bassSignal = (Math.sin(bassPhase) + 0.3 * Math.sin(bassPhase * 2.0)) * bassEnv * bassWeight;

      const arpNotes = [currentBassFreq * 2.0, currentBassFreq * 2.5, currentBassFreq * 3.0, currentBassFreq * 4.0];
      const currentLeadFreq = arpNotes[tickIndex % 4];
      leadPhase += (2.0 * Math.PI * currentLeadFreq) / sampleRate;
      const leadEnv = Math.exp(-12.0 * tickPhase);
      const leadSignal = Math.sin(leadPhase) * leadEnv * leadWeight;

      const leftMix = kickSignal + snareSignal + (hihatSignal * 0.8) + bassSignal + (leadSignal * 1.15);
      const rightMix = kickSignal + snareSignal + (hihatSignal * 1.2) + bassSignal + (leadSignal * 0.85);

      const ceiling = 0.891;
      const clampedL = Math.max(-ceiling, Math.min(ceiling, leftMix));
      const clampedR = Math.max(-ceiling, Math.min(ceiling, rightMix));

      const leftVal = Math.floor(clampedL * 32767);
      const rightVal = Math.floor(clampedR * 32767);

      buffer.writeInt16LE(leftVal, offset);
      buffer.writeInt16LE(rightVal, offset + 2);
      offset += 4;
    }

    const { processedBuffer, report } = MixingMasteringEngineService.processBuffer(buffer, -14.0, -1.0, bpm);

    fs.writeFileSync(audioPath, processedBuffer);
    console.log(`[ENTERPRISE_LOG] [DSP_MIX_MASTER_ENGINE] Applied Mix & Master (-14 LUFS, -1.0 dBTP, Phase Corr: ${report.stereoPhaseCorrelation}): ${audioPath}`);
    return { audioBuffer: processedBuffer, audioPath };
  }

  public static async executePythonEngine(
    promptStr: string,
    genreStr: string,
    moodStr: string,
    lyricsStr: string,
    titleStr: string,
    timeoutMs: number = 30000,
    durationSec: number = 15,
    bpm: number = 128,
    engineSelector?: string
  ): Promise<{ audioBuffer: Buffer | null; audioPath: string | null; metadata: Record<string, any> | null }> {
    const selectedEngine = normalizeEngineSelector(
      engineSelector || process.env.SONARA_MUSIC_ENGINE || 'ace-step'
    );
    const useLeVo2Research = selectedEngine === 'levo2-research';

    const engine = useLeVo2Research
      ? LeVo2ResearchEngine.getInstance()
      : AceStepEngine.getInstance();

    const effectiveTimeoutMs = useLeVo2Research
      ? Math.max(Number(process.env.LEVO2_RESEARCH_TIMEOUT_MS || 1_800_000), timeoutMs, 120_000)
      : Math.max(timeoutMs, 120_000);

    console.log(
      `[ENTERPRISE_LOG] [MUSIC_GEN_SERVICE] Selected engine: ${selectedEngine}`
    );

    const result = await engine.generate({
      prompt: promptStr,
      genre: genreStr,
      mood: moodStr,
      lyrics: lyricsStr,
      title: titleStr,
      timeoutMs: effectiveTimeoutMs,
      durationSec,
      bpm
    });

    return {
      audioBuffer: result.audioBuffer,
      audioPath: result.audioPath,
      metadata: {
        ...(result.metadata || {}),
        selectedEngine,
        status: result.status,
        ...(result.error ? { error: result.error } : {})
      }
    };
  }

  static async processGeneration(payload: GenerationPayload, userId: string): Promise<Record<string, any>> {
    jobCounter++;
    projCounter++;
    const jobId = `job_gen_${Date.now()}_${jobCounter}`;

    const requestedEngine = normalizeEngineSelector(
      String((payload as any).engineId || (payload as any).engine || process.env.SONARA_MUSIC_ENGINE || 'ace-step')
    );
    const waitTimeoutMs = requestedEngine === 'levo2-research'
      ? Math.max(Number(process.env.LEVO2_RESEARCH_TIMEOUT_MS || 1_800_000), 120_000)
      : Math.max(Number(process.env.ACE_STEP_TIMEOUT_MS || 600_000), 120_000);

    console.log(`[ENTERPRISE_LOG] [MUSIC_GEN_SERVICE] Enqueuing Generation Request | JobId: ${jobId} | User: ${userId} | Engine: ${requestedEngine}`);

    JobQueueWorker.enqueueJob(jobId, payload as any, userId, waitTimeoutMs);

    const completedJob = await JobQueueWorker.waitForCompletion(jobId, waitTimeoutMs);

    if (completedJob && completedJob.status === 'COMPLETED') {
      return {
        jobId: completedJob.jobId,
        status: completedJob.status,
        audioUrl: completedJob.audioUrl,
        metadata: completedJob.metadata
      };
    }

    return {
      jobId,
      status: completedJob ? completedJob.status : 'QUEUED',
      audioUrl: completedJob?.audioUrl || null,
      metadata: completedJob?.metadata || { error: completedJob?.error || 'Job processing timeout' }
    };
  }
}
