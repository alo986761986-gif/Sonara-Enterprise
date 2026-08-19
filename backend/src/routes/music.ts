import { Router, Request, Response } from 'express';
import { JobManager } from '../jobs/JobManager';

const router = Router();

router.get('/job/:jobId', (req: Request, res: Response) => {
  const job = JobManager.getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({
      status: 'FAILED',
      error: `Job ${req.params.jobId} not found`
    });
  }

  return res.json({
    jobId: job.jobId,
    status: job.status,
    progress: job.progress,
    audioUrl: job.audioUrl || null,
    metadata: job.metadata || {},
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    error: job.error || job.metadata?.error || null
  });
});

router.get('/jobs', (_req: Request, res: Response) => {
  return res.json({
    status: 'success',
    jobs: JobManager.listJobs()
  });
});

router.get('/workers/status', (_req: Request, res: Response) => {
  return res.json({
    status: 'success',
    engine: 'Sonara ACE-Step 1.5 Engine',
    engineId: 'sonara_acestep_v15',
    workers: [
      {
        workerId: 'acestep-lightning-l4',
        status: 'REMOTE',
        modelName: 'acestep-v15-turbo'
      }
    ]
  });
});

export default router;
