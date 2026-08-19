import { JobQueueWorker, type GenerationPayload } from '../workers/JobQueueWorker';
import { AceStepEngine } from '../engine/AceStepEngine';

let jobCounter = 1000;

export class MusicGenerationService {
  public static validateAudioBuffer(buffer: Buffer): boolean {
    if (!buffer || buffer.length < 44) return false;
    return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE';
  }

  public static async executePythonEngine(
    promptStr: string,
    genreStr: string,
    moodStr: string,
    lyricsStr: string,
    titleStr: string,
    timeoutMs: number = 900000,
    durationSec: number = 30,
    bpm: number = 128,
    _engineId: string = 'sonara_acestep_v15',
    keyScale: string = ''
  ): Promise<{ audioBuffer: Buffer | null; audioPath: string | null; metadata: Record<string, any> | null }> {
    const result = await AceStepEngine.getInstance().generate({
      prompt: promptStr,
      genre: genreStr,
      mood: moodStr,
      lyrics: lyricsStr,
      title: titleStr,
      timeoutMs,
      durationSec,
      bpm,
      key: keyScale
    });

    return {
      audioBuffer: result.audioBuffer,
      audioPath: result.audioPath,
      metadata: {
        ...(result.metadata || {}),
        status: result.status,
        error: result.error || null,
        engineId: 'sonara_acestep_v15'
      }
    };
  }

  static async processGeneration(payload: GenerationPayload, userId: string): Promise<Record<string, any>> {
    jobCounter++;
    const jobId = `job_gen_${Date.now()}_${jobCounter}`;
    const acePayload: GenerationPayload = {
      ...payload,
      engineId: 'sonara_acestep_v15'
    };

    JobQueueWorker.enqueueJob(jobId, acePayload, userId, 900000);
    const completedJob = await JobQueueWorker.waitForCompletion(jobId, 900000);

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
      metadata: completedJob?.metadata || {
        error: completedJob?.error || 'ACE-Step job processing timeout'
      }
    };
  }
}
