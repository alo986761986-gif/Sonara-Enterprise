import express from 'express';
import { VocalGenerationConfigService } from '../services/VocalGenerationConfigService';

const router = express.Router();

router.get('/config', (_req, res) => {
  res.json({
    ok: true,
    paidApi: false,
    config: VocalGenerationConfigService.getConfig()
  });
});

router.post('/config', (req, res) => {
  const config = VocalGenerationConfigService.updateConfig({
    mode: req.body?.mode,
    style: req.body?.style,
    language: req.body?.language,
    lyrics: req.body?.lyrics
  });

  res.json({
    ok: true,
    paidApi: false,
    config
  });
});

export default router;
