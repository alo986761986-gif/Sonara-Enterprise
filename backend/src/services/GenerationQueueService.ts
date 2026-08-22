export interface GenerationQueueJob {
  id: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  prompt?: string;
  genre?: string;
  bpm?: number;
  duration: number;
  targetDurationSec?: number;
  sectionName?: string;
  blueprintId?: string;
  executionTime?: number;
  output?: string;
  metadata?: any;
}

export class GenerationQueueService {
  private static jobs: GenerationQueueJob[] = [];

  static enqueue(task: any) {
    const job: GenerationQueueJob = {
      id: task?.id || `task-${Date.now()}`,
      status: 'WAITING',
      attempts: 0,
      maxAttempts: 3,
      duration: Number(task?.duration || task?.targetDurationSec || 15),
      ...task
    };

    this.jobs.push(job);
    return job;
  }

  static getJobs(): GenerationQueueJob[] {
    return this.jobs;
  }

  static enqueueSongJobs(_blueprint: any, jobs: any[]): GenerationQueueJob[] {
    return jobs.map(job => this.enqueue(job));
  }

  static cancelJob(jobId: string): boolean {
    const job = this.jobs.find(j => j.id === jobId);
    if (!job || job.status === 'RUNNING' || job.status === 'FINISHED') return false;
    job.status = 'CANCELLED';
    return true;
  }

  static purgeQueue(): void {
    this.jobs = this.jobs.filter(
      job => job.status !== 'FINISHED' &&
             job.status !== 'FAILED' &&
             job.status !== 'CANCELLED'
    );
  }

  static updateJob(jobId: string, updates: any): boolean {
    const job = this.jobs.find(j => j.id === jobId);
    if (!job || job.status === 'RUNNING' || job.status === 'FINISHED') return false;
    Object.assign(job, updates);
    return true;
  }
}
