import { Router, Request, Response } from 'express';
import { JobQueueWorker } from '../workers/JobQueueWorker';
import { AceStepEngine } from '../engine/AceStepEngine';

const router = Router();

const ACE_ENGINE = {
  id: 'sonara_acestep_v15',
  name: 'Sonara AI Native Engine (ACE-Step 1.5)',
  version: '1.5-SONARA',
  provider: 'sonara_native',
  averageTimeSec: 60,
  stereoSupport: true,
  maxDurationSec: 600,
  stemsSupport: false,
  continuationSupport: true,
  inpaintSupport: true,
  qualityScore: 100
};

router.get('/models', (_req: Request, res: Response) => {
  res.json({
    status: 'success',
    activeEngineId: ACE_ENGINE.id,
    activeEngineName: ACE_ENGINE.name,
    totalModels: 1,
    models: [ACE_ENGINE]
  });
});

router.get('/active', (_req: Request, res: Response) => {
  res.json({ status: 'success', activeEngine: ACE_ENGINE });
});

router.get('/diagnostic', async (_req: Request, res: Response) => {
  try {
    const aceStep = await AceStepEngine.getInstance().healthCheck();
    return res.status(aceStep.isAvailable ? 200 : 503).json({
      status: aceStep.isAvailable ? 'READY' : 'ENGINE_NOT_READY',
      isReady: aceStep.isAvailable,
      activeEngineId: ACE_ENGINE.id,
      activeEngine: ACE_ENGINE,
      aceStep,
      formattedReport: aceStep.isAvailable
        ? 'ACE-Step 1.5 READY on Lightning'
        : `ACE-Step 1.5 NOT READY: ${aceStep.error || 'Unknown error'}`,
      notReadyReason: aceStep.isAvailable ? undefined : aceStep.error
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

router.post('/select', (_req: Request, res: Response) => {
  return res.json({
    status: 'success',
    message: 'ACE-Step 1.5 is the only Sonara generation engine.',
    activeEngine: ACE_ENGINE
  });
});

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { prompt, durationSec, genre, bpm, key, title, mood, lyrics } = req.body;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Prompt must be a non-empty string.' });
    }

    const health = await AceStepEngine.getInstance().healthCheck();
    if (!health.isAvailable) {
      return res.status(503).json({
        status: 'error',
        error: health.error || 'ACE-Step 1.5 is unavailable.'
      });
    }

    const safeGenre = String(genre || 'Deep House');
    const safeBpm = Math.max(30, Math.min(300, Number(bpm || 124)));
    const safeKey = String(key || 'F Minor');
    const safeDuration = Math.max(10, Math.min(600, Number(durationSec || 30)));
    const jobId = `job-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const jobRecord = JobQueueWorker.enqueueJob(jobId, {
      title: String(title || `${safeGenre} Track`),
      genre: safeGenre,
      mood: String(mood || 'Energetic'),
      lyrics: String(lyrics || ''),
      prompt: prompt.trim(),
      bpm: safeBpm,
      duration: safeDuration,
      engineId: ACE_ENGINE.id,
      key: safeKey
    });

    return res.json({
      status: 'success',
      jobId,
      job: jobRecord,
      engine: ACE_ENGINE.name,
      engineId: ACE_ENGINE.id,
      version: ACE_ENGINE.version,
      result: {
        jobId,
        prompt: prompt.trim(),
        genre: safeGenre,
        bpm: safeBpm,
        key: safeKey,
        durationSec: safeDuration,
        audioUrl: null
      }
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

export default router;
