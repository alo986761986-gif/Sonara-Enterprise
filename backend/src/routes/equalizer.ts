import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import {
  DEFAULT_EQ_BANDS,
  ParametricEqService,
  PROFESSIONAL_EQ_PRESETS
} from '../services/ParametricEqService';

const router = Router();

router.get('/presets', (_req: Request, res: Response) => {
  return res.status(200).json({
    status: 'success',
    presets: PROFESSIONAL_EQ_PRESETS,
    defaultBands: DEFAULT_EQ_BANDS,
    totalBands: DEFAULT_EQ_BANDS.length,
    sampleRate: 44100
  });
});

router.post('/process', async (req: Request, res: Response) => {
  try {
    const {
      bands,
      audioUrl,
      inputGainDb = 0,
      outputGainDb = 0,
      globalBypass = false
    } = req.body || {};

    if (!audioUrl || typeof audioUrl !== 'string') {
      return res.status(400).json({
        status: 'error',
        error: 'EQ_AUDIO_REQUIRED: generate a real track before processing.'
      });
    }

    let urlPath = audioUrl.split('?')[0];
    if (/^https?:\/\//i.test(urlPath)) {
      urlPath = new URL(urlPath).pathname;
    }

    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(urlPath);
    } catch {
      return res.status(400).json({
        status: 'error',
        error: 'EQ_AUDIO_INVALID: malformed audio URL.'
      });
    }

    if (!decodedPath.startsWith('/storage/audio/')) {
      return res.status(400).json({
        status: 'error',
        error: 'EQ_AUDIO_INVALID: only generated Sonara masters can be processed.'
      });
    }

    const storageAudioDir = path.resolve(process.cwd(), 'storage', 'audio');
    const resolvedPath = path.resolve(
      process.cwd(),
      decodedPath.replace(/^\/+/, '')
    );

    if (
      !resolvedPath.startsWith(`${storageAudioDir}${path.sep}`) ||
      path.extname(resolvedPath).toLowerCase() !== '.wav'
    ) {
      return res.status(400).json({
        status: 'error',
        error: 'EQ_AUDIO_INVALID: unsafe or unsupported audio path.'
      });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({
        status: 'error',
        error: 'EQ_AUDIO_NOT_FOUND: the selected generated master no longer exists.'
      });
    }

    const inputBuffer = fs.readFileSync(resolvedPath);
    const requestedBands =
      Array.isArray(bands) && bands.length > 0
        ? bands
        : DEFAULT_EQ_BANDS;
    const effectiveBands = globalBypass
      ? requestedBands.map(band => ({ ...band, enabled: false }))
      : requestedBands;

    const result = ParametricEqService.processWavBuffer(
      inputBuffer,
      effectiveBands,
      {
        inputGainDb: Number(inputGainDb),
        outputGainDb: Number(outputGainDb)
      }
    );

    if (!fs.existsSync(storageAudioDir)) {
      fs.mkdirSync(storageAudioDir, { recursive: true });
    }

    const outputFileName = `mastered_eq_${Date.now()}.wav`;
    const outputPath = path.join(storageAudioDir, outputFileName);
    fs.writeFileSync(outputPath, result.processedBuffer);

    return res.status(200).json({
      status: 'success',
      metrics: result.metrics,
      audioUrl: `/storage/audio/${outputFileName}`,
      processedByteLength: result.processedBuffer.length,
      applied: {
        globalBypass: Boolean(globalBypass),
        inputGainDb: Number(inputGainDb) || 0,
        outputGainDb: Number(outputGainDb) || 0,
        activeBands: result.metrics.activeBandsCount
      }
    });
  } catch (error: any) {
    console.error('EQ Process Error:', error);
    return res.status(500).json({
      status: 'error',
      error: error.message || 'EQ processing failed'
    });
  }
});

export default router;
