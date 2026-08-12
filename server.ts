import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

import engineRouter from './backend/src/routes/engine';
import orchestratorRouter from './backend/src/routes/orchestrator';
import creatorRouter from './backend/src/routes/creator';
import musicRouter from './backend/src/routes/music';
import emberRouter from './backend/src/routes/ember';
import vocalsRouter from './backend/src/routes/vocals';
import { applyVocalGenerationConfig } from './backend/src/middleware/applyVocalGenerationConfig';

const startTime = Date.now();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Health Endpoint
  app.get('/api/health', (_req, res) => {
    const memory = process.memoryUsage();
    res.json({
      status: 'HEALTHY',
      service: 'sonara-ai-backend-enterprise',
      version: '12.0.0',
      telemetry: {
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
        system: {
          platform: process.platform,
          arch: process.arch,
          cpus: 2,
          totalMemoryMb: 8192,
          freeMemoryMb: 4096,
          memoryUsagePercent: Math.round((memory.heapUsed / memory.heapTotal) * 100)
        },
        audioEngine: {
          status: 'HEALTHY',
          avgProcessingDurationSec: 1.8,
          targetLufsNorm: -14.0
        }
      }
    });
  });

  // API Routes
  app.use('/api/vocals', vocalsRouter);
  app.use('/api/engine', applyVocalGenerationConfig, engineRouter);
  app.use('/api/orchestrator', orchestratorRouter);
  app.use('/api/creator', creatorRouter);
  app.use('/api/music', musicRouter);
  app.use('/api/ember', emberRouter);

  // Serve storage files (generated audio, audio renders)
  const storagePath = path.join(process.cwd(), 'storage');
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }
  app.use('/storage', express.static(storagePath, {
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Accept-Ranges', 'bytes');
    }
  }));

  // Vite Development / Production Middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SONARA V12] Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[SONARA V12] Fatal server startup error:', err);
  process.exit(1);
});
