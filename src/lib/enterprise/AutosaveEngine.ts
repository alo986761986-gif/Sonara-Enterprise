/**
 * SONARA PHOENIX AUTOSAVE ENGINE
 * Enterprise-grade background persistence for unsaved work.
 */

type SaveHandler = (data: any) => Promise<void>;

class AutosaveEngine {
  private timers: Map<string, any> = new Map();
  private pendingChanges: Set<string> = new Set();

  /**
   * Schedules a debounced save operation
   */
  public schedule(id: string, data: any, handler: SaveHandler, delay = 2000) {
    if (this.timers.has(id)) {
      clearTimeout(this.timers.get(id));
    }

    this.pendingChanges.add(id);

    const timer = setTimeout(async () => {
      try {
        await handler(data);
        this.pendingChanges.delete(id);
        this.timers.delete(id);
        console.log(`[Autosave] ${id} completed`);
      } catch (error) {
        console.error(`[Autosave] ${id} failed`, error);
        // Retry logic could go here
      }
    }, delay);

    this.timers.set(id, timer);
  }

  public isPending(id?: string) {
    if (id) return this.pendingChanges.has(id);
    return this.pendingChanges.size > 0;
  }

  public async flush() {
    // Force save all pending
    // implementation for urgent exit
  }
}

export const autosave = new AutosaveEngine();
