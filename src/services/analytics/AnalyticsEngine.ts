import { analyticsManager } from './AnalyticsManager';
import { EventType } from './types';

export class AnalyticsEngine {
  track(type: EventType, target: string, data?: Record<string, any>) {
    analyticsManager.logEvent(type, target, data);
  }
}

export const analyticsEngine = new AnalyticsEngine();
