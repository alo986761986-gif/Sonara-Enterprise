import { RequestHandler } from 'express';
import { VocalGenerationConfigService } from '../services/VocalGenerationConfigService';

export const applyVocalGenerationConfig: RequestHandler = (req, res, next) => {
  if (req.method !== 'POST' || req.path !== '/generate') {
    next();
    return;
  }

  const config = VocalGenerationConfigService.getConfig();
  const instrumental = VocalGenerationConfigService.isInstrumental(config);

  if (!instrumental && !config.lyrics.trim()) {
    res.status(400).json({
      status: 'error',
      error: 'Vocal mode is active but the lyrics field is empty. Add lyrics in the Sonara Vocal Studio panel before generating.'
    });
    return;
  }

  const originalPrompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  const vocalPrompt = VocalGenerationConfigService.buildPromptSuffix(config);

  req.body = {
    ...(req.body || {}),
    prompt: `${originalPrompt} ${vocalPrompt}`.trim(),
    lyrics: VocalGenerationConfigService.buildLyricsEnvelope(config)
  };

  next();
};
