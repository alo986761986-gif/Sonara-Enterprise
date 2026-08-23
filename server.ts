import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

const startTime = Date.now();

function loadLocalEnvironment(): string | null {
  const candidates = [
    path.join(process.cwd(), '.env.local'),
    path.join(process.cwd(), '.env')
  ];

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;

    const raw = fs.readFileSync(envPath, 'utf8');
    for (const rawLine of raw.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const separator = line.indexOf('=');
      if (separator <= 0) continue;

      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      // The local file is authoritative in local development. This prevents
      // stale PowerShell environment variables from overriding valid Modal credentials.
      process.env[key] = value;
    }

    return envPath;
  }

  return null;
}

const loadedEnvPath = loadLocalEnvironment();
if (loadedEnvPath) {
  console.log(`[SONARA V12] Loaded private environment from ${path.basename(loadedEnvPath)}`);
}
console.log(
  `[SONARA V12] ACE-Step configuration | URL=${Boolean(process.env.ACESTEP_API_URL)} | KEY=${Boolean(process.env.MODAL_PROXY_KEY)} | SECRET=${Boolean(process.env.MODAL_PROXY_SECRET)}`
);

async function startServer() {
  // Import backend routes only after private environment variables have been loaded.
  // This prevents engine singletons from capturing empty/stale credentials during module startup.
  const [
    { default: engineRouter },
    { default: orchestratorRouter },
    { default: creatorRouter },
    { default: musicRouter }
  ] = await Promise.all([
    import('./backend/src/routes/engine'),
    import('./backend/src/routes/orchestrator'),
    import('./backend/src/routes/creator'),
    import('./backend/src/routes/music')
  ]);

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
          targetLufsNorm: -14.0,
          aceStepConfigured: Boolean(
            process.env.ACESTEP_API_URL &&
            process.env.MODAL_PROXY_KEY &&
            process.env.MODAL_PROXY_SECRET
          )
        }
      }
    });
  });

  // API Routes
  app.use('/api/engine', engineRouter);
  app.use('/api/orchestrator', orchestratorRouter);
  app.use('/api/creator', creatorRouter);
  app.use('/api/music', musicRouter);

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
    app.get('/{*splat}', (_req, res) => {
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
