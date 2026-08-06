export class BackgroundTaskManager {
  private static instance: BackgroundTaskManager;
  
  static getInstance() {
    if (!this.instance) this.instance = new BackgroundTaskManager();
    return this.instance;
  }

  run(task: () => Promise<void>) {
    requestIdleCallback(() => {
      task().catch(err => console.error('Background task failed', err));
    });
  }
}
