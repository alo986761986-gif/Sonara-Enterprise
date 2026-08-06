// RealtimeEventManager.ts - Phase 5 Realtime Event Generator & Dispatcher
// Manages real-time music industry events across the global Sonara AI ecosystem.

import { HOTSPOT_CITIES } from './RealtimeMusicFeed';
import { PulseEffect } from './PulseRenderer';
import { CollabType, COLLAB_TYPE_COLORS } from './CollaborationEngine';

export type LiveEventType =
  | 'song_published'
  | 'song_uploaded'
  | 'project_created'
  | 'project_shared'
  | 'collaboration_started'
  | 'marketplace_purchase'
  | 'marketplace_upload'
  | 'ai_generation'
  | 'studio_online'
  | 'artist_online'
  | 'live_streaming_started'
  | 'live_streaming_ended'
  | 'voice_session_started'
  | 'comment_posted'
  | 'new_follower'
  | 'verified_login'
  | 'live_concert';

export interface ConcertDetails {
  id: string;
  artist: string;
  city: string;
  venue: string;
  audienceCount: number;
  startTime: string;
  streamUrl?: string;
  genre: string;
  lat: number;
  lng: number;
}

export interface LiveStreamDetails {
  id: string;
  creatorName: string;
  city: string;
  title: string;
  viewers: number;
  lat: number;
  lng: number;
  avatar: string;
}

export interface LiveEventItem {
  id: string;
  type: LiveEventType;
  headline: string;
  details: string;
  sourceCity: string;
  sourceCountry: string;
  sourceLat: number;
  sourceLng: number;
  targetCity?: string;
  targetLat?: number;
  targetLng?: number;
  creatorName: string;
  avatar?: string;
  priorityScore: number; // 1 to 100 for Smart Camera Director
  color: string;
  timestamp: number;
  concert?: ConcertDetails;
  stream?: LiveStreamDetails;
  valueUSD?: number;
}

export type EventSubscriber = (event: LiveEventItem) => void;

export class RealtimeEventManager {
  private subscribers: Set<EventSubscriber> = new Set();
  private eventHistory: LiveEventItem[] = [];
  private activeStreams: Map<string, LiveStreamDetails> = new Map();
  private upcomingConcerts: ConcertDetails[] = [];

  constructor() {
    this.seedInitialConcertsAndStreams();
  }

  private seedInitialConcertsAndStreams(): void {
    this.upcomingConcerts = [
      {
        id: 'concert-london-1',
        artist: 'Maya Lin & The London Symphony',
        city: 'London',
        venue: 'O2 Arena Hologram Stage',
        audienceCount: 18400,
        startTime: 'LIVE NOW',
        genre: 'Cyber Symphonic',
        lat: 51.5074,
        lng: -0.1278,
      },
      {
        id: 'concert-tokyo-1',
        artist: 'Kenji Sato x Synth Collective',
        city: 'Tokyo',
        venue: 'Shinjuku Neo Dome',
        audienceCount: 22100,
        startTime: 'In 15 Min',
        genre: 'Synthwave / Cyberpunk',
        lat: 35.6762,
        lng: 139.6503,
      },
      {
        id: 'concert-la-1',
        artist: 'Aria Vance & Sunset Brass',
        city: 'Los Angeles',
        venue: 'Hollywood Bowl Immersive',
        audienceCount: 14500,
        startTime: 'In 45 Min',
        genre: 'Cinematic Funk',
        lat: 34.0522,
        lng: -118.2437,
      },
    ];

    const s1: LiveStreamDetails = {
      id: 'stream-1',
      creatorName: 'Hans Weber',
      city: 'Berlin',
      title: 'Neural Modular Synth Sound Design Live',
      viewers: 1420,
      lat: 52.52,
      lng: 13.405,
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    };
    this.activeStreams.set(s1.id, s1);
  }

  public subscribe(callback: EventSubscriber): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  public emitEvent(event: LiveEventItem): void {
    this.eventHistory.unshift(event);
    if (this.eventHistory.length > 200) {
      this.eventHistory.pop();
    }
    this.subscribers.forEach((cb) => cb(event));
  }

  public generateRandomEvent(): LiveEventItem {
    const src = HOTSPOT_CITIES[Math.floor(Math.random() * HOTSPOT_CITIES.length)];
    let target = HOTSPOT_CITIES[Math.floor(Math.random() * HOTSPOT_CITIES.length)];
    while (target.city === src.city) {
      target = HOTSPOT_CITIES[Math.floor(Math.random() * HOTSPOT_CITIES.length)];
    }

    const eventTypes: LiveEventType[] = [
      'song_published',
      'song_uploaded',
      'project_created',
      'project_shared',
      'collaboration_started',
      'marketplace_purchase',
      'marketplace_upload',
      'ai_generation',
      'studio_online',
      'artist_online',
      'live_streaming_started',
      'voice_session_started',
      'comment_posted',
      'new_follower',
      'verified_login',
    ];

    const type = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    const creatorName = `@creator_${src.city.toLowerCase().replace(/\s+/g, '')}`;
    const now = Date.now();

    let headline = '';
    let details = '';
    let priorityScore = 30;
    let color = '#3b82f6';
    let valueUSD: number | undefined;

    switch (type) {
      case 'song_published':
        headline = `🎵 Song Published: "${this.randomSongTitle()}"`;
        details = `${creatorName} published a new track in ${src.city}`;
        priorityScore = 85;
        color = '#ec4899'; // Expanding pink/white pulse
        break;

      case 'collaboration_started':
        headline = `⚡ Collab Started: ${src.city} ⇄ ${target.city}`;
        details = `${creatorName} initiated a P2P stem session with @artist_${target.city.toLowerCase()}`;
        priorityScore = 90;
        color = '#8b5cf6'; // Neon purple arc
        break;

      case 'marketplace_purchase':
        valueUSD = Math.floor(150 + Math.random() * 2400);
        headline = `💎 Marketplace Sale: $${valueUSD} USD`;
        details = `Exclusive Stem Rights purchased by @buyer in ${target.city}`;
        priorityScore = 80;
        color = '#f59e0b'; // Golden flash
        break;

      case 'ai_generation':
        headline = `🤖 AI Generation: Neural Audio Synth`;
        details = `48kHz 24-bit AI stems synthesized in ${src.city}`;
        priorityScore = 70;
        color = '#a855f7'; // Electric violet
        break;

      case 'live_streaming_started':
        headline = `🔴 Live Stream Started in ${src.city}`;
        details = `${creatorName} is broadcasting live master tape mixing`;
        priorityScore = 95;
        color = '#ef4444'; // Red beacon
        break;

      case 'new_follower':
        headline = `👤 New Follower Linked`;
        details = `@listener_${target.city.toLowerCase()} connected to ${creatorName}`;
        priorityScore = 20;
        color = '#3b82f6'; // Blue ripple
        break;

      case 'studio_online':
        headline = `🎙️ Studio Online: ${src.city} Audio Lab`;
        details = `High-speed 96kHz optical link active`;
        priorityScore = 50;
        color = '#06b6d4';
        break;

      default:
        headline = `🎧 Music Activity in ${src.city}`;
        details = `${creatorName} updated project workspace`;
        priorityScore = 25;
        color = '#10b981';
        break;
    }

    const item: LiveEventItem = {
      id: `evt-${now}-${Math.floor(Math.random() * 1000)}`,
      type,
      headline,
      details,
      sourceCity: src.city,
      sourceCountry: src.country,
      sourceLat: src.lat,
      sourceLng: src.lng,
      targetCity: target.city,
      targetLat: target.lat,
      targetLng: target.lng,
      creatorName,
      priorityScore,
      color,
      timestamp: now,
      valueUSD,
    };

    this.emitEvent(item);
    return item;
  }

  private randomSongTitle(): string {
    const titles = [
      'Neon Midnight Sync',
      'Cybernetic Reverie',
      'Tokyo Drift Harmonies',
      'Sub-Zero Frequency',
      'Bossa Nova 2099',
      'Quantum Echoes',
      'Solar Flare Bounce',
      'Starlight Vocal Multi-Track',
    ];
    return titles[Math.floor(Math.random() * titles.length)];
  }

  public getEventHistory(): LiveEventItem[] {
    return this.eventHistory;
  }

  public getUpcomingConcerts(): ConcertDetails[] {
    return this.upcomingConcerts;
  }

  public getActiveStreams(): LiveStreamDetails[] {
    return Array.from(this.activeStreams.values());
  }
}
