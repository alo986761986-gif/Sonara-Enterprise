// RealtimeMusicFeed.ts - Live stream generator and dispatcher for global music activity events.

import { MusicEvent, HeatEventType, MusicHeatmapEngine } from './MusicHeatmapEngine';
import { PulseRenderer, PulseEffect } from './PulseRenderer';
import { ActivityAggregator } from './ActivityAggregator';

export type EventListener = (event: MusicEvent, pulses: PulseEffect[]) => void;

export const HOTSPOT_CITIES = [
  { city: 'London', country: 'United Kingdom', lat: 51.5074, lng: -0.1278 },
  { city: 'Berlin', country: 'Germany', lat: 52.52, lng: 13.405 },
  { city: 'Rome', country: 'Italy', lat: 41.9028, lng: 12.4964 },
  { city: 'Barcelona', country: 'Spain', lat: 41.3851, lng: 2.1734 },
  { city: 'Paris', country: 'France', lat: 48.8566, lng: 2.3522 },
  { city: 'Tokyo', country: 'Japan', lat: 35.6762, lng: 139.6503 },
  { city: 'Los Angeles', country: 'United States', lat: 34.0522, lng: -118.2437 },
  { city: 'New York', country: 'United States', lat: 40.7128, lng: -74.006 },
  { city: 'Seoul', country: 'South Korea', lat: 37.5665, lng: 126.978 },
  { city: 'São Paulo', country: 'Brazil', lat: -23.5505, lng: -46.6333 },
  { city: 'Lagos', country: 'Nigeria', lat: 6.5244, lng: 3.3792 },
  { city: 'Sydney', country: 'Australia', lat: -33.8688, lng: 151.2093 },
];

export const SAMPLE_TITLES = [
  'Cyberpunk Synthwave Vocal Stem',
  'Shibuya AI Neural Synth Pack',
  'Afrobeats Rhythm Loop v4',
  'Lo-Fi Underground Jam Session',
  'Hollywood Orchestral Brass Section',
  'Deep House Bassline Stem #82',
  'Berlin Techno Modular Session',
  'Paris Jazz Piano Master Track',
  'K-Pop Vocal Harmonizer Preset',
  'Latin Drill Percussion Pack',
];

export class RealtimeMusicFeed {
  private engine: MusicHeatmapEngine;
  private pulseRenderer: PulseRenderer;
  private aggregator: ActivityAggregator;

  private listeners: Set<EventListener> = new Set();
  private timerId: any = null;
  private isRunning = false;

  constructor(
    engine: MusicHeatmapEngine,
    pulseRenderer: PulseRenderer,
    aggregator: ActivityAggregator
  ) {
    this.engine = engine;
    this.pulseRenderer = pulseRenderer;
    this.aggregator = aggregator;

    this.seedInitialEvents();
  }

  private seedInitialEvents(): void {
    const now = Date.now();
    for (let i = 0; i < 20; i++) {
      const src = HOTSPOT_CITIES[i % HOTSPOT_CITIES.length];
      const types: HeatEventType[] = [
        'song_published',
        'new_collaboration',
        'marketplace_sale',
        'ai_generation',
        'live_session',
      ];
      const type = types[i % types.length];
      const target = HOTSPOT_CITIES[(i + 4) % HOTSPOT_CITIES.length];

      const event: MusicEvent = {
        id: `seed-${i}-${now}`,
        type,
        city: src.city,
        country: src.country,
        lat: src.lat,
        lng: src.lng,
        targetLat: target.lat,
        targetLng: target.lng,
        targetCity: target.city,
        creatorName: `@creator_${i + 1}`,
        timestamp: now - i * 15000,
        weight: 5,
        title: SAMPLE_TITLES[i % SAMPLE_TITLES.length],
      };

      this.engine.registerEvent(event);
    }
  }

  public startSimulation(intervalMs: number = 3500): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.timerId = setInterval(() => {
      this.generateRandomEvent();
      this.engine.applyDecay();
    }, intervalMs);
  }

  public stopSimulation(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.isRunning = false;
  }

  public generateRandomEvent(): MusicEvent {
    const srcIndex = Math.floor(Math.random() * HOTSPOT_CITIES.length);
    let targetIndex = Math.floor(Math.random() * HOTSPOT_CITIES.length);
    while (targetIndex === srcIndex) {
      targetIndex = Math.floor(Math.random() * HOTSPOT_CITIES.length);
    }

    const src = HOTSPOT_CITIES[srcIndex];
    const target = HOTSPOT_CITIES[targetIndex];

    const types: HeatEventType[] = [
      'song_created',
      'song_published',
      'new_collaboration',
      'marketplace_sale',
      'live_session',
      'ai_generation',
      'listener_activity',
    ];
    const type = types[Math.floor(Math.random() * types.length)];

    const event: MusicEvent = {
      id: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type,
      city: src.city,
      country: src.country,
      lat: src.lat,
      lng: src.lng,
      targetLat: target.lat,
      targetLng: target.lng,
      targetCity: target.city,
      creatorName: `@artist_${src.city.toLowerCase().replace(/\s+/g, '')}`,
      timestamp: Date.now(),
      weight: 5,
      title: SAMPLE_TITLES[Math.floor(Math.random() * SAMPLE_TITLES.length)],
    };

    this.emitEvent(event);
    return event;
  }

  public publishUserEvent(eventData: Omit<MusicEvent, 'id' | 'timestamp'>): MusicEvent {
    const event: MusicEvent = {
      ...eventData,
      id: `user-evt-${Date.now()}`,
      timestamp: Date.now(),
    };

    this.emitEvent(event);
    return event;
  }

  private emitEvent(event: MusicEvent): void {
    this.engine.registerEvent(event);
    const pulses = this.pulseRenderer.triggerEventPulse(event);

    this.listeners.forEach((fn) => {
      try {
        fn(event, pulses);
      } catch (err) {
        console.error('Error in RealtimeMusicFeed listener:', err);
      }
    });
  }

  public subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
