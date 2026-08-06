// orchestrator.ts - Express Router for Sonara Global Orchestrator AI
import { Router, Request, Response } from 'express';
import { GlobalOrchestratorService } from '../services/GlobalOrchestratorService';

const router = Router();

// GET /api/orchestrator/state - Full cluster telemetry & module health state
router.get('/state', (_req: Request, res: Response) => {
  try {
    const service = GlobalOrchestratorService.getInstance();
    const state = service.getSystemState();
    return res.status(200).json({
      success: true,
      state
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve orchestrator state'
    });
  }
});

// POST /api/orchestrator/orchestrate - Trigger central orchestration tick
router.post('/orchestrate', (_req: Request, res: Response) => {
  try {
    const service = GlobalOrchestratorService.getInstance();
    const result = service.orchestrate();
    return res.status(200).json({
      success: true,
      result
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/orchestrator/allocate-resources - Dynamic resource allocation
router.post('/allocate-resources', (req: Request, res: Response) => {
  try {
    const { targetNodeId, allocatedVramMb, priorityTier } = req.body;
    const service = GlobalOrchestratorService.getInstance();
    const allocation = service.allocateResources({
      targetNodeId,
      allocatedVramMb: allocatedVramMb ? Number(allocatedVramMb) : undefined,
      priorityTier
    });
    return res.status(200).json({
      success: true,
      allocation
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/orchestrator/rebalance-workers - Rebalance tasks across GPU/Cloud/Edge
router.post('/rebalance-workers', (_req: Request, res: Response) => {
  try {
    const service = GlobalOrchestratorService.getInstance();
    const rebalance = service.rebalanceWorkers();
    return res.status(200).json({
      success: true,
      rebalance
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/orchestrator/optimize-system - Auto-optimize VRAM, RAM, caching & batching
router.post('/optimize-system', (_req: Request, res: Response) => {
  try {
    const service = GlobalOrchestratorService.getInstance();
    const report = service.optimizeSystem();
    return res.status(200).json({
      success: true,
      report
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/orchestrator/predict-failures - Predict hardware & VRAM failure points
router.post('/predict-failures', (_req: Request, res: Response) => {
  try {
    const service = GlobalOrchestratorService.getInstance();
    const predictions = service.predictFailures();
    return res.status(200).json({
      success: true,
      predictions
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/orchestrator/recover-automatically - Auto-recovery & self-healing
router.post('/recover-automatically', (_req: Request, res: Response) => {
  try {
    const service = GlobalOrchestratorService.getInstance();
    const recovery = service.recoverAutomatically();
    return res.status(200).json({
      success: true,
      recovery
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
