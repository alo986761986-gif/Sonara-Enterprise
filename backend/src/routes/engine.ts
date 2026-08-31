import { Router, Request, Response } from 'express';
import { AceStepPromptEngine } from '../services/AceStepPromptEngine';
import { JobQueueWorker } from '../workers/JobQueueWorker';
import { EngineDiagnosticService } from '../engine/EngineDiagnosticService';
import { PythonEnvironmentManager } from '../engine/PythonEnvironmentManager';
import { LeVo2ResearchEngine } from '../engine/LeVo2ResearchEngine';

const router = Router();

const ENGINE_MODELS = [
  {
    id: 'sonara_ace_step_v12',
    name: 'Sonara AI Native Engine (ACE-Step V12 Core)',
    version: '12.0.0-UNIFIED',
    provider: 'sonara_native',
    mode: 'production',
    selectable: true,
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
    id: 'sonara_levo2_research',
    name: 'Sonara LeVo 2 Research Engine (v2-large)',
    version: '2.0-R&D',
    provider: 'sonara_research',
    mode: 'research_only',
    selectable: true,
    apiUrl: process.env.LEVO2_RESEARCH_API_URL || 'http://127.0.0.1:8022',
    vramRequiredMb: 28000,
    ramRequiredMb: 16000,
    averageTimeSec: null,
    stereoSupport: true,
    maxDurationSec: 270,
    stemsSupport: true,
    continuationSupport: false,
    inpaintSupport: false,
    qualityScore: null,
    commercialUse: false
  },
  {
    id: 'musicgen_stereo_large',
    name: 'MusicGen Stereo Large (Meta Plugin)',
    version: '1.2.0',
    provider: 'meta',
    mode: 'plugin',
    selectable: false,
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
    mode: 'plugin',
    selectable: false,
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

function engineSelectorForId(engineId: string): string {
  return engineId === 'sonara_levo2_research' ? 'levo2-research' : 'ace-step';
}

let activeEngineId = String(process.env.SONARA_MUSIC_ENGINE || '').toLowerCase().includes('levo')
  ? 'sonara_levo2_research'
  : 'sonara_ace_step_v12';

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
  res.json({
    status: 'success',
    activeEngine: active,
    runtimeSelector: engineSelectorForId(active.id),
  });
});

router.get('/levo2/health', async (_req: Request, res: Response) => {
  try {
    const health = await LeVo2ResearchEngine.getInstance().healthCheck();
    return res.status(health.isAvailable ? 200 : 503).json({
      status: health.status,
      ready: health.isAvailable,
      engine: health.engineName,
      details: health.details,
      error: health.error
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'ERROR', ready: false, message: err.message });
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

router.post('/select', async (req: Request, res: Response) => {
  const { engineId, autoSelect } = req.body;

  if (engineId) {
    const found = ENGINE_MODELS.find(m => m.id === engineId);
    if (!found) {
      return res.status(404).json({ status: 'error', message: `Engine ID '${engineId}' not found in registry` });
    }
    if (!found.selectable) {
      return res.status(409).json({ status: 'error', message: `${found.name} is listed for compatibility but is not selectable by this router.` });
    }

    if (found.id === 'sonara_levo2_research') {
      if (String(process.env.NODE_ENV || '').toLowerCase() === 'production' && !['1','true','yes','on'].includes(String(process.env.LEVO2_COMMERCIAL_LICENSE || '').toLowerCase())) {
        return res.status(403).json({
          status: 'error',
          message: 'LeVo 2 is research-only and cannot be selected in production without an appropriate commercial license.'
        });
      }
      const health = await LeVo2ResearchEngine.getInstance().healthCheck();
      if (!health.isAvailable) {
        return res.status(503).json({ status: 'error', message: health.error || 'LeVo 2 worker is not ready', health });
      }
    }

    activeEngineId = found.id;
    process.env.SONARA_MUSIC_ENGINE = engineSelectorForId(found.id);

    return res.json({
      status: 'success',
      message: `Active engine changed to ${found.name}`,
      activeEngine: found,
      runtimeSelector: process.env.SONARA_MUSIC_ENGINE
    });
  }

  if (autoSelect) {
    const selected = ENGINE_MODELS.find(m => m.id === 'sonara_ace_step_v12') || ENGINE_MODELS[0];
    activeEngineId = selected.id;
    process.env.SONARA_MUSIC_ENGINE = 'ace-step';
    return res.json({
      status: 'success',
      message: `Auto-selected production-safe engine: ${selected.name}`,
      selectedEngine: selected,
      runtimeSelector: process.env.SONARA_MUSIC_ENGINE
    });
  }

  return res.status(400).json({ status: 'error', message: 'Must provide either engineId or autoSelect in payload' });
});

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const requiredSecret = String(process.env.SONARA_INTERNAL_PROXY_SECRET || '').trim();
    const suppliedSecret = String(req.headers['x-sonara-internal-secret'] || '').trim();
    if (requiredSecret && suppliedSecret !== requiredSecret) {
      return res.status(401).json({ error: 'SONARA generation requires an authorized billing proxy.' });
    }

    const { prompt, durationSec, genre, bpm, key, engineId, title, mood, lyrics } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt must be a non-empty string.' });
    }

    const currentEngineId = engineId || activeEngineId;
    const plugin = ENGINE_MODELS.find(m => m.id === currentEngineId) || ENGINE_MODELS[0];
    if (!plugin.selectable) {
      return res.status(409).json({ status: 'error', message: `${plugin.name} is not selectable by this router.` });
    }

    if (plugin.id === 'sonara_levo2_research' && String(process.env.NODE_ENV || '').toLowerCase() === 'production' && !['1','true','yes','on'].includes(String(process.env.LEVO2_COMMERCIAL_LICENSE || '').toLowerCase())) {
      return res.status(403).json({ status: 'error', message: 'LeVo 2 generation is disabled in production under the current research-only license.' });
    }

    const optimizationResult = await AceStepPromptEngine.generatePrompt(prompt, genre);
    const jobId = `job-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const jobRecord = JobQueueWorker.enqueueJob(jobId, {
      title: title || `${genre || 'Melodic House'} Track`,
      genre: genre || optimizationResult.genreLock.subgenre || 'Melodic House',
      mood: mood || 'Energetic',
      lyrics: lyrics || '',
      prompt,
      bpm: bpm || optimizationResult.genreLock.targetBpm || 124,
      duration: durationSec || 30,
      engineId: engineSelectorForId(plugin.id)
    });

    return res.json({
      status: 'success',
      jobId,
      job: jobRecord,
      engine: plugin.name,
      engineId: plugin.id,
      runtimeSelector: engineSelectorForId(plugin.id),
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
        targetLufs: -14.0,
        truePeakDb: -1.0
      }
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

export default router;
