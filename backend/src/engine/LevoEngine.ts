import {
  IAudioGenerationEngine,
  GenerationParams,
  GenerationResult,
  EngineHealthStatus
} from './IAudioGenerationEngine';
import { AceStepEngine } from './AceStepEngine';

/**
 * Backward-compatible engine facade.
 * Existing Sonara services still import LevoEngine, but generation is now
 * delegated to the ACE-Step 1.5 HTTP adapter.
 */
export class LevoEngine extends IAudioGenerationEngine {
  readonly name = 'AceStepEngine';

  private static instance: LevoEngine | null = null;
  private readonly delegate = AceStepEngine.getInstance();

  public static getInstance(): LevoEngine {
    if (!LevoEngine.instance) {
      LevoEngine.instance = new LevoEngine();
    }
    return LevoEngine.instance;
  }

  public initialize(): Promise<void> {
    return this.delegate.initialize();
  }

  public loadModel(modelId?: string): Promise<boolean> {
    return this.delegate.loadModel(modelId);
  }

  public generate(params: GenerationParams): Promise<GenerationResult> {
    return this.delegate.generate(params);
  }

  public shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }

  public healthCheck(): Promise<EngineHealthStatus> {
    return this.delegate.healthCheck();
  }
}
