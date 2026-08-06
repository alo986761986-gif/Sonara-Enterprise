export interface JobRecord {
  jobId: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  payload?: any;
  userId?: string;
  metadata?: any;
  audioUrl?: string | null;
  error?: string | null;
  retryCount?: number;
  maxRetries?: number;
  createdAt: string;
  updatedAt: string;
}

export class JobManager {
  private static jobs: Map<string, JobRecord> = new Map();

  static init() {
    // In-memory initialization
    if (!this.jobs) {
      this.jobs = new Map();
    }
  }

  static listJobs(): JobRecord[] {
    this.init();
    return Array.from(this.jobs.values());
  }

  static registerJob(jobId: string, metadata: any, payload: any, userId?: string): JobRecord {
    this.init();
    const existing = this.jobs.get(jobId);
    if (existing) return existing;

    const newJob: JobRecord = {
      jobId,
      status: 'QUEUED',
      progress: 0,
      payload,
      userId,
      metadata: metadata || {},
      audioUrl: null,
      error: null,
      retryCount: 0,
      maxRetries: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.jobs.set(jobId, newJob);
    return newJob;
  }

  static getJob(jobId: string): JobRecord | undefined {
    this.init();
    return this.jobs.get(jobId);
  }

  static updateJobStatus(jobId: string, status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED', updatePayload: Partial<JobRecord>): JobRecord {
    this.init();
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const updatedJob: JobRecord = {
      ...job,
      ...updatePayload,
      status,
      updatedAt: new Date().toISOString()
    };
    this.jobs.set(jobId, updatedJob);
    return updatedJob;
  }

  static async addJob(type: string, payload: any) {
    this.init();
    const jobId = `job-${Date.now()}`;
    const job = this.registerJob(jobId, { type }, payload);
    return { id: jobId, type, payload, status: job.status };
  }
}

