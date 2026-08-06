// CollaborationEngine.ts - Core Engine for Global Music Collaboration Graph
// Manages collaboration links, node weights, color schemes, network metrics, and timeline state.

export type CollabType =
  | 'artist_producer'
  | 'producer_producer'
  | 'artist_studio'
  | 'studio_studio'
  | 'label_artist'
  | 'marketplace_creator'
  | 'ai_creator'
  | 'publishing'
  | 'streaming';

export interface CollabEdge {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceCity: string;
  sourceLat: number;
  sourceLng: number;
  targetId: string;
  targetName: string;
  targetCity: string;
  targetLat: number;
  targetLng: number;
  type: CollabType;
  projectTitle: string;
  status: 'active' | 'pulsing' | 'fading';
  intensity: number; // 0.1 to 1.0
  color: string | string[];
  altitude: number;
  timestamp: number;
  marketplaceValue?: number;
}

export const COLLAB_TYPE_COLORS: Record<CollabType, string | string[]> = {
  artist_producer: ['#8b5cf6', '#c084fc'], // Purple
  producer_producer: ['#3b82f6', '#60a5fa'], // Blue
  artist_studio: ['#06b6d4', '#22d3ee'], // Cyan
  studio_studio: ['#00f0ff', '#38bdf8'], // Neon Cyan
  label_artist: ['#ec4899', '#f472b6'], // Pink
  marketplace_creator: ['#f59e0b', '#fbbf24'], // Gold
  ai_creator: ['#a855f7', '#d8b4fe'], // Electric Violet
  publishing: ['#f43f5e', '#fb7185'], // Rose Pink
  streaming: ['#f97316', '#fb923c'], // Orange
};

export const INITIAL_COLLAB_EDGES: CollabEdge[] = [
  {
    id: 'collab-1',
    sourceId: 'creator-london-1',
    sourceName: 'Maya Lin',
    sourceCity: 'London',
    sourceLat: 51.5074,
    sourceLng: -0.1278,
    targetId: 'creator-tokyo-1',
    targetName: 'Kenji Sato',
    targetCity: 'Tokyo',
    targetLat: 35.6762,
    targetLng: 139.6503,
    type: 'artist_producer',
    projectTitle: 'Neo-Tokyo Cyber Vibe (Stem Collab)',
    status: 'active',
    intensity: 0.95,
    color: COLLAB_TYPE_COLORS.artist_producer,
    altitude: 0.35,
    timestamp: Date.now() - 120000,
  },
  {
    id: 'collab-2',
    sourceId: 'creator-berlin-1',
    sourceName: 'Hans Weber',
    sourceCity: 'Berlin',
    sourceLat: 52.52,
    sourceLng: 13.405,
    targetId: 'creator-seoul-1',
    targetName: 'Min-jun Park',
    targetCity: 'Seoul',
    targetLat: 37.5665,
    targetLng: 126.978,
    type: 'ai_creator',
    projectTitle: 'Neural Synth Harmonizer v2.4',
    status: 'active',
    intensity: 0.9,
    color: COLLAB_TYPE_COLORS.ai_creator,
    altitude: 0.4,
    timestamp: Date.now() - 300000,
  },
  {
    id: 'collab-3',
    sourceId: 'creator-la-1',
    sourceName: 'Aria Vance',
    sourceCity: 'Los Angeles',
    sourceLat: 34.0522,
    sourceLng: -118.2437,
    targetId: 'creator-london-2',
    targetName: 'Abbey Road Studios',
    targetCity: 'London',
    targetLat: 51.5074,
    targetLng: -0.1278,
    type: 'artist_studio',
    projectTitle: 'Orchestral Brass Master Tape Sync',
    status: 'active',
    intensity: 0.88,
    color: COLLAB_TYPE_COLORS.artist_studio,
    altitude: 0.3,
    timestamp: Date.now() - 450000,
  },
  {
    id: 'collab-4',
    sourceId: 'creator-saopaulo-1',
    sourceName: 'Carlos Silva',
    sourceCity: 'São Paulo',
    sourceLat: -23.5505,
    sourceLng: -46.6333,
    targetId: 'creator-lagos-1',
    targetName: 'Burna Rhythm',
    targetCity: 'Lagos',
    targetLat: 6.5244,
    targetLng: 3.3792,
    type: 'producer_producer',
    projectTitle: 'Afrobeats X Baile Funk Groove Pack',
    status: 'active',
    intensity: 0.85,
    color: COLLAB_TYPE_COLORS.producer_producer,
    altitude: 0.28,
    timestamp: Date.now() - 600000,
  },
  {
    id: 'collab-5',
    sourceId: 'creator-ny-1',
    sourceName: 'Empire Audio Lab',
    sourceCity: 'New York',
    sourceLat: 40.7128,
    sourceLng: -74.006,
    targetId: 'creator-paris-1',
    targetName: 'Camille Laurent',
    targetCity: 'Paris',
    targetLat: 48.8566,
    targetLng: 2.3522,
    type: 'marketplace_creator',
    projectTitle: 'Exclusive Vocal Multi-Track Royalty Sale',
    status: 'pulsing',
    intensity: 1.0,
    color: COLLAB_TYPE_COLORS.marketplace_creator,
    altitude: 0.32,
    timestamp: Date.now() - 80000,
    marketplaceValue: 1850,
  },
  {
    id: 'collab-6',
    sourceId: 'creator-barcelona-1',
    sourceName: 'Mateo Rossi',
    sourceCity: 'Barcelona',
    sourceLat: 41.3851,
    sourceLng: 2.1734,
    targetId: 'creator-rome-1',
    targetName: 'Studio Cinecittà',
    targetCity: 'Rome',
    targetLat: 41.9028,
    targetLng: 12.4964,
    type: 'publishing',
    projectTitle: 'Global Film Score Publishing Sync',
    status: 'active',
    intensity: 0.9,
    color: COLLAB_TYPE_COLORS.publishing,
    altitude: 0.22,
    timestamp: Date.now() - 180000,
  },
];

export type NetworkViewMode = 'globe' | 'network' | 'hybrid';
export type TimelineFilter = 'today' | 'last_week' | 'last_month' | 'replay';

export class CollaborationEngine {
  private edges: Map<string, CollabEdge> = new Map();
  private viewMode: NetworkViewMode = 'globe';
  private currentTimeline: TimelineFilter = 'today';

  constructor(initialEdges: CollabEdge[] = INITIAL_COLLAB_EDGES) {
    initialEdges.forEach((e) => this.edges.set(e.id, e));
  }

  public getEdges(): CollabEdge[] {
    return Array.from(this.edges.values());
  }

  public addEdge(edge: CollabEdge): void {
    this.edges.set(edge.id, edge);
  }

  public removeEdge(id: string): void {
    this.edges.delete(id);
  }

  public setViewMode(mode: NetworkViewMode): void {
    this.viewMode = mode;
  }

  public getViewMode(): NetworkViewMode {
    return this.viewMode;
  }

  public setTimelineFilter(filter: TimelineFilter): void {
    this.currentTimeline = filter;
  }

  public getTimelineFilter(): TimelineFilter {
    return this.currentTimeline;
  }

  public getFilteredEdges(collabFilter: string = 'All'): CollabEdge[] {
    const all = Array.from(this.edges.values());
    if (collabFilter === 'All') return all;
    return all.filter((e) => e.type === collabFilter.toLowerCase());
  }
}
