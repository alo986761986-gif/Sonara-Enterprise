import { PerformanceInspector } from './PerformanceInspector';

export const PerformanceMonitor = {
  init() {
    // Monitor long tasks
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        console.warn('Long task detected:', entry.duration, 'ms');
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
  },
  report() {
    console.table(PerformanceInspector.getMetrics());
  }
};
