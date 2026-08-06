import { MemoryInspector } from './MemoryInspector';
import { MemoryManager } from './MemoryManager';

export const MemoryMonitor = {
  init() {
    setInterval(() => {
      const metrics = MemoryInspector.getMetrics();
      if (metrics) {
        const usageRatio = metrics.usedJSHeapSize / metrics.jsHeapSizeLimit;
        if (usageRatio > 0.8) {
          console.warn('Memory usage high:', usageRatio * 100, '%');
          MemoryManager.clearCaches();
        }
      }
    }, 5000);
  }
};
