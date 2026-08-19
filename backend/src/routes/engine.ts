import { Router, Request, Response } from 'express';
import { LevoPromptEngine } from '../services/LevoPromptEngine';
import { JobQueueWorker } from '../workers/JobQueueWorker';
import { EngineDiagnosticService } from '../engine/EngineDiagnosticService';
import { PythonEnvironmentManager } from '../engine/PythonEnvironmentManager';
import { AceStepEngine } from '../engine/AceStepEngine';

const router = Router();

const ENGINE_MODELS = [
  {
    id: 'sonara_acestep_v15',
    name: 'Sonara AI Native Engine (ACE-Step 1.5)',
    version: '1.5-SONARA',
    provider: 'sonara_native',
    vramRequiredMb: 0,
    ramRequiredMb: 0,
    averageTimeSec: 60,
    stereoSupport: true,
    maxDurationSec: 600,
    stemsSupport: false,
    continuationSupport: true,
    inpaintSupport: true,
    qualityScore: 100
  },
  {
    id: 'sonara_levo_v2',
    name: 'Sonara AI Native Engine (LeVo 2 / SongGeneration-v2-large)',
    version: '2.0.0-SONARA',
    provider: 'sonara_native_legacy',
    vramRequiredMb: 22000,
    ramRequiredMb: 16384,
    averageTimeSec: 60,
    stereoSupport: true,
    maxDurationSec: 240,
    stemsSupport: false,
    continuationSupport: false,
    inpaintSupport: false,
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

let activeEngineId = 'sonara_acestep_v15';

router.get('/models', (_req: Request, res: Response) => {
  const active = ENGINE_MODELS.find(m => m.id === activeEngineId) || ENGINE_MODELS[0];
  res.json({
    status: 'success',
    activeEngineId: active.id,
    activeEngineName: active.name,
    totalModels: ENGINE_MODELS.length,
    models: ENGINE_MODELS,
  });
});

router.get('/active', (_req: Request, res: Response) => {
  const active = ENGINE_MODELS.find(m => m.id === activeEngineId) || ENGINE_MODELS[0];
  res.json({ status: 'success', activeEngine: active });
});

router.get('/diagnostic', async (_req: Request, res: Response) => {
  try {
    const diagnostic = await EngineDiagnosticService.getInstance().runDiagnostics(true);
    const aceStep = await AceStepEngine.getInstance().healthCheck();
    res.json({
      status: aceStep.isAvailable ? 'READY' : (diagnostic.isReady ? 'READY' : 'ENGINE_NOT_READY'),
      isReady: aceStep.isAvailable || diagnostic.isReady,
      activeEngineId,
      aceStep,
      checks: diagnostic.checks,
      formattedReport: diagnostic.formattedReport,
      notReadyReason: aceStep.isAvailable ? undefined : (aceStep.error || diagnostic.notReadyReason)
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
    const selected = ENGINE_MODELS.find(m => m.id === 'sonara_acestep_v15') || ENGINE_MODELS[0];
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
    const { prompt, durationSec, genre, bpm, key, engineId, title, mood, lyrics } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt must be a non-empty string.' });
    }

    // The current UI still sends the historical LeVo id. Treat that value as
    // "use active engine" unless LeVo was explicitly selected through /select.
    const currentEngineId = engineId === 'sonara_levo_v2' && activeEngineId !== 'sonara_levo_v2'
      ? activeEngineId
      : (engineId || activeEngineId);
    const plugin = ENGINE_MODELS.find(m => m.id === currentEngineId);
    if (!plugin) {
      return res.status(400).json({ status: 'error', message: `Unsupported engine '${currentEngineId}'.` });
    }

    const optimizationResult = await LevoPromptEngine.generatePrompt(prompt, genre);

    const jobId = `job-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const jobRecord = JobQueueWorker.enqueueJob(jobId, {
      title: title || `${genre || 'Melodic House'} Track`,
      genre: genre || optimizationResult.genreLock.subgenre || 'Melodic House',
      mood: mood || 'Energetic',
      lyrics: lyrics || '',
      prompt,
      bpm: bpm || optimizationResult.genreLock.targetBpm || 124,
      duration: durationSec || 30,
      engineId: currentEngineId,
      key: key || optimizationResult.genreLock.keySignature || 'F Minor'
    });

    res.json({
      status: 'success',
      jobId,
      job: jobRecord,
      engine: plugin.name,
      engineId: plugin.id,
      version: plugin.version,
      result: {
        jobId,
        prompt: optimizationResult.optimizedPrompt,
        originalPrompt: prompt,
        genreLock: optimizationResult.genreLock,
        optimizationLayer: optimizationResult.layers,
        injectedKeywords: optimizationResult.injectedKeywords,
        genre: optimizationResult.genreLock.subgenre || genre || 'Melodic House',
        bpm: bpm || optimizationResult.genreLock.targetBpm || 124,
        key: key || optimizationResult.genreLock.keySignature || 'F Minor',
        durationSec: durationSec || 30,
        sampleRate: 44100,
        bitDepth: 16,
        channels: 2,
        targetLufs: -14.0,
        truePeakDb: -1.0,
        audioUrl: null
      }
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

export default router;
