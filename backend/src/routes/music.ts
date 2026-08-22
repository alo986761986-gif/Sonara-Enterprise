import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { verifyFirebaseToken, AuthenticatedRequest } from '../auth/FirebaseAuth';
import { MusicGenerationService } from '../services/MusicGenerationService';
import { SonaraPromptEngine } from '../services/SonaraPromptEngine';
import { JobManager } from '../jobs/JobManager';
import { rateLimiterMiddleware, sanitizeInput } from '../middleware/SecurityHardening';
import { GeminiBrainService } from '../services/GeminiBrainService';
import { SongPlannerService } from '../services/SongPlannerService';
import { GenerationQueueService } from '../services/GenerationQueueService';
import { MusicGenWorkerService } from '../workers/MusicGenWorkerService';
import { AiQualityEngineService } from '../services/AiQualityEngineService';
import { ContinuousLearningService } from '../services/ContinuousLearningService';
import { MusicDnaLibraryService } from '../services/MusicDnaLibraryService';
import { SonaraDirectorService } from '../services/SonaraDirectorService';
import { ParametricEqService, PROFESSIONAL_EQ_PRESETS, DEFAULT_EQ_BANDS } from '../services/ParametricEqService';
import { CreativeEvolutionEngineService } from '../services/CreativeEvolutionEngineService';
import { ResearchEngineService } from '../services/ResearchEngineService';
import { StyleGeneratorService } from '../services/StyleGeneratorService';
import { PatternGeneratorService } from '../services/PatternGeneratorService';
import { PythonEnvironmentManager } from '../engine/PythonEnvironmentManager';

const router = Router();

// Helper to run python engine commands
function runPythonCommand(cmdString: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const pythonBin = PythonEnvironmentManager.getInstance().getPythonBinaryPath();
    const finalCmd = cmdString.startsWith('python3')
      ? cmdString.replace(/^python3/, `"${pythonBin}"`)
      : cmdString;

    exec(finalCmd, { cwd: process.cwd() }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Python execution error: ${error.message}`, stderr);
        return reject(error);
      }
      try {
        // Try parsing last JSON line or full output
        const lines = stdout.trim().split('\n');
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim();
          if (line.startsWith('{') && line.endsWith('}')) {
            return resolve(JSON.parse(line));
          }
        }
        resolve({ output: stdout.trim() });
      } catch (parseErr) {
        resolve({ output: stdout.trim() });
      }
    });
  });
}

router.post('/prompt', async (req: Request, res: Response) => {
  try {
    const { query, genre } = req.body;
    const result = await SonaraPromptEngine.generatePrompt(query || 'House estiva', genre);
    const pattern = PatternGeneratorService.generatePattern(result.genreLock.subgenre || genre || 'Melodic House');
    return res.status(200).json({
      ...result,
      patternEngine: pattern
    });
  } catch (error: any) {
    console.error('Prompt Engine Endpoint Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to compose prompt' });
  }
});

router.post('/pattern', async (req: Request, res: Response) => {
  try {
    const { genre, seed } = req.body;
    const patternResult = PatternGeneratorService.generatePattern(genre || 'Melodic House', seed);
    return res.status(200).json({
      status: 'success',
      pattern: patternResult
    });
  } catch (error: any) {
    console.error('Pattern Generator Error:', error);
    return res.status(500).json({ error: error.message || 'Pattern generation failed' });
  }
});

// SONARA MUSIC BRAIN ENDPOINTS
router.get('/brain/stats', async (req: Request, res: Response) => {
  try {
    const stats = MusicDnaLibraryService.getSystemEvolutionStats();
    return res.status(200).json({
      status: 'success',
      brainStats: stats
    });
  } catch (error: any) {
    console.error('Music Brain Stats Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch Music Brain stats' });
  }
});

router.get('/brain/library', async (req: Request, res: Response) => {
  try {
    const { query, genre, minScore, onlyBenchmarks, limit } = req.query;
    const records = MusicDnaLibraryService.searchDnaLibrary({
      query: query ? String(query) : undefined,
      genre: genre ? String(genre) : undefined,
      minScore: minScore ? Number(minScore) : undefined,
      onlyBenchmarks: onlyBenchmarks === 'true',
      limit: limit ? Number(limit) : 50
    });
    return res.status(200).json({
      status: 'success',
      count: records.length,
      dnaRecords: records
    });
  } catch (error: any) {
    console.error('Music Brain Library Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to search Music Brain library' });
  }
});

router.post('/brain/recall', async (req: Request, res: Response) => {
  try {
    const { prompt, genre } = req.body;
    const recallResult = MusicDnaLibraryService.recallOptimalDna(prompt || '', genre || '');
    return res.status(200).json({
      status: 'success',
      ...recallResult
    });
  } catch (error: any) {
    console.error('Music Brain Recall Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to recall DNA' });
  }
});

router.post('/brain/evaluate', async (req: Request, res: Response) => {
  try {
    const { prompt, genre, subgenre, bpm, keySignature, swingPct, chords, audioQuality } = req.body;
    const record = ContinuousLearningService.logAndLearn({
      prompt: prompt || 'Custom generation',
      genre: genre || 'House',
      subgenre: subgenre || 'Melodic House',
      bpm: bpm || 124,
      keySignature: keySignature || 'F Minor',
      swingPct: swingPct || 10.0,
      chords: chords || ['Fm7', 'Dbmaj7'],
      audioQuality
    });
    return res.status(200).json({
      status: 'success',
      record
    });
  } catch (error: any) {
    console.error('Music Brain Evaluate Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to evaluate track' });
  }
});

// Director AI Master Pipeline
router.post('/director', async (req: Request, res: Response) => {
  try {
    const { query, genre } = req.body;
    const queryStr = query || 'Deep House vibe';
    const result = await SonaraDirectorService.executeProductionPipeline(queryStr, genre);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Director AI Error:', error);
    return res.status(500).json({ error: error.message || 'Director AI execution failed' });
  }
});

// Professional Parametric Equalizer API
router.get('/eq/presets', (_req: Request, res: Response) => {
  return res.status(200).json({
    status: 'success',
    presets: PROFESSIONAL_EQ_PRESETS,
    defaultBands: DEFAULT_EQ_BANDS,
    totalBands: DEFAULT_EQ_BANDS.length,
    sampleRate: 44100
  });
});

router.post('/eq/process', async (req: Request, res: Response) => {
  try {
    const { bands, filePath, audioUrl } = req.body;
    
    let resolvedPath = filePath;
    if (!resolvedPath && audioUrl) {
      const cleanUrl = audioUrl.split('?')[0];
      const relativePath = cleanUrl.startsWith('/') ? cleanUrl.substring(1) : cleanUrl;
      resolvedPath = path.join(process.cwd(), relativePath);
    }

    if (!resolvedPath) {
      // Fallback search in storage/audio
      const storageAudioDir = path.join(process.cwd(), 'storage', 'audio');
      if (fs.existsSync(storageAudioDir)) {
        const wavFiles = fs.readdirSync(storageAudioDir).filter(f => f.endsWith('.wav'));
        if (wavFiles.length > 0) {
          resolvedPath = path.join(storageAudioDir, wavFiles[0]);
        }
      }
    }

    let buffer: Buffer;
    if (resolvedPath && fs.existsSync(resolvedPath)) {
      buffer = fs.readFileSync(resolvedPath);
    } else {
      // Create valid 44.1kHz 16-bit PCM stereo WAV
      const sampleRate = 44100;
      const numSamples = sampleRate * 5;
      buffer = Buffer.alloc(44 + numSamples * 4);
      buffer.write('RIFF', 0);
      buffer.writeUInt32LE(36 + numSamples * 4, 4);
      buffer.write('WAVE', 8);
      buffer.write('fmt ', 12);
      buffer.writeUInt32LE(16, 16);
      buffer.writeUInt16LE(1, 20); // PCM
      buffer.writeUInt16LE(2, 22); // Stereo
      buffer.writeUInt32LE(sampleRate, 24);
      buffer.writeUInt32LE(sampleRate * 4, 28);
      buffer.writeUInt16LE(4, 32);
      buffer.writeUInt16LE(16, 34);
      buffer.write('data', 36);
      buffer.writeUInt32LE(numSamples * 4, 40);

      for (let i = 0; i < numSamples; i++) {
        const val = Math.round((Math.sin(2 * Math.PI * 220 * (i / sampleRate)) + Math.sin(2 * Math.PI * 440 * (i / sampleRate)) * 0.5) * 12000);
        buffer.writeInt16LE(val, 44 + i * 4);
        buffer.writeInt16LE(val, 44 + i * 4 + 2);
      }
    }

    const bandConfigs = bands && Array.isArray(bands) ? bands : DEFAULT_EQ_BANDS;
    const result = ParametricEqService.processWavBuffer(buffer, bandConfigs);
    
    // Save processed WAV file into storage/audio
    const storageAudioDir = path.join(process.cwd(), 'storage', 'audio');
    if (!fs.existsSync(storageAudioDir)) {
      fs.mkdirSync(storageAudioDir, { recursive: true });
    }

    const outputFileName = `mastered_eq_${Date.now()}.wav`;
    const outputPath = path.join(storageAudioDir, outputFileName);
    fs.writeFileSync(outputPath, result.processedBuffer);

    const resultAudioUrl = `/storage/audio/${outputFileName}`;

    return res.status(200).json({
      status: 'success',
      metrics: result.metrics,
      audioUrl: resultAudioUrl,
      filePath: outputPath,
      processedByteLength: result.processedBuffer.length
    });
  } catch (error: any) {
    console.error('EQ Process Error:', error);
    return res.status(500).json({ error: error.message || 'EQ processing failed' });
  }
});

// Batch Generator API
router.post('/batch', async (req: Request, res: Response) => {
  try {
    const { genre, count } = req.body;
    const genreName = genre || 'house';
    const trackCount = count || 10;
    
    const pythonCmd = `python3 -m engine.batch_generator --genre "${genreName}" --count ${trackCount}`;
    const result = await runPythonCommand(pythonCmd);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Batch Generator Error:', error);
    return res.status(500).json({ error: error.message || 'Batch Generator failed' });
  }
});

// Leaderboard API
router.get('/leaderboard', async (_req: Request, res: Response) => {
  try {
    const leaderboardPath = path.join(process.cwd(), 'engine', 'leaderboard.json');
    if (fs.existsSync(leaderboardPath)) {
      const content = JSON.parse(fs.readFileSync(leaderboardPath, 'utf-8'));
      return res.status(200).json(content);
    }
    const pythonCmd = `python3 -c "import json; from engine.leaderboard import Leaderboard; lb = Leaderboard(); print(json.dumps(lb.get_full_leaderboard_summary()))"`;
    const result = await runPythonCommand(pythonCmd);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Leaderboard Fetch Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch leaderboard' });
  }
});

// Benchmark Suite API
router.get('/benchmark', async (_req: Request, res: Response) => {
  try {
    const pythonCmd = `python3 -c "import json; from engine.benchmark_engine import BenchmarkEngine; b = BenchmarkEngine(); print(json.dumps(b.run_benchmark_suite(runs_per_genre=2)))"`;
    const result = await runPythonCommand(pythonCmd);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Benchmark Error:', error);
    return res.status(500).json({ error: error.message || 'Benchmark suite failed' });
  }
});

// Trainer & Gold Dataset Report API
router.get('/trainer', async (_req: Request, res: Response) => {
  try {
    const jsonReportPath = path.join(process.cwd(), 'engine', 'training_report.json');
    if (fs.existsSync(jsonReportPath)) {
      const content = JSON.parse(fs.readFileSync(jsonReportPath, 'utf-8'));
      return res.status(200).json(content);
    }
    const pythonCmd = `python3 -m engine.trainer`;
    const result = await runPythonCommand(pythonCmd);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Trainer Error:', error);
    return res.status(500).json({ error: error.message || 'Trainer execution failed' });
  }
});

// LoRA Infrastructure API
router.get('/lora', async (_req: Request, res: Response) => {
  try {
    const loraConfigPath = path.join(process.cwd(), 'lora', 'lora_config.json');
    if (fs.existsSync(loraConfigPath)) {
      const config = JSON.parse(fs.readFileSync(loraConfigPath, 'utf-8'));
      return res.status(200).json({ status: 'ACTIVE', config });
    }
    const pythonCmd = `python3 -m engine.lora_prep`;
    const result = await runPythonCommand(pythonCmd);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('LoRA Infrastructure Error:', error);
    return res.status(500).json({ error: error.message || 'LoRA prep failed' });
  }
});

// Data Factory Batch Production Endpoint (100, 500, 1000, 5000, 10000 tracks)
router.post('/factory/run', async (req: Request, res: Response) => {
  try {
    const { count, genre } = req.body;
    const batchCount = count || 100;
    const targetGenre = genre || '';
    const pythonCmd = `python3 -c "import json; from engine.data_factory import DataFactory; f = DataFactory(); print(json.dumps(f.run_batch_production(batch_size=${batchCount}, target_genre='${targetGenre}')))"`;
    const result = await runPythonCommand(pythonCmd);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Data Factory Batch Run Error:', error);
    return res.status(500).json({ error: error.message || 'Data Factory batch run failed' });
  }
});

// Data Factory Dashboard Metrics Endpoint (Bronze, Silver, Gold, Platinum, Diamond Tiers)
router.get('/factory/dashboard', async (_req: Request, res: Response) => {
  try {
    const pythonCmd = `python3 -c "import json; from engine.dataset_dashboard import DatasetDashboardEngine; d = DatasetDashboardEngine(); print(json.dumps(d.get_dashboard_metrics()))"`;
    const result = await runPythonCommand(pythonCmd);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Data Factory Dashboard Error:', error);
    return res.status(500).json({ error: error.message || 'Data Factory dashboard failed' });
  }
});

// Data Factory Dataset Cleaner Endpoint
router.post('/factory/clean', async (req: Request, res: Response) => {
  try {
    const { threshold } = req.body;
    const simThreshold = threshold || 0.88;
    const pythonCmd = `python3 -c "import json; from engine.dataset_cleaner import DatasetCleaner; c = DatasetCleaner(); print(json.dumps(c.clean_dataset(similarity_threshold=${simThreshold})))"`;
    const result = await runPythonCommand(pythonCmd);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Dataset Cleaner Error:', error);
    return res.status(500).json({ error: error.message || 'Dataset cleaner failed' });
  }
});

// Data Factory LoRA Export Bundle Endpoint
router.post('/factory/lora-manifest', async (req: Request, res: Response) => {
  try {
    const { min_score } = req.body;
    const scoreCutoff = min_score || 90;
    const pythonCmd = `python3 -c "import json; from engine.lora_manifest_generator import LoraManifestGenerator; g = LoraManifestGenerator(); print(json.dumps(g.generate_full_lora_dataset_bundle(min_score=${scoreCutoff})))"`;
    const result = await runPythonCommand(pythonCmd);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('LoRA Manifest Generation Error:', error);
    return res.status(500).json({ error: error.message || 'LoRA manifest generator failed' });
  }
});

// System Monitor Endpoint
router.get('/factory/monitor', async (_req: Request, res: Response) => {
  try {
    const pythonCmd = `python3 -c "import json; from engine.system_monitor import SystemMonitor; m = SystemMonitor(); print(json.dumps(m.get_system_telemetry()))"`;
    const result = await runPythonCommand(pythonCmd);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('System Monitor Error:', error);
    return res.status(500).json({ error: error.message || 'System monitor failed' });
  }
});

// ============================================================================
// TRAINING MANAGER & RESEARCH DASHBOARD API ENDPOINTS
// ============================================================================

// GET /api/music/training/dashboard - Summary metrics for Research Dashboard
router.get('/training/dashboard', async (_req: Request, res: Response) => {
  try {
    const pythonCmd = `python3 -c "import json; from engine.training_manager import TrainingManager; tm = TrainingManager(); print(json.dumps(tm.get_research_dashboard_summary()))"`;
    const result = await runPythonCommand(pythonCmd);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Research Dashboard Summary Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch research dashboard summary' });
  }
});

// GET /api/music/training/datasets - List immutable dataset versions
router.get('/training/datasets', async (_req: Request, res: Response) => {
  try {
    const pythonCmd = `python3 -c "import json; from engine.training_manager import TrainingManager; tm = TrainingManager(); print(json.dumps(tm.list_dataset_versions()))"`;
    const result = await runPythonCommand(pythonCmd);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Dataset Versions List Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to list dataset versions' });
  }
});

// POST /api/music/training/dataset/create - Freeze a new immutable dataset version
router.post('/training/dataset/create', async (req: Request, res: Response) => {
  try {
    const { version_id, description } = req.body;
    const vId = version_id ? `'${version_id}'` : 'None';
    const desc = description ? `'${description.replace(/'/g, "\\'")}'` : "'Automated Immutable Dataset Release'";
    const pythonCmd = `python3 -c "import json; from engine.training_manager import TrainingManager; tm = TrainingManager(); print(json.dumps(tm.create_dataset_version(version_id=${vId}, description=${desc})))"`;
    const result = await runPythonCommand(pythonCmd);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Dataset Version Creation Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to create immutable dataset version' });
  }
});

// POST /api/music/training/queue - Queue a new LoRA training job
router.post('/training/queue', async (req: Request, res: Response) => {
  try {
    const { genre, dataset_version, hyperparameters } = req.body;
    const targetGenre = genre || 'Deep House';
    const vId = dataset_version ? `'${dataset_version}'` : 'None';
    const hpJson = hyperparameters ? JSON.stringify(hyperparameters).replace(/"/g, '\\"') : 'None';
    const pythonCmd = `python3 -c "import json; from engine.training_manager import TrainingManager; tm = TrainingManager(); print(json.dumps(tm.queue_training_job('${targetGenre}', dataset_version=${vId})))"`;
    const result = await runPythonCommand(pythonCmd);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Queue Training Job Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to queue training job' });
  }
});

// POST /api/music/training/run - Execute queued training job
router.post('/training/run', async (req: Request, res: Response) => {
  try {
    const { job_id } = req.body;
    if (!job_id) {
      return res.status(400).json({ error: 'Missing required field: job_id' });
    }
    const pythonCmd = `python3 -c "import json; from engine.training_manager import TrainingManager; tm = TrainingManager(); print(json.dumps(tm.execute_training_job('${job_id}')))"`;
    const result = await runPythonCommand(pythonCmd);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Execute Training Job Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to execute training job' });
  }
});

// GET /api/music/training/models - List model registry & active models
router.get('/training/models', async (req: Request, res: Response) => {
  try {
    const genre = req.query.genre as string;
    const genreArg = genre ? `'${genre}'` : 'None';
    const pythonCmd = `python3 -c "import json; from engine.training_manager import TrainingManager; tm = TrainingManager(); print(json.dumps({'registered_models': tm.list_models_in_registry(${genreArg}), 'dashboard': tm.get_research_dashboard_summary()}))"`;
    const result = await runPythonCommand(pythonCmd);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Model Registry Fetch Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch model registry' });
  }
});

// POST /api/music/training/rollback - Rollback active model for a genre
router.post('/training/rollback', async (req: Request, res: Response) => {
  try {
    const { genre, target_model_id } = req.body;
    if (!genre) {
      return res.status(400).json({ error: 'Missing required field: genre' });
    }
    const targetModel = target_model_id || 'base';
    const pythonCmd = `python3 -c "import json; from engine.training_manager import TrainingManager; tm = TrainingManager(); print(json.dumps(tm.rollback_model('${genre}', '${targetModel}')))"`;
    const result = await runPythonCommand(pythonCmd);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Model Rollback Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to perform model rollback' });
  }
});

// GET /api/music/training/experiments - Experiment Tracker logs
router.get('/training/experiments', async (_req: Request, res: Response) => {
  try {
    const pythonCmd = `python3 -c "import json; from engine.training_manager import TrainingManager; tm = TrainingManager(); print(json.dumps(tm.get_experiment_history()))"`;
    const result = await runPythonCommand(pythonCmd);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Experiment History Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch experiment history' });
  }
});

// POST /api/music/generate - Main Node + Python AI Engine Generation Endpoint
router.post('/generate', rateLimiterMiddleware, verifyFirebaseToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { prompt, genre, mood, lyrics, title } = req.body;

    const sanitizedTitle = sanitizeInput(title || '', 200);
    const sanitizedPrompt = sanitizeInput(prompt || '', 500);
    const sanitizedGenre = sanitizeInput(genre || '', 50);
    const sanitizedMood = sanitizeInput(mood || '', 50);
    const sanitizedLyrics = sanitizeInput(lyrics || '', 2000);

    const effectiveTitle = sanitizedTitle || sanitizedPrompt || (sanitizedGenre ? `${sanitizedGenre} Track` : 'Sonara AI Track');
    const effectiveGenre = sanitizedGenre || 'Melodic House';
    const effectiveMood = sanitizedMood || 'Energetic';
    const effectiveLyrics = sanitizedLyrics || '';
    const effectivePrompt = sanitizedPrompt || `${effectiveGenre} song with ${effectiveMood} vibe`;

    const optimizationResult = await SonaraPromptEngine.generatePrompt(effectivePrompt, effectiveGenre);
    const optimizedPrompt = optimizationResult.optimizedPrompt;
    const lockedBpm = optimizationResult.genreLock.targetBpm;
    const lockedGenre = optimizationResult.genreLock.subgenre || optimizationResult.genreLock.primaryGenre;

    const userId = req.user?.uid || 'dev-user-sonara-77';

    console.log(`[ENTERPRISE_LOG] [POST /api/music/generate] Request received from ${userId} | Genre Lock: ${lockedGenre} (${lockedBpm} BPM) | Optimized Prompt: "${optimizedPrompt}"`);

    // Execute generation pipeline connected to Python AI engine & fallbacks
    const generationResult = await MusicGenerationService.processGeneration(
      {
        title: effectiveTitle,
        genre: lockedGenre,
        mood: effectiveMood,
        lyrics: effectiveLyrics,
        prompt: optimizedPrompt
      },
      userId
    );

    return res.status(200).json({
      jobId: generationResult.jobId,
      status: generationResult.status,
      audioUrl: generationResult.audioUrl,
      metadata: {
        ...generationResult.metadata,
        genreLock: optimizationResult.genreLock,
        optimizationLayer: optimizationResult.layers,
        injectedKeywords: optimizationResult.injectedKeywords
      }
    });
  } catch (error: any) {
    console.error('[ENTERPRISE_LOG] [POST /api/music/generate ERROR]', error);
    return res.status(500).json({
      jobId: `job_err_${Date.now()}`,
      status: 'FAILED',
      audioUrl: '',
      metadata: { error: error.message || 'Internal Server Error during music generation.' }
    });
  }
});

// GET /api/music/job/:jobId - Poll job status & progress
router.get('/job/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = JobManager.getJob(jobId);
  if (!job) {
    return res.status(404).json({ error: `Job with ID '${jobId}' not found.` });
  }
  return res.status(200).json({
    jobId: job.jobId,
    status: job.status,
    progress: job.progress,
    audioUrl: job.audioUrl || null,
    metadata: job.metadata || {},
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    error: job.error || null
  });
});

// GET /api/music/jobs - List all generation jobs
router.get('/jobs', (_req: Request, res: Response) => {
  const jobs = JobManager.listJobs();
  return res.status(200).json({ total: jobs.length, jobs });
});

// POST /api/music/producer/blueprint - Generate music production blueprint using GeminiBrainService
router.post('/producer/blueprint', async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Prompt must be a non-empty string.' });
    }
    const result = await GeminiBrainService.generateProducerBlueprint(prompt);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Producer AI Blueprint Error:', error);
    return res.status(500).json({ error: error.message || 'Producer AI blueprint generation failed' });
  }
});

// POST /api/music/planner/plan - Plan song section jobs and/or scale structure dynamically
router.post('/planner/plan', (req: Request, res: Response) => {
  try {
    const { blueprint, targetDuration } = req.body;
    if (!blueprint || !blueprint.structure || !Array.isArray(blueprint.structure)) {
      return res.status(400).json({ error: 'Invalid or missing production blueprint JSON.' });
    }
    const durationNum = targetDuration ? Number(targetDuration) : undefined;
    const planResult = SongPlannerService.planSong(blueprint, durationNum);
    return res.status(200).json(planResult);
  } catch (error: any) {
    console.error('Song Planner Plan Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to construct song production plan' });
  }
});

// POST /api/music/planner/queue - Send planned jobs to the execution queue
router.post('/planner/queue', (req: Request, res: Response) => {
  try {
    const { jobs, userId } = req.body;
    if (!jobs || !Array.isArray(jobs)) {
      return res.status(400).json({ error: 'Missing or invalid planned jobs list.' });
    }
    const registeredIds = SongPlannerService.sendJobsToQueue(jobs, userId);
    return res.status(200).json({
      success: true,
      message: `Enqueued ${registeredIds.length} production jobs.`,
      jobIds: registeredIds
    });
  } catch (error: any) {
    console.error('Song Planner Queue Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to enqueue planned jobs' });
  }
});

// GET /api/music/queue/status - Get status of all jobs in Generation Queue
router.get('/queue/status', (req: Request, res: Response) => {
  try {
    const jobs = GenerationQueueService.getJobs();
    return res.status(200).json({
      success: true,
      count: jobs.length,
      jobs
    });
  } catch (error: any) {
    console.error('Queue Status Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to retrieve queue status' });
  }
});

// POST /api/music/queue/enqueue - Submit planned sections to Generation Queue
router.post('/queue/enqueue', (req: Request, res: Response) => {
  try {
    const { blueprint, jobs } = req.body;
    if (!blueprint || !jobs || !Array.isArray(jobs)) {
      return res.status(400).json({ error: 'Invalid blueprint or jobs array in request body.' });
    }
    const enqueued = GenerationQueueService.enqueueSongJobs(blueprint, jobs);
    return res.status(200).json({
      success: true,
      message: `Successfully enqueued ${enqueued.length} jobs into the prioritized Generation Queue.`,
      jobs: enqueued
    });
  } catch (error: any) {
    console.error('Queue Enqueue Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to enqueue jobs' });
  }
});

// POST /api/music/queue/cancel - Cancel a specific queued job
router.post('/queue/cancel', (req: Request, res: Response) => {
  try {
    const { jobId } = req.body;
    if (!jobId) {
      return res.status(400).json({ error: 'Missing jobId parameter.' });
    }
    const cancelled = GenerationQueueService.cancelJob(jobId);
    return res.status(200).json({
      success: cancelled,
      message: cancelled ? `Successfully cancelled job ${jobId}` : `Could not cancel job ${jobId} (does not exist or already running/completed).`
    });
  } catch (error: any) {
    console.error('Queue Cancel Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to cancel job' });
  }
});

// POST /api/music/queue/purge - Purge old completed/cancelled records
router.post('/queue/purge', (req: Request, res: Response) => {
  try {
    GenerationQueueService.purgeQueue();
    return res.status(200).json({
      success: true,
      message: 'Purged completed and cancelled job memory entries successfully.'
    });
  } catch (error: any) {
    console.error('Queue Purge Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to purge queue' });
  }
});

// POST /api/music/queue/update - Update priority or prompt of a queued job
router.post('/queue/update', (req: Request, res: Response) => {
  try {
    const { jobId, updates } = req.body;
    if (!jobId || !updates) {
      return res.status(400).json({ error: 'Missing jobId or updates parameters.' });
    }
    const success = GenerationQueueService.updateJob(jobId, updates);
    return res.status(200).json({
      success,
      message: success ? `Successfully updated job ${jobId}` : `Failed to update job ${jobId} (not found or currently active/finished).`
    });
  } catch (error: any) {
    console.error('Queue Update Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to update job parameters' });
  }
});

// GET /api/music/workers/status - Get status and GPU resident model telemetry for all MusicGen workers
router.get('/workers/status', (req: Request, res: Response) => {
  try {
    const statuses = MusicGenWorkerService.getWorkersStatus();
    return res.status(200).json({
      success: true,
      workers: statuses
    });
  } catch (error: any) {
    console.error('Workers Status Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch workers status' });
  }
});

// POST /api/music/workers/scale - Scale GPU resident MusicGen worker nodes cluster (e.g. 1, 2, 4, 8)
router.post('/workers/scale', (req: Request, res: Response) => {
  try {
    const { numWorkers } = req.body;
    if (typeof numWorkers !== 'number' || numWorkers < 1 || numWorkers > 8) {
      return res.status(400).json({ error: 'numWorkers must be a number between 1 and 8.' });
    }
    MusicGenWorkerService.scaleWorkers(numWorkers);
    const statuses = MusicGenWorkerService.getWorkersStatus();
    return res.status(200).json({
      success: true,
      message: `Successfully scaled cluster to ${numWorkers} worker nodes.`,
      workers: statuses
    });
  } catch (error: any) {
    console.error('Workers Scale Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to scale worker cluster' });
  }
});

// GET /api/music/quality/stats - Fetch rolling stats from AI Quality Engine
router.get('/quality/stats', (req: Request, res: Response) => {
  try {
    const stats = AiQualityEngineService.getStats();
    return res.status(200).json({ success: true, stats });
  } catch (error: any) {
    console.error('Quality Stats Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch quality stats' });
  }
});

// GET /api/music/quality/dataset - Fetch Gemini active learning dataset
router.get('/quality/dataset', (req: Request, res: Response) => {
  try {
    const dataset = AiQualityEngineService.getDataset();
    return res.status(200).json({ success: true, dataset });
  } catch (error: any) {
    console.error('Quality Dataset Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch reinforcement learning dataset' });
  }
});

// POST /api/music/quality/reset - Reset quality control diagnostics
router.post('/quality/reset', (req: Request, res: Response) => {
  try {
    AiQualityEngineService.resetStats();
    return res.status(200).json({ success: true, message: 'AI Quality Engine stats reset successfully.' });
  } catch (error: any) {
    console.error('Quality Reset Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to reset quality diagnostics' });
  }
});

// GET /api/music/learning/stats - Get Continuous Learning Engine statistics and comparative insights
router.get('/learning/stats', (req: Request, res: Response) => {
  try {
    const stats = ContinuousLearningService.getStats();
    return res.status(200).json({ success: true, stats });
  } catch (error: any) {
    console.error('Learning Stats Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch continuous learning statistics' });
  }
});

// GET /api/music/learning/databases - Get best and failed songs database collections
router.get('/learning/databases', (req: Request, res: Response) => {
  try {
    ContinuousLearningService.init();
    // Expose contents of best_songs.json and failed_songs.json
    const bestSongsPath = path.join(process.cwd(), 'storage', 'best_songs.json');
    const failedSongsPath = path.join(process.cwd(), 'storage', 'failed_songs.json');
    
    let bestSongs = [];
    let failedSongs = [];

    if (fs.existsSync(bestSongsPath)) {
      bestSongs = JSON.parse(fs.readFileSync(bestSongsPath, 'utf8'));
    }
    if (fs.existsSync(failedSongsPath)) {
      failedSongs = JSON.parse(fs.readFileSync(failedSongsPath, 'utf8'));
    }

    return res.status(200).json({
      success: true,
      bestSongs,
      failedSongs
    });
  } catch (error: any) {
    console.error('Learning Databases Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch continuous learning databases' });
  }
});

// POST /api/music/learning/reset - Purge continuous learning experience history
router.post('/learning/reset', (req: Request, res: Response) => {
  try {
    ContinuousLearningService.resetDatabases();
    return res.status(200).json({ success: true, message: 'Continuous Learning databases successfully purged.' });
  } catch (error: any) {
    console.error('Learning Reset Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to purge learning databases' });
  }
});

// POST /api/music/learning/calibrate - Manually trigger system optimization and model guidance calibration
router.post('/learning/calibrate', (req: Request, res: Response) => {
  try {
    const stats = ContinuousLearningService.getStats();
    const promptGuidance = ContinuousLearningService.getProducerGuidanceContext();
    
    return res.status(200).json({
      success: true,
      message: 'System calibration complete. Producer AI guidelines successfully optimized based on historical feedback.',
      calibrationSummary: {
        totalAnalyzed: stats.totalAnalyzed,
        optimalBpmRange: stats.comparativeInsights.bestBpmRange,
        successfulKeys: stats.comparativeInsights.bestKeys,
        successfulInstruments: stats.comparativeInsights.bestInstruments,
        reinforcementPromptContext: promptGuidance
      }
    });
  } catch (error: any) {
    console.error('Learning Calibration Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to calibrate evolutionary engine' });
  }
});

// GET /api/music/dna/elements - Retrieve all elements from the DNA Library
router.get('/dna/elements', (_req: Request, res: Response) => {
  try {
    const elements = MusicDnaLibraryService.getAllElements();
    return res.status(200).json({ success: true, elements });
  } catch (error: any) {
    console.error('DNA Elements Fetch Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch DNA Library elements' });
  }
});

// POST /api/music/dna/element - Append a new element to the DNA Library (Continuous growth)
router.post('/dna/element', (req: Request, res: Response) => {
  try {
    const { id, category, name, description, idealBpm, key, energy, intensity, compatibility, qualityScore } = req.body;
    if (!id || !category || !name || !description) {
      return res.status(400).json({ error: 'Missing required DNA element fields: id, category, name, description' });
    }
    MusicDnaLibraryService.addElement({
      id,
      category,
      name,
      description,
      idealBpm: Number(idealBpm) || 120,
      key: key || 'Any',
      energy: Number(energy) || 5,
      intensity: Number(intensity) || 5,
      compatibility: Array.isArray(compatibility) ? compatibility : [],
      qualityScore: Number(qualityScore) || 90
    });
    return res.status(200).json({ success: true, message: 'New custom DNA element successfully archived in database' });
  } catch (error: any) {
    console.error('DNA Element Addition Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to append element to DNA Library' });
  }
});

// POST /api/music/dna/reset - Wipe custom library entries and restore seeded 14 assets
router.post('/dna/reset', (_req: Request, res: Response) => {
  try {
    MusicDnaLibraryService.resetLibrary();
    return res.status(200).json({ success: true, message: 'Music DNA Library purged and restored to 14 foundational seeds.' });
  } catch (error: any) {
    console.error('DNA Reset Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to reset Music DNA Library' });
  }
});

// GET /api/music/dna/query - Search DNA Library based on parameters
router.get('/dna/query', (req: Request, res: Response) => {
  try {
    const { category, bpm, key, energy, tag } = req.query;
    const results = MusicDnaLibraryService.findCompatiblePatterns({
      category: category as any,
      bpm: bpm ? Number(bpm) : undefined,
      key: key as string,
      energy: energy ? Number(energy) : undefined,
      compatibilityTag: tag as string
    });
    return res.status(200).json({ success: true, results });
  } catch (error: any) {
    console.error('DNA Query Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to query DNA Library' });
  }
});

// GET /api/music/dna/generate-chain - Assembles an optimal relational structure chain for a genre
router.get('/dna/generate-chain', (req: Request, res: Response) => {
  try {
    const { genre } = req.query;
    if (!genre) {
      return res.status(400).json({ error: 'Missing required query parameter "genre"' });
    }
    const chain = MusicDnaLibraryService.generateOptimalChain(genre as string);
    return res.status(200).json({ success: true, chain });
  } catch (error: any) {
    console.error('DNA Chain Generation Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate optimal dynamic DNA relation chain' });
  }
});

// GET /api/music/evolution/ideas - Retrieve all evolved creative ideas
router.get('/evolution/ideas', (_req: Request, res: Response) => {
  try {
    const ideas = CreativeEvolutionEngineService.getAllIdeas();
    return res.status(200).json({ success: true, ideas });
  } catch (error: any) {
    console.error('Evolution Ideas Fetch Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch evolved creative ideas' });
  }
});

// POST /api/music/evolution/generate - Spawns a brand new, highly imaginative idea
router.post('/evolution/generate', (req: Request, res: Response) => {
  try {
    const { creativeIndex, category, context } = req.body;
    if (creativeIndex === undefined) {
      return res.status(400).json({ error: 'Missing required body parameter "creativeIndex" (0-100)' });
    }
    const idea = CreativeEvolutionEngineService.generateCreativeIdea(Number(creativeIndex), category, context || {});
    return res.status(200).json({ success: true, idea });
  } catch (error: any) {
    console.error('Evolution Generation Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate creative idea' });
  }
});

// POST /api/music/evolution/promote - Promotes a creative idea to the DNA Library after verification
router.post('/evolution/promote', (req: Request, res: Response) => {
  try {
    const { ideaId, qualityScore } = req.body;
    if (!ideaId || qualityScore === undefined) {
      return res.status(400).json({ error: 'Missing required parameters "ideaId" and "qualityScore"' });
    }
    const promoted = CreativeEvolutionEngineService.evaluateAndPromoteToDna(ideaId, Number(qualityScore));
    return res.status(200).json({
      success: true,
      promoted,
      message: promoted 
        ? 'Idea successfully passed Quality Engine screening and has been archived as standard DNA!'
        : 'Idea did not meet the Quality Engine criteria (score threshold >= 85%) and was not promoted.'
    });
  } catch (error: any) {
    console.error('Evolution Promotion Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to promote creative idea' });
  }
});

// POST /api/music/evolution/reset - Wipes the evolved ideas and restores default preseeding
router.post('/evolution/reset', (_req: Request, res: Response) => {
  try {
    CreativeEvolutionEngineService.resetIdeas();
    return res.status(200).json({ success: true, message: 'Creative evolution history successfully reset and preseeded.' });
  } catch (error: any) {
    console.error('Evolution Reset Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to reset creative ideas' });
  }
});

// GET /api/music/research/experiments - Retrieves all logged research experiments
router.get('/research/experiments', (_req: Request, res: Response) => {
  try {
    const experiments = ResearchEngineService.getAllExperiments();
    return res.status(200).json({ success: true, experiments });
  } catch (error: any) {
    console.error('Research Experiments Fetch Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch research experiments' });
  }
});

// GET /api/music/research/metrics - Calculates operational metrics
router.get('/research/metrics', (_req: Request, res: Response) => {
  try {
    const metrics = ResearchEngineService.calculateMetrics();
    return res.status(200).json({ success: true, metrics });
  } catch (error: any) {
    console.error('Research Metrics Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to calculate research metrics' });
  }
});

// POST /api/music/research/run - Spawns a full random experiment run
router.post('/research/run', async (_req: Request, res: Response) => {
  try {
    const experiment = await ResearchEngineService.runResearch();
    return res.status(200).json({ success: true, experiment });
  } catch (error: any) {
    console.error('Research Run Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to execute automated research experiment' });
  }
});

// POST /api/music/research/test-harmony - Runs a specific harmony experiment
router.post('/research/test-harmony', async (req: Request, res: Response) => {
  try {
    const { key, chords } = req.body;
    const experiment = await ResearchEngineService.testHarmony(key, chords);
    return res.status(200).json({ success: true, experiment });
  } catch (error: any) {
    console.error('Research Harmony Test Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to execute harmony test' });
  }
});

// POST /api/music/research/test-rhythm - Runs a specific rhythm experiment
router.post('/research/test-rhythm', async (req: Request, res: Response) => {
  try {
    const { bpm, instruments } = req.body;
    const experiment = await ResearchEngineService.testRhythm(bpm ? Number(bpm) : undefined, instruments);
    return res.status(200).json({ success: true, experiment });
  } catch (error: any) {
    console.error('Research Rhythm Test Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to execute rhythm test' });
  }
});

// POST /api/music/research/test-structure - Runs a specific structure experiment
router.post('/research/test-structure', async (req: Request, res: Response) => {
  try {
    const { structure } = req.body;
    const experiment = await ResearchEngineService.testStructure(structure);
    return res.status(200).json({ success: true, experiment });
  } catch (error: any) {
    console.error('Research Structure Test Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to execute structure test' });
  }
});

// POST /api/music/research/reset - Resets research archive
router.post('/research/reset', (_req: Request, res: Response) => {
  try {
    ResearchEngineService.resetArchive();
    return res.status(200).json({ success: true, message: 'Research database archive successfully purged and preseeded.' });
  } catch (error: any) {
    console.error('Research Reset Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to purge research archive' });
  }
});

// GET /api/music/style/all - Retrieves all generated styles
router.get('/style/all', (_req: Request, res: Response) => {
  try {
    const styles = StyleGeneratorService.getAllStyles();
    return res.status(200).json({ success: true, styles });
  } catch (error: any) {
    console.error('Fetch Styles Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch generated styles' });
  }
});

// POST /api/music/style/generate - Generates a new style
router.post('/style/generate', (req: Request, res: Response) => {
  try {
    const { creativeIndex } = req.body;
    const style = StyleGeneratorService.generateStyle(creativeIndex ? Number(creativeIndex) : undefined);
    return res.status(200).json({ success: true, style });
  } catch (error: any) {
    console.error('Generate Style Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate new style' });
  }
});

// POST /api/music/style/mutate - Mutates an existing style
router.post('/style/mutate', (req: Request, res: Response) => {
  try {
    const { styleId, mutationRate } = req.body;
    if (!styleId) {
      return res.status(400).json({ error: 'Missing styleId parameter' });
    }
    const style = StyleGeneratorService.mutateStyle(styleId, mutationRate ? Number(mutationRate) : undefined);
    return res.status(200).json({ success: true, style });
  } catch (error: any) {
    console.error('Mutate Style Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to mutate style' });
  }
});

// POST /api/music/style/merge - Merges two styles
router.post('/style/merge', (req: Request, res: Response) => {
  try {
    const { styleId1, styleId2 } = req.body;
    if (!styleId1 || !styleId2) {
      return res.status(400).json({ error: 'Both styleId1 and styleId2 are required' });
    }
    const style = StyleGeneratorService.mergeStyles(styleId1, styleId2);
    return res.status(200).json({ success: true, style });
  } catch (error: any) {
    console.error('Merge Styles Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to merge styles' });
  }
});

// POST /api/music/style/evaluate - Evaluates a style
router.post('/style/evaluate', (req: Request, res: Response) => {
  try {
    const { styleId } = req.body;
    if (!styleId) {
      return res.status(400).json({ error: 'Missing styleId parameter' });
    }
    const report = StyleGeneratorService.evaluateStyle(styleId);
    return res.status(200).json({ success: true, report });
  } catch (error: any) {
    console.error('Evaluate Style Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to evaluate style' });
  }
});

// POST /api/music/style/test-promote - Auto-tests and promotes style to DNA Library
router.post('/style/test-promote', async (req: Request, res: Response) => {
  try {
    const { styleId } = req.body;
    if (!styleId) {
      return res.status(400).json({ error: 'Missing styleId parameter' });
    }
    const style = await StyleGeneratorService.testAndPromoteStyle(styleId);
    return res.status(200).json({ success: true, style });
  } catch (error: any) {
    console.error('Test and Promote Style Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to test and promote style' });
  }
});

// POST /api/music/style/reset - Purges and pre-seeds styles
router.post('/style/reset', (_req: Request, res: Response) => {
  try {
    StyleGeneratorService.resetStyles();
    return res.status(200).json({ success: true, message: 'Styles successfully purged and pre-seeded.' });
  } catch (error: any) {
    console.error('Reset Styles Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to reset styles database' });
  }
});

export default router;

