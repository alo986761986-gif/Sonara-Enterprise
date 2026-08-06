export type SyncPriority = 'high' | 'low';
export type SyncType = 'upload' | 'download';

export interface SyncItem {
  id: string;
  type: SyncType;
  priority: SyncPriority;
  action: () => Promise<void>;
  status: 'pending' | 'syncing' | 'completed' | 'failed';
}

export class SyncQueue {
  private queue: SyncItem[] = [];

  enqueue(item: SyncItem) {
    this.queue.push(item);
    this.sortQueue();
  }

  dequeue(): SyncItem | undefined {
    return this.queue.shift();
  }

  private sortQueue() {
    this.queue.sort((a, b) => {
      if (a.priority === 'high' && b.priority === 'low') return -1;
      if (a.priority === 'low' && b.priority === 'high') return 1;
      return 0;
    });
  }

  getPendingItems(): SyncItem[] {
    return this.queue.filter(i => i.status === 'pending');
  }

  updateItemStatus(id: string, status: SyncItem['status']) {
    const item = this.queue.find(i => i.id === id);
    if (item) item.status = status;
  }
}
