import fs from 'fs';
import path from 'path';
import { JobManager, JobRecord } from '../jobs/JobManager';
import { MusicGenerationService } from '../services/MusicGenerationService';

export interface GenerationPayload {
  prompt: string;
  genre: string;
  mood: string;
  lyrics: string;
  title: string;
  bpm?: number;
  duration?: number;
  engineId?: string;
  key?: string;
}

export class JobQueueWorker {
  private static queue: string[] = [];
  private static isProcessing = false;

  public static init() {
    JobManager.init();
    for (const job of JobManager.listJobs()) {
      if (job.status === 'QUEUED' && !this.queue.includes(job.jobId)) {
        this.queue.push(job.jobId);
      }
    }
    if (this.queue.length > 0) this.triggerProcessing();
  }

  public static enqueueJob(
    jobId: string,
    payload: GenerationPayload,
    userId?: string,
    _timeoutMs: number = 900000
  ): JobRecord {
    this.init();
    const acePayload: GenerationPayload = {
      ...payload,
      engineId: 'sonara_acestep_v15'
    };
    const job = JobManager.registerJob(
      jobId,
      { title: acePayload.title, genre: acePayload.genre },
      acePayload,
      userId
    );
    if (!this.queue.includes(jobId)) this.queue.push(jobId);
    this.triggerProcessing();
    return job;
  }

  private static triggerProcessing() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    setImmediate(() => this.processQueueLoop());
  }

  private static async processQueueLoop() {
    while (this.queue.length > 0) {
      const jobId = this.queue.shift();
      if (!jobId) continue;
      const job = JobManager.getJob(jobId);
      if (!job || job.status === 'COMPLETED') continue;
      await this.executeJobWithRetries(jobId);
    }
    this.isProcessing = false;
  }

  public static async executeJobWithRetries(jobId: string): Promise<JobRecord | null> {
    const job = JobManager.getJob(jobId);
    if (!job) return null;

    try {
      const payload: GenerationPayload = job.payload || {
        title: 'Sonara ACE Track',
        genre: 'Deep House',
        mood: 'Energetic',
        lyrics: '',
        prompt: 'Deep House club track',
        bpm: 124,
        duration: 30,
        engineId: 'sonara_acestep_v15',
        key: 'F Minor'
      };

      const durationSec = Math.max(10, Math.min(600, Number(payload.duration || 30)));
      const targetBpm = Math.max(30, Math.min(300, Number(payload.bpm || 124)));
      const targetKey = String(payload.key || 'F Minor');
      const targetGenre = String(payload.genre || 'Deep House');

      JobManager.updateJobStatus(jobId, 'PROCESSING', {
        progress: 15,
        metadata: { currentStage: 'ACE-Step 1.5: preparing generation request...' }
      });

      JobManager.updateJobStatus(jobId, 'PROCESSING', {
        progress: 40,
        metadata: { currentStage: 'ACE-Step 1.5: generating neural audio on Lightning L4...' }
      });

      const execResult = await MusicGenerationService.executePythonEngine(
        payload.prompt,
        targetGenre,
        payload.mood || 'Energetic',
        payload.lyrics || '',
        payload.title || 'Sonara ACE Track',
        900000,
        durationSec,
        targetBpm,
        'sonara_acestep_v15',
        targetKey
      );

      if (!execResult.audioBuffer) {
        throw new Error(execResult.metadata?.error || 'ACE-Step returned no audio.');
      }

      if (!MusicGenerationService.validateAudioBuffer(execResult.audioBuffer)) {
        throw new Error('ACE-Step returned an invalid WAV payload.');
      }

      JobManager.updateJobStatus(jobId, 'PROCESSING', {
        progress: 90,
        metadata: { currentStage: 'Sonara: saving generated WAV...' }
      });

      const storageAudioDir = path.join(process.cwd(), 'storage', 'audio');
      fs.mkdirSync(storageAudioDir, { recursive: true });

      const audioFileName = `musicgen-${jobId}.wav`;
      const finalAudioPath = path.join(storageAudioDir, audioFileName);
      fs.writeFileSync(finalAudioPath, execResult.audioBuffer);
      const audioUrl = `/storage/audio/${audioFileName}`;

      const finalMetadata = {
        title: payload.title || 'Sonara ACE Track',
        genre: targetGenre,
        bpm: targetBpm,
        keySignature: targetKey,
        prompt: payload.prompt,
        engine: 'Sonara ACE-Step 1.5 Engine',
        engineId: 'sonara_acestep_v15',
        model: execResult.metadata?.model || 'acestep-v15-turbo',
        engineMetadata: execResult.metadata || null,
        status: 'COMPLETED',
        audioUrl,
        completedAt: new Date().toISOString()
      };

      JobManager.updateJobStatus(jobId, 'COMPLETED', {
        progress: 100,
        audioUrl,
        metadata: finalMetadata
      });

      console.log(`[ACE_STEP_WORKER] Completed ${jobId}: ${audioFileName}`);
      return JobManager.getJob(jobId) || null;
    } catch (err: any) {
      const message = err?.message || String(err);
      console.error(`[ACE_STEP_WORKER] Generation failed for ${jobId}:`, message);
      JobManager.updateJobStatus(jobId, 'FAILED', {
        progress: 0,
        audioUrl: null,
        error: message,
        metadata: {
          title: job.payload?.title || 'Sonara ACE Track',
          engine: 'Sonara ACE-Step 1.5 Engine',
          engineId: 'sonara_acestep_v15',
          status: 'FAILED',
          error: message,
          completedAt: new Date().toISOString()
        }
      });
      return JobManager.getJob(jobId) || null;
    }
  }

  public static async waitForCompletion(jobId: string, timeoutMs: number = 900000): Promise<JobRecord | null> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const job = JobManager.getJob(jobId);
      if (job && (job.status === 'COMPLETED' || job.status === 'FAILED')) return job;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    return JobManager.getJob(jobId) || null;
  }
}
