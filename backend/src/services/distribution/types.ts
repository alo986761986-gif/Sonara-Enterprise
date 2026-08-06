// types.ts - Distribution Engine Type Definitions
export type SupportedPlatform = 
  | 'SPOTIFY'
  | 'APPLE_MUSIC'
  | 'YOUTUBE_MUSIC'
  | 'AMAZON_MUSIC'
  | 'DEEZER'
  | 'TIKTOK'
  | 'INSTAGRAM'
  | 'FACEBOOK'
  | 'SOUNDCLOUD'
  | 'BEATPORT'
  | 'BANDCAMP';

export type JobStatus = 'PENDING' | 'IN_PROGRESS' | 'PUBLISHED' | 'FAILED' | 'RETRY' | 'RATE_LIMITED';

export interface ReleasePackage {
  songId: string;
  artistId: string;
  artistName: string;
  songTitle: string;
  version: string;
  metadata: Record<string, any>;
  artworkUrl?: string;
  lyrics?: string;
  isrc: string; // International Standard Recording Code
  upc: string;  // Universal Product Code
  language: string;
  genre: string;
  releaseDate: string;
  explicitContent?: boolean;
}

export interface PlatformReleaseStatus {
  platform: SupportedPlatform;
  status: JobStatus;
  externalPlatformId?: string;
  publishedUrl?: string;
  lastSyncTimestamp: string;
  attemptsCount: number;
  errorMessage?: string;
  rateLimitResetTimestamp?: string;
  oauthConnected: boolean;
}

export interface DistributionJob {
  jobId: string;
  songId: string;
  artistId: string;
  package: ReleasePackage;
  platforms: SupportedPlatform[];
  platformStatuses: Record<SupportedPlatform, PlatformReleaseStatus>;
  status: JobStatus;
  priority: number;
  maxRetries: number;
  retryDelayMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface IDspPlatformAdapter {
  platformName: SupportedPlatform;
  connect(config?: Record<string, any>): Promise<boolean>;
  publish(pkg: ReleasePackage): Promise<PlatformReleaseStatus>;
  update(songId: string, metadata: Partial<ReleasePackage>): Promise<PlatformReleaseStatus>;
  delete(songId: string): Promise<boolean>;
  sync(songId: string): Promise<PlatformReleaseStatus>;
  checkStatus(songId: string): Promise<PlatformReleaseStatus>;
}
