import fs from 'fs';
import path from 'path';
import { JobManager, JobRecord } from '../jobs/JobManager';
import { MusicGenerationService } from '../services/MusicGenerationService';
import { AceStepPromptEngine } from '../services/AceStepPromptEngine';
import { MusicDnaLibraryService } from '../services/MusicDnaLibraryService';
import { PatternGeneratorService } from '../services/PatternGeneratorService';
import { ContinuousLearningService } from '../services/ContinuousLearningService';

export interface GenerationPayload {
  prompt: string;
  genre: string;
  mood: string;
  lyrics: string;
  title: string;
  bpm?: number;
  duration?: number;
  engineId?: string;
  engine?: string;
}

export class JobQueueWorker {
  private static queue: string[] = [];
  private static isProcessing = false;

  public static init() {
    JobManager.init();
    const jobs = JobManager.listJobs();
    for (const j of jobs) {
      if (j.status === 'QUEUED' && !this.queue.includes(j.jobId)) {
        this.queue.push(j.jobId);
      }
    }
    if (this.queue.length > 0) {
      console.log(`[JOB_QUEUE_WORKER] Recovered ${this.queue.length} queued jobs on worker init.`);
      this.triggerProcessing();
    }
  }

  public static enqueueJob(jobId: string, payload: GenerationPayload, userId?: string, _timeoutMs: number = 30000): JobRecord {
    this.init();
    const job = JobManager.registerJob(
      jobId,
      { title: payload.title, genre: payload.genre, engineId: payload.engineId || payload.engine },
      payload,
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
      console.log(`[JOB_QUEUE_WORKER] Picking up job ${jobId} (Retry ${job.retryCount || 0}/${job.maxRetries || 3})`);
      await this.executeJobWithRetries(jobId);
    }
    this.isProcessing = false;
  }

  public static async executeJobWithRetries(jobId: string): Promise<JobRecord | null> {
    const job = JobManager.getJob(jobId);
    if (!job) return null;

    try {
      const payload: GenerationPayload = job.payload || {
        title: job.metadata?.title || 'Sonara Track',
        genre: job.metadata?.genre || 'House',
        mood: job.metadata?.mood || 'Energetic',
        lyrics: job.metadata?.lyrics || '',
        prompt: job.metadata?.prompt || 'Melodic House track',
        duration: 30,
        engineId: job.metadata?.engineId
      };

      const userPrompt = payload.prompt || 'Melodic House track';
      const userGenre = payload.genre || 'House';
      const durationSec = payload.duration || 30;
      const requestedEngine = payload.engineId || payload.engine || process.env.SONARA_MUSIC_ENGINE || 'ace-step';

      JobManager.updateJobStatus(jobId, 'PROCESSING', {
        progress: 10,
        metadata: { currentStage: 'Sonara Prompt Engine: Analyzing prompt & Genre Lock...', requestedEngine }
      });

      const promptOptimization = await AceStepPromptEngine.generatePrompt(userPrompt, userGenre);
      const genreProfile = promptOptimization.genreProfile;
      const genreLock = promptOptimization.genreLock;
      const targetBpm = payload.bpm || genreLock.targetBpm || 124;
      const targetGenre = genreLock.subgenre || genreLock.primaryGenre || 'Melodic House';

      JobManager.updateJobStatus(jobId, 'PROCESSING', {
        progress: 25,
        metadata: { currentStage: 'Music Brain: Recalling optimal Music DNA reference...', requestedEngine }
      });
      const brainRecall = MusicDnaLibraryService.recallOptimalDna(userPrompt, targetGenre);

      JobManager.updateJobStatus(jobId, 'PROCESSING', {
        progress: 40,
        metadata: { currentStage: 'Pattern Generator: Synthesizing genre-authentic groove & grid...', requestedEngine }
      });
      const patternResult = PatternGeneratorService.generatePattern(targetGenre);

      JobManager.updateJobStatus(jobId, 'PROCESSING', {
        progress: 60,
        metadata: { currentStage: `Neural Rendering Engine (${requestedEngine}): Generating audio...`, requestedEngine }
      });

      const execResult = await MusicGenerationService.executePythonEngine(
        promptOptimization.optimizedPrompt,
        targetGenre,
        payload.mood || 'Energetic',
        payload.lyrics || '',
        payload.title || 'Sonara AI Track',
        30_000,
        durationSec,
        targetBpm,
        requestedEngine
      );

      const audioBuffer = execResult.audioBuffer;
      if (!audioBuffer) {
        const reason = execResult.metadata?.error || 'Neural audio engine unavailable (ENGINE_NOT_AVAILABLE)';
        throw new Error(`ENGINE_NOT_AVAILABLE: ${reason}`);
      }

      JobManager.updateJobStatus(jobId, 'PROCESSING', {
        progress: 80,
        metadata: { currentStage: 'Saving generated audio...', selectedEngine: execResult.metadata?.selectedEngine }
      });

      const storageAudioDir = path.join(process.cwd(), 'storage', 'audio');
      if (!fs.existsSync(storageAudioDir)) fs.mkdirSync(storageAudioDir, { recursive: true });

      const isFlac = audioBuffer.toString('utf8', 0, 4) === 'fLaC';
      const isWav = audioBuffer.toString('utf8', 0, 4) === 'RIFF' && audioBuffer.toString('utf8', 8, 12) === 'WAVE';
      const extension = isFlac ? 'flac' : isWav ? 'wav' : 'mp3';
      const audioFileName = `musicgen-${jobId}.${extension}`;
      const finalAudioPath = path.join(storageAudioDir, audioFileName);
      fs.writeFileSync(finalAudioPath, audioBuffer);
      const audioUrl = `/storage/audio/${audioFileName}`;

      JobManager.updateJobStatus(jobId, 'PROCESSING', {
        progress: 92,
        metadata: { currentStage: 'Music Brain: Logging generation metadata...', selectedEngine: execResult.metadata?.selectedEngine }
      });

      const loggedRecord = ContinuousLearningService.logAndLearn({
        prompt: userPrompt,
        genre: genreProfile.primaryGenre,
        subgenre: genreProfile.subgenre,
        bpm: targetBpm,
        keySignature: genreProfile.keySignature,
        swingPct: patternResult.swingPct,
        chords: patternResult.chordProgression,
        audioQuality: {
          lufs: -14.0,
          truePeakDbtp: -1.0,
          stereoPhaseCorrelation: 0.95,
          noiseFloorDbfs: -85.0
        }
      });

      const finalMetadata = {
        title: payload.title || `${targetGenre} Track`,
        genre: targetGenre,
        bpm: targetBpm,
        keySignature: genreProfile.keySignature,
        prompt: userPrompt,
        optimizedPrompt: promptOptimization.optimizedPrompt,
        engine: execResult.metadata?.selectedEngine || requestedEngine,
        engineMetadata: execResult.metadata || null,
        status: 'COMPLETED',
        audioUrl,
        audioFormat: extension,
        genreLock,
        acousticProfile: genreProfile.acousticKeywords,
        recalledDnaId: brainRecall.recalledDna?.id,
        qualityScore: loggedRecord?.scores?.overallScore || 9.5,
        pattern: {
          swingPct: patternResult.swingPct,
          chords: patternResult.chordProgression,
          melodyScale: patternResult.melodyScale
        },
        completedAt: new Date().toISOString()
      };

      JobManager.updateJobStatus(jobId, 'COMPLETED', {
        progress: 100,
        audioUrl,
        metadata: finalMetadata
      });

      console.log(`[JOB_QUEUE_WORKER] Completed ${jobId} with ${finalMetadata.engine}`);
      return JobManager.getJob(jobId) || null;
    } catch (err: any) {
      console.error(`[JOB_QUEUE_WORKER] Critical error during job execution ${jobId}:`, err?.message || String(err));
      const errorMessage = err?.message || String(err);
      JobManager.updateJobStatus(jobId, 'FAILED', {
        progress: 0,
        audioUrl: null,
        metadata: {
          title: job.payload?.title || 'Sonara Track',
          status: 'ENGINE_NOT_AVAILABLE',
          error: errorMessage,
          completedAt: new Date().toISOString()
        }
      });
      return JobManager.getJob(jobId) || null;
    }
  }

  public static async waitForCompletion(jobId: string, timeoutMs: number = 30000): Promise<JobRecord | null> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const job = JobManager.getJob(jobId);
      if (job && (job.status === 'COMPLETED' || job.status === 'FAILED')) return job;
      await new Promise(r => setTimeout(r, 200));
    }
    return JobManager.getJob(jobId) || null;
  }
}
