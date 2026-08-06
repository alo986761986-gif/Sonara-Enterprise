// LiveEarthEngine.ts - Phase 5 Master Orchestrator Engine
// Coordinates RealtimeEventManager, LiveCameraDirector, World Pulse, Regional Scores, Counters & Notifications.

import { RealtimeEventManager, LiveEventItem, ConcertDetails, LiveStreamDetails } from './RealtimeEventManager';
import { LiveCameraDirector } from './LiveCameraDirector';
import { GlobalTimeline, GlobalTimeOption } from './GlobalTimeline';
import { PulseEffect } from './PulseRenderer';

export interface RegionalActivityScore {
  region: 'Europe' | 'North America' | 'South America' | 'Africa' | 'Asia' | 'Oceania';
  score: number; // 0 to 100
  topCity: string;
  flag: string;
}

export interface LiveCountersData {
  songsPublishedToday: number;
  activeCreators: number;
  aiGenerations: number;
  marketplaceSalesUSD: number;
  activeCollaborations: number;
  liveStreamsCount: number;
  onlineStudiosCount: number;
}

export interface WorldPulseEffect {
  id: string;
  intensity: number;
  timestamp: number;
}

export interface LiveNotification {
  id: string;
  event: LiveEventItem;
  createdAt: number;
  durationMs: number;
}

export class LiveEarthEngine {
  public eventManager: RealtimeEventManager;
  public cameraDirector: LiveCameraDirector;
  public timeline: GlobalTimeline;

  private counters: LiveCountersData = {
    songsPublishedToday: 14820,
    activeCreators: 8430,
    aiGenerations: 2890,
    marketplaceSalesUSD: 184500,
    activeCollaborations: 124,
    liveStreamsCount: 18,
    onlineStudiosCount: 42,
  };

  private regionalScores: RegionalActivityScore[] = [
    { region: 'Europe', score: 98, topCity: 'London', flag: '🇪🇺' },
    { region: 'North America', score: 94, topCity: 'Los Angeles', flag: '🇺🇸' },
    { region: 'Asia', score: 91, topCity: 'Tokyo', flag: '🇯🇵' },
    { region: 'Africa', score: 86, topCity: 'Lagos', flag: '🇳🇬' },
    { region: 'South America', score: 82, topCity: 'São Paulo', flag: '🇧🇷' },
    { region: 'Oceania', score: 78, topCity: 'Sydney', flag: '🇦🇺' },
  ];

  private activeNotifications: LiveNotification[] = [];
  private pulseListeners: Set<(pulse: WorldPulseEffect) => void> = new Set();
  private timerId: ReturnType<typeof setInterval> | null = null;
  private pulseTimerId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.eventManager = new RealtimeEventManager();
    this.cameraDirector = new LiveCameraDirector();
    this.timeline = new GlobalTimeline();

    // Wire camera director to incoming events
    this.eventManager.subscribe((event) => {
      this.handleIncomingEvent(event);
    });
  }

  public startLiveSimulation(intervalMs: number = 1000): void {
    if (this.timerId) clearInterval(this.timerId);
    if (this.pulseTimerId) clearInterval(this.pulseTimerId);

    // Main event tick every second
    this.timerId = setInterval(() => {
      const evt = this.eventManager.generateRandomEvent();
      this.updateCounters(evt);
    }, intervalMs);

    // Global Earth Pulse every 4 seconds
    this.pulseTimerId = setInterval(() => {
      this.emitWorldPulse();
    }, 4000);
  }

  public stopLiveSimulation(): void {
    if (this.timerId) clearInterval(this.timerId);
    if (this.pulseTimerId) clearInterval(this.pulseTimerId);
    this.timerId = null;
    this.pulseTimerId = null;
  }

  private handleIncomingEvent(event: LiveEventItem): void {
    // 1. Send to camera director
    this.cameraDirector.handleEvent(event);

    // 2. Add to active notifications if priority is high
    if (event.priorityScore >= 60) {
      const notif: LiveNotification = {
        id: `notif-${event.id}`,
        event,
        createdAt: Date.now(),
        durationMs: 4000,
      };
      this.activeNotifications.unshift(notif);
      if (this.activeNotifications.length > 3) {
        this.activeNotifications.pop();
      }
    }
  }

  private updateCounters(evt: LiveEventItem): void {
    switch (evt.type) {
      case 'song_published':
      case 'song_uploaded':
        this.counters.songsPublishedToday += 1;
        break;
      case 'ai_generation':
        this.counters.aiGenerations += 1;
        break;
      case 'marketplace_purchase':
        if (evt.valueUSD) this.counters.marketplaceSalesUSD += evt.valueUSD;
        break;
      case 'collaboration_started':
        this.counters.activeCollaborations += 1;
        break;
      case 'live_streaming_started':
        this.counters.liveStreamsCount += 1;
        break;
    }
  }

  public subscribeWorldPulse(cb: (pulse: WorldPulseEffect) => void): () => void {
    this.pulseListeners.add(cb);
    return () => this.pulseListeners.delete(cb);
  }

  private emitWorldPulse(): void {
    const pulse: WorldPulseEffect = {
      id: `pulse-${Date.now()}`,
      intensity: 0.85 + Math.random() * 0.15,
      timestamp: Date.now(),
    };
    this.pulseListeners.forEach((cb) => cb(pulse));
  }

  public getLiveCounters(): LiveCountersData {
    return { ...this.counters };
  }

  public getRegionalScores(): RegionalActivityScore[] {
    return [...this.regionalScores];
  }

  public getActiveNotifications(): LiveNotification[] {
    const now = Date.now();
    this.activeNotifications = this.activeNotifications.filter(
      (n) => now - n.createdAt < n.durationMs
    );
    return this.activeNotifications;
  }

  public dismissNotification(id: string): void {
    this.activeNotifications = this.activeNotifications.filter((n) => n.id !== id);
  }
}
