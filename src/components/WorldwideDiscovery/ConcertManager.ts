// ConcertManager.ts - Realtime Live Concerts & Festivals Event Manager
export interface LiveConcert {
  id: string;
  artist: string;
  venue: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  audienceCount: number;
  genre: string;
  status: 'Upcoming' | 'Live Now' | 'Ended';
}

export class ConcertManager {
  private concerts: LiveConcert[] = [
    { id: 'c-1', artist: 'Cyber-Orchestra', venue: 'Dome 21', city: 'Tokyo', country: 'Japan', lat: 35.6762, lng: 139.6503, audienceCount: 18500, genre: 'Electronic', status: 'Live Now' },
    { id: 'c-2', artist: 'AfroBeats Collective', venue: 'Eco Arena', city: 'Lagos', country: 'Nigeria', lat: 6.5244, lng: 3.3792, audienceCount: 12400, genre: 'Afrobeats', status: 'Live Now' },
  ];

  public getConcerts(): LiveConcert[] {
    return this.concerts;
  }
}

export const globalConcertManager = new ConcertManager();
