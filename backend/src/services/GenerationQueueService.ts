export class GenerationQueueService {
  static enqueue(task: any) {
    return { taskId: `task-${Date.now()}`, status: 'queued' };
  }
}
