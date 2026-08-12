import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { AceStepPromptEngine } from '../services/AceStepPromptEngine';
import { JobQueueWorker } from '../workers/JobQueueWorker';
import { EngineDiagnosticService } from '../engine/EngineDiagnosticService';
import { PythonEnvironmentManager } from '../engine/PythonEnvironmentManager';
import { AceStepEngine } from '../engine/AceStepEngine';
import { JobManager } from '../jobs/JobManager';
import { MockAudioGenerationService } from '../services/MockAudioGenerationService';

const router = Router();

// Unified Engine Registry Data
const ENGINE_MODELS = [
  {
    id: 'sonara_ace_step_v12',
    name: 'Sonara AI Native Engine (ACE-Step V12 Core)',
    version: '12.0.0-UNIFIED',
    provider: 'sonara_native',
    vramRequiredMb: 2048,
    ramRequiredMb: 4096,
    averageTimeSec: 1.5,
    stereoSupport: true,
    maxDurationSec: 600,
    stemsSupport: true,
    continuationSupport: true,
    inpaintSupport: true,
    qualityScore: 100
  },
  {
    id: 'musicgen_stereo_large',
    name: 'MusicGen Stereo Large (Meta Plugin)',
    version: '1.2.0',
    provider: 'meta',
    vramRequiredMb: 4096,
    ramRequiredMb: 8192,
    averageTimeSec: 4.5,
    stereoSupport: true,
    maxDurationSec: 300,
    stemsSupport: false,
    continuationSupport: true,
    inpaintSupport: false,
    qualityScore: 92
  },
  {
    id: 'audiocraft_multitask',
    name: 'AudioCraft Multi-Task (Meta Plugin)',
    version: '1.0.1',
    provider: 'meta',
    vramRequiredMb: 6144,
    ramRequiredMb: 12288,
    averageTimeSec: 5.2,
    stereoSupport: true,
    maxDurationSec: 360,
    stemsSupport: true,
    continuationSupport: true,
    inpaintSupport: true,
    qualityScore: 94
  }
];

let activeEngineId = 'sonara_ace_step_v12';

const sleep = (milliseconds: number) =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

interface MockGenerationPayload {
  title: string;
  genre: string;
  mood: string;
  lyrics: string;
  prompt: string;
  bpm: number;
  duration: number;
}

async function runMockGeneration(
  jobId: string,
  payload: MockGenerationPayload,
  optimizationResult: any
): Promise<void> {
  try {
    JobManager.updateJobStatus(jobId, 'PROCESSING', {
      progress: 10,
      metadata: {
        currentStage: 'DEV Mock: analyzing prompt and genre locally...',
        mockMode: true
      }
    });
    await sleep(350);

    JobManager.updateJobStatus(jobId, 'PROCESSING', {
      progress: 28,
      metadata: {
        currentStage: 'DEV Mock: simulating Music Brain recall (no learning is written)...',
        mockMode: true
      }
    });
    await sleep(350);

    JobManager.updateJobStatus(jobId, 'PROCESSING', {
      progress: 46,
      metadata: {
        currentStage: 'DEV Mock: building a local test groove...',
        mockMode: true
      }
    });
    await sleep(350);

    JobManager.updateJobStatus(jobId, 'PROCESSING', {
      progress: 64,
      metadata: {
        currentStage: 'DEV Mock: rendering GPU-free WAV audio on this PC...',
        mockMode: true
      }
    });

    const generated = MockAudioGenerationService.generate({
      durationSec: payload.duration,
      bpm: payload.bpm,
      genre: payload.genre,
      mood: payload.mood
    });

    JobManager.updateJobStatus(jobId, 'PROCESSING', {
      progress: 82,
      metadata: {
        currentStage: 'DEV Mock: writing WAV and preparing EQ/player test...',
        mockMode: true
      }
    });

    const storageAudioDir = path.join(process.cwd(), 'storage', 'audio');
    if (!fs.existsSync(storageAudioDir)) {
      fs.mkdirSync(storageAudioDir, { recursive: true });
    }

    const audioFileName = `musicgen-${jobId}.wav`;
    const finalAudioPath = path.join(storageAudioDir, audioFileName);
    fs.writeFileSync(finalAudioPath, generated.audioBuffer);
    const audioUrl = `/storage/audio/${audioFileName}`;

    await sleep(300);

    JobManager.updateJobStatus(jobId, 'PROCESSING', {
      progress: 94,
      audioUrl,
      metadata: {
        currentStage: 'DEV Mock: finalizing local test track...',
        mockMode: true
      }
    });
    await sleep(250);

    const targetGenre =
      optimizationResult?.genreLock?.subgenre ||
      optimizationResult?.genreLock?.primaryGenre ||
      payload.genre;

    JobManager.updateJobStatus(jobId, 'COMPLETED', {
      progress: 100,
      audioUrl,
      metadata: {
        title: payload.title || `${targetGenre} Mock Track`,
        genre: targetGenre,
        bpm: payload.bpm,
        prompt: payload.prompt,
        optimizedPrompt: optimizationResult?.optimizedPrompt || payload.prompt,
        engine: 'Sonara DEV Mock Engine (LOCAL - NO GPU)',
        status: 'COMPLETED',
        audioUrl,
        mockMode: true,
        sampleRate: generated.sampleRate,
        channels: generated.channels,
        bitDepth: generated.bitDepth,
        currentStage: 'DEV Mock generation complete - local WAV ready.',
        completedAt: new Date().toISOString()
      }
    });

    console.log(
      `[MOCK_ENGINE] Completed GPU-free mock job ${jobId} (${generated.durationSec}s, ${payload.bpm} BPM)`
    );
  } catch (err: any) {
    const errorMessage = err?.message || String(err);
    console.error(`[MOCK_ENGINE] Job ${jobId} failed:`, errorMessage);

    JobManager.updateJobStatus(jobId, 'FAILED', {
      progress: 0,
      audioUrl: null,
      metadata: {
        title: payload.title || 'Sonara Mock Track',
        status: 'MOCK_ERROR',
        mockMode: true,
        error: errorMessage,
        completedAt: new Date().toISOString()
      }
    });
  }
}

router.get('/models', (_req: Request, res: Response) => {
  const active = ENGINE_MODELS.find(m => m.id === activeEngineId) || ENGINE_MODELS[1];
  res.json({
    status: 'success',
    activeEngineId: active.id,
    activeEngineName: active.name,
    totalModels: ENGINE_MODELS.length,
    models: ENGINE_MODELS,
  });
});

router.get('/active', (_req: Request, res: Response) => {
  const active = ENGINE_MODELS.find(m => m.id === activeEngineId) || ENGINE_MODELS[1];
  res.json({
    status: 'success',
    activeEngine: active,
  });
});

// Change only the public ACE-Step endpoint at runtime. The API key remains
// backend-only and is never accepted from or returned to the browser.
router.post('/ace-step/config', async (req: Request, res: Response) => {
  const apiUrl = req.body?.apiUrl;

  if (!apiUrl || typeof apiUrl !== 'string') {
    return res.status(400).json({
      status: 'error',
      isAvailable: false,
      error: 'apiUrl must be a non-empty string.'
    });
  }

  const engine = AceStepEngine.getInstance();

  try {
    const normalizedUrl = engine.setApiBaseUrl(apiUrl);
    const health = await engine.healthCheck();
    const details = health.details || {};
    const response = (details.response || {}) as any;

    return res.status(health.isAvailable ? 200 : 503).json({
      status: health.status,
      isAvailable: health.isAvailable,
      engineName: health.engineName,
      service: response?.data?.service || 'ACE-Step',
      version: response?.data?.version || null,
      apiUrl: normalizedUrl,
      error: health.error || null,
      message: health.isAvailable
        ? 'ACE-Step endpoint updated and connected.'
        : 'ACE-Step endpoint updated, but the remote service is not reachable yet.'
    });
  } catch (err: any) {
    return res.status(400).json({
      status: 'error',
      isAvailable: false,
      engineName: 'AceStepEngine',
      service: 'ACE-Step',
      apiUrl: engine.getApiBaseUrl(),
      error: err?.message || String(err)
    });
  }
});

// Live remote ACE-Step status used by the generator UI.
// This never exposes the API key; it only reports connectivity and service metadata.
router.get('/ace-step/health', async (_req: Request, res: Response) => {
  const engine = AceStepEngine.getInstance();

  try {
    const health = await engine.healthCheck();
    const details = health.details || {};
    const response = (details.response || {}) as any;

    return res.status(health.isAvailable ? 200 : 503).json({
      status: health.status,
      isAvailable: health.isAvailable,
      engineName: health.engineName,
      service: response?.data?.service || 'ACE-Step',
      version: response?.data?.version || null,
      apiUrl: details.apiUrl || engine.getApiBaseUrl(),
      error: health.error || null
    });
  } catch (err: any) {
    return res.status(503).json({
      status: 'ENGINE_NOT_AVAILABLE',
      isAvailable: false,
      engineName: 'AceStepEngine',
      service: 'ACE-Step',
      version: null,
      apiUrl: engine.getApiBaseUrl(),
      error: err?.message || String(err)
    });
  }
});

// Persistent generation history. The WAV files on disk are the source of truth,
// so the history survives a Node/React restart even though JobManager is in-memory.
router.get('/history', (_req: Request, res: Response) => {
  try {
    const storageAudioDir = path.join(process.cwd(), 'storage', 'audio');

    if (!fs.existsSync(storageAudioDir)) {
      return res.json({ status: 'success', total: 0, items: [] });
    }

    const items = fs.readdirSync(storageAudioDir)
      .filter(fileName => /^musicgen-.*\.wav$/i.test(fileName))
      .map(fileName => {
        const fullPath = path.join(storageAudioDir, fileName);
        const stats = fs.statSync(fullPath);
        const jobId = fileName.replace(/^musicgen-/, '').replace(/\.wav$/i, '');
        const job = JobManager.getJob(jobId);
        const metadata = job?.metadata || {};
        const payload = job?.payload || {};

        return {
          jobId,
          fileName,
          audioUrl: `/storage/audio/${encodeURIComponent(fileName)}`,
          title: metadata.title || payload.title || 'Sonara Track',
          genre: metadata.genre || payload.genre || null,
          bpm: metadata.bpm || payload.bpm || null,
          durationSec: payload.duration || null,
          engine: metadata.engine || 'ACE-Step 1.5',
          qualityScore: metadata.qualityScore || null,
          sizeBytes: stats.size,
          createdAt: metadata.completedAt || stats.mtime.toISOString()
        };
      })
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    return res.json({
      status: 'success',
      total: items.length,
      items
    });
  } catch (err: any) {
    return res.status(500).json({
      status: 'error',
      message: err?.message || String(err)
    });
  }
});

router.get('/diagnostic', async (_req: Request, res: Response) => {
  try {
    const diagnostic = await EngineDiagnosticService.getInstance().runDiagnostics(true);
    res.json({
      status: diagnostic.isReady ? 'READY' : 'ENGINE_NOT_READY',
      isReady: diagnostic.isReady,
      checks: diagnostic.checks,
      formattedReport: diagnostic.formattedReport,
      notReadyReason: diagnostic.notReadyReason
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.get('/environment', async (_req: Request, res: Response) => {
  try {
    const audit = await PythonEnvironmentManager.getInstance().verifyEnvironment(true);
    res.json(audit);
  } catch (err: any) {
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

router.post('/select', (req: Request, res: Response) => {
  const { engineId, autoSelect } = req.body;

  if (engineId) {
    const found = ENGINE_MODELS.find(m => m.id === engineId);
    if (found) {
      activeEngineId = found.id;
      return res.json({
        status: 'success',
        message: `Active engine changed to ${found.name}`,
        activeEngine: found,
      });
    }
    return res.status(404).json({
      status: 'error',
      message: `Engine ID '${engineId}' not found in registry`,
    });
  }

  if (autoSelect) {
    const selected = ENGINE_MODELS.find(m => m.provider === 'sonara_native') || ENGINE_MODELS[0];
    activeEngineId = selected.id;
    return res.json({
      status: 'success',
      message: `Auto-selected optimal engine: ${selected.name}`,
      selectedEngine: selected,
    });
  }

  res.status(400).json({
    status: 'error',
    message: 'Must provide either engineId or autoSelect in payload',
  });
});

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const {
      prompt,
      durationSec,
      genre,
      bpm,
      key,
      engineId,
      title,
      mood,
      lyrics,
      mode
    } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt must be a non-empty string.' });
    }

    const generationMode = String(mode || 'real').toLowerCase() === 'mock' ? 'mock' : 'real';
    const currentEngineId = engineId || activeEngineId;
    const plugin = ENGINE_MODELS.find(m => m.id === currentEngineId) || ENGINE_MODELS[1];

    // Prompt/genre optimization is local and remains active in both REAL and MOCK mode.
    const optimizationResult = await AceStepPromptEngine.generatePrompt(prompt, genre);
    const resolvedGenre = genre || optimizationResult.genreLock.subgenre || 'Melodic House';
    const resolvedBpm = Number(bpm || optimizationResult.genreLock.targetBpm || 124);
    const resolvedDuration = Math.max(1, Math.min(240, Number(durationSec || 30)));
    const resolvedTitle = title || `${resolvedGenre} Track`;
    const jobId = `job-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const payload = {
      title: resolvedTitle,
      genre: resolvedGenre,
      mood: mood || 'Energetic',
      lyrics: lyrics || '',
      prompt,
      bpm: resolvedBpm,
      duration: resolvedDuration
    };

    let jobRecord;

    if (generationMode === 'mock') {
      jobRecord = JobManager.registerJob(
        jobId,
        {
          title: resolvedTitle,
          genre: resolvedGenre,
          mockMode: true,
          engine: 'Sonara DEV Mock Engine (LOCAL - NO GPU)'
        },
        payload
      );

      void runMockGeneration(jobId, payload, optimizationResult);
    } else {
      jobRecord = JobQueueWorker.enqueueJob(jobId, payload);
    }

    const responseEngine = generationMode === 'mock'
      ? 'Sonara DEV Mock Engine (LOCAL - NO GPU)'
      : plugin.name;

    res.json({
      status: 'success',
      jobId,
      job: jobRecord,
      mode: generationMode,
      engine: responseEngine,
      engineId: generationMode === 'mock' ? 'sonara_dev_mock' : plugin.id,
      version: generationMode === 'mock' ? 'DEV-MOCK-1.0' : plugin.version,
      result: {
        jobId,
        mode: generationMode,
        prompt: optimizationResult.optimizedPrompt,
        originalPrompt: prompt,
        genreLock: optimizationResult.genreLock,
        optimizationLayer: optimizationResult.layers,
        injectedKeywords: optimizationResult.injectedKeywords,
        genre: optimizationResult.genreLock.subgenre || resolvedGenre,
        bpm: resolvedBpm,
        key: key || optimizationResult.genreLock.keySignature || 'F Minor',
        durationSec: resolvedDuration,
        sampleRate: 44100,
        bitDepth: 16,
        channels: 2,
        targetLufs: generationMode === 'mock' ? null : -14.0,
        truePeakDb: generationMode === 'mock' ? null : -1.0,
        audioUrl: `/storage/audio/musicgen-${jobId}.wav`,
        stems: ['Drums', 'Bass', 'Lead Synthesizer', 'Atmospheric Pads']
      }
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

export default router;