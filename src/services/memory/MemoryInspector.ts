import { MemoryMetrics } from './types';

export const MemoryInspector = {
  getMetrics(): MemoryMetrics | null {
    // @ts-ignore
    if (performance.memory) {
      // @ts-ignore
      const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = performance.memory;
      return { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit };
    }
    return null;
  }
};
