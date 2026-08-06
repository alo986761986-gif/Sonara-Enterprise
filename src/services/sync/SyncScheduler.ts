import { cloudSyncService } from './CloudSyncService';
import { OfflineManager } from '../OfflineManager';

export class SyncScheduler {
  constructor() {
    this.init();
  }

  private init() {
    window.addEventListener('online', () => {
      // Trigger sync processing when back online
      console.log('Network back online, resuming sync...');
    });
  }

  schedulePeriodicSync() {
    setInterval(() => {
      if (OfflineManager.getInstance().getIsOnline()) {
        // Trigger background syncs
      }
    }, 60000); // Every minute
  }
}

export const syncScheduler = new SyncScheduler();
