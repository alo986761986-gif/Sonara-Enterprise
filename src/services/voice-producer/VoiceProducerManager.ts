import { VoiceProducerEngine } from './VoiceProducerEngine';
import { ProducerMessage } from './types';

export class VoiceProducerManager {
  private engines: Record<string, VoiceProducerEngine> = {};

  getEngine(projectId: string): VoiceProducerEngine {
    if (!this.engines[projectId]) {
      this.engines[projectId] = new VoiceProducerEngine(projectId);
    }
    return this.engines[projectId];
  }
}

export const voiceProducerManager = new VoiceProducerManager();
