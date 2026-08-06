// MarkerManager.ts - Manages Creators, Studios, City Hotspot Clusters & Global Music Network Database

export type GenreType = 'Pop' | 'Rock' | 'EDM' | 'Hip Hop' | 'Trap' | 'Jazz' | 'Classical' | 'Lo-Fi' | 'AI';

export type CreatorType = 'Artist' | 'Producer' | 'DJ' | 'Studio' | 'Label' | 'AI Creator' | 'Marketplace Seller';

export type LiveStatus = 'Online' | 'Recording' | 'Mixing' | 'Publishing' | 'Collaborating' | 'Streaming' | 'Marketplace';

export const GENRE_COLORS: Record<GenreType, string> = {
  Pop: '#ec4899',       // Pink
  Rock: '#ef4444',      // Red
  EDM: '#3b82f6',       // Blue
  'Hip Hop': '#f97316', // Orange
  Trap: '#a855f7',      // Purple
  Jazz: '#eab308',      // Gold
  Classical: '#ffffff', // White
  'Lo-Fi': '#06b6d4',    // Cyan
  AI: '#8b5cf6'         // Electric Violet
};

export const CREATOR_TYPE_ICONS: Record<CreatorType, string> = {
  Artist: '🎙️',
  Producer: '🎛️',
  DJ: '🎧',
  Studio: '🎙️',
  Label: '🏢',
  'AI Creator': '🤖',
  'Marketplace Seller': '💎'
};

export interface EarthMarker {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  country: string;
  city: string;
  latitude: number;
  longitude: number;
  genre: GenreType;
  followers: number;
  listeners: number;
  verified: boolean;
  online: boolean;
  currentProject: string;
  studio: string;
  marketplaceItems: number;
  creatorType: CreatorType;
  liveStatus: LiveStatus;
  flag: string;
}

export interface CityHub {
  id: string;
  name: string;
  country: string;
  flag: string;
  latitude: number;
  longitude: number;
  creatorCount: number;
  topGenres: GenreType[];
  studiosCount: number;
  marketplaceActivity: string;
  liveCollabsCount: number;
  trendingSong: string;
}

export const CITY_HUBS: CityHub[] = [
  { id: 'city-london', name: 'London', country: 'United Kingdom', flag: '🇬🇧', latitude: 51.5074, longitude: -0.1278, creatorCount: 1240, topGenres: ['Pop', 'Lo-Fi', 'EDM'], studiosCount: 84, marketplaceActivity: '$24,500/day', liveCollabsCount: 142, trendingSong: 'Abbey Road Neural Stems' },
  { id: 'city-berlin', name: 'Berlin', country: 'Germany', flag: '🇩🇪', latitude: 52.5200, longitude: 13.4050, creatorCount: 980, topGenres: ['EDM', 'Trap', 'AI'], studiosCount: 62, marketplaceActivity: '$19,200/day', liveCollabsCount: 118, trendingSong: 'Kreuzberg Modular Pulse' },
  { id: 'city-rome', name: 'Rome', country: 'Italy', flag: '🇮🇹', latitude: 41.9028, longitude: 12.4964, creatorCount: 450, topGenres: ['Classical', 'Pop', 'Lo-Fi'], studiosCount: 31, marketplaceActivity: '$8,400/day', liveCollabsCount: 45, trendingSong: 'Colosseum String Quartet AI' },
  { id: 'city-barcelona', name: 'Barcelona', country: 'Spain', flag: '🇪🇸', latitude: 41.3851, longitude: 2.1734, creatorCount: 620, topGenres: ['EDM', 'Pop', 'Hip Hop'], studiosCount: 41, marketplaceActivity: '$12,800/day', liveCollabsCount: 67, trendingSong: 'Sol de Bcn Afro Percussion' },
  { id: 'city-tokyo', name: 'Tokyo', country: 'Japan', flag: '🇯🇵', latitude: 35.6762, longitude: 139.6503, creatorCount: 1850, topGenres: ['AI', 'EDM', 'Pop'], studiosCount: 112, marketplaceActivity: '$38,900/day', liveCollabsCount: 210, trendingSong: 'Shibuya Cyber Grid 2088' },
  { id: 'city-la', name: 'Los Angeles', country: 'United States', flag: '🇺🇸', latitude: 34.0522, longitude: -118.2437, creatorCount: 2410, topGenres: ['Hip Hop', 'Trap', 'Pop'], studiosCount: 195, marketplaceActivity: '$62,000/day', liveCollabsCount: 380, trendingSong: 'Sunset Sub Engine VST' },
  { id: 'city-ny', name: 'New York', country: 'United States', flag: '🇺🇸', latitude: 40.7128, longitude: -74.0060, creatorCount: 2100, topGenres: ['Hip Hop', 'Jazz', 'Lo-Fi'], studiosCount: 160, marketplaceActivity: '$54,300/day', liveCollabsCount: 310, trendingSong: 'Brooklyn Vinyl Drums Vol. 3' },
  { id: 'city-seoul', name: 'Seoul', country: 'South Korea', flag: '🇰🇷', latitude: 37.5665, longitude: 126.9780, creatorCount: 1620, topGenres: ['Pop', 'AI', 'Trap'], studiosCount: 98, marketplaceActivity: '$31,400/day', liveCollabsCount: 195, trendingSong: 'Neon Gangnam Vocal Layering' },
  { id: 'city-saopaulo', name: 'São Paulo', country: 'Brazil', flag: '🇧🇷', latitude: -23.5505, longitude: -46.6333, creatorCount: 890, topGenres: ['Hip Hop', 'Pop', 'EDM'], studiosCount: 54, marketplaceActivity: '$14,100/day', liveCollabsCount: 88, trendingSong: 'Favela Bass Bounce 130BPM' },
  { id: 'city-paris', name: 'Paris', country: 'France', flag: '🇫🇷', latitude: 48.8566, longitude: 2.3522, creatorCount: 1150, topGenres: ['Lo-Fi', 'Pop', 'Classical'], studiosCount: 78, marketplaceActivity: '$21,700/day', liveCollabsCount: 132, trendingSong: 'Lumière de Nuit (Vocal Stems)' },
  { id: 'city-lagos', name: 'Lagos', country: 'Nigeria', flag: '🇳🇬', latitude: 6.5244, longitude: 3.3792, creatorCount: 1040, topGenres: ['Pop', 'Hip Hop', 'EDM'], studiosCount: 65, marketplaceActivity: '$18,600/day', liveCollabsCount: 156, trendingSong: 'Lagos Midnight Log Drum' }
];

export const GLOBAL_MARKERS: EarthMarker[] = [
  {
    id: 'creator-london-1',
    username: 'aria_vocals',
    displayName: 'Aria Sterling',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
    country: 'United Kingdom',
    city: 'London',
    latitude: 51.5074,
    longitude: -0.1278,
    genre: 'Pop',
    followers: 148500,
    listeners: 392000,
    verified: true,
    online: true,
    currentProject: 'Midnight Reverie Vocal Pack',
    studio: 'Abbey Road Studio B',
    marketplaceItems: 14,
    creatorType: 'Artist',
    liveStatus: 'Recording',
    flag: '🇬🇧'
  },
  {
    id: 'creator-berlin-1',
    username: 'elena_strings',
    displayName: 'Elena Rostova',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=300&q=80',
    country: 'Germany',
    city: 'Berlin',
    latitude: 52.5200,
    longitude: 13.4050,
    genre: 'EDM',
    followers: 210000,
    listeners: 580000,
    verified: true,
    online: true,
    currentProject: 'Kreuzberg Modular Pulse',
    studio: 'Funkhaus Audio Lab',
    marketplaceItems: 22,
    creatorType: 'Producer',
    liveStatus: 'Mixing',
    flag: '🇩🇪'
  },
  {
    id: 'creator-tokyo-1',
    username: 'kenji_tokyo',
    displayName: 'Kenji Takahashi',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
    country: 'Japan',
    city: 'Tokyo',
    latitude: 35.6762,
    longitude: 139.6503,
    genre: 'AI',
    followers: 320000,
    listeners: 890000,
    verified: true,
    online: true,
    currentProject: 'Shibuya Neural Synth V2',
    studio: 'CyberGrid Soundworks',
    marketplaceItems: 45,
    creatorType: 'AI Creator',
    liveStatus: 'Publishing',
    flag: '🇯🇵'
  },
  {
    id: 'creator-la-1',
    username: 'marcus_bass',
    displayName: 'Marcus Vance',
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=300&q=80',
    country: 'United States',
    city: 'Los Angeles',
    latitude: 34.0522,
    longitude: -118.2437,
    genre: 'Trap',
    followers: 540000,
    listeners: 1420000,
    verified: true,
    online: true,
    currentProject: 'Hollywood Sub Engine VST',
    studio: 'Westlake Recording Studio',
    marketplaceItems: 38,
    creatorType: 'Producer',
    liveStatus: 'Collaborating',
    flag: '🇺🇸'
  },
  {
    id: 'creator-ny-1',
    username: 'dame_beats',
    displayName: 'Damian Cole',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=300&q=80',
    country: 'United States',
    city: 'New York',
    latitude: 40.7128,
    longitude: -74.0060,
    genre: 'Hip Hop',
    followers: 410000,
    listeners: 980000,
    verified: true,
    online: true,
    currentProject: 'Brooklyn Vinyl Drums Vol. 3',
    studio: 'Electric Lady Annex',
    marketplaceItems: 19,
    creatorType: 'DJ',
    liveStatus: 'Streaming',
    flag: '🇺🇸'
  },
  {
    id: 'creator-paris-1',
    username: 'chloe_french',
    displayName: 'Chloe Dubois',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=300&q=80',
    country: 'France',
    city: 'Paris',
    latitude: 48.8566,
    longitude: 2.3522,
    genre: 'Lo-Fi',
    followers: 95000,
    listeners: 240000,
    verified: false,
    online: true,
    currentProject: 'Lumière de Nuit Chill Ambient',
    studio: 'Montmartre Home Studio',
    marketplaceItems: 8,
    creatorType: 'Artist',
    liveStatus: 'Recording',
    flag: '🇫🇷'
  },
  {
    id: 'creator-saopaulo-1',
    username: 'thiago_funk',
    displayName: 'Thiago Silva',
    avatar: 'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?auto=format&fit=crop&w=300&q=80',
    country: 'Brazil',
    city: 'São Paulo',
    latitude: -23.5505,
    longitude: -46.6333,
    genre: 'Pop',
    followers: 180000,
    listeners: 450000,
    verified: true,
    online: true,
    currentProject: 'Favela Bass Bounce 130BPM',
    studio: 'Paulista Sound Lab',
    marketplaceItems: 16,
    creatorType: 'Marketplace Seller',
    liveStatus: 'Marketplace',
    flag: '🇧🇷'
  },
  {
    id: 'creator-lagos-1',
    username: 'kofi_afrobeats',
    displayName: 'Kofi Mensah',
    avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=300&q=80',
    country: 'Nigeria',
    city: 'Lagos',
    latitude: 6.5244,
    longitude: 3.3792,
    genre: 'Pop',
    followers: 290000,
    listeners: 810000,
    verified: true,
    online: true,
    currentProject: 'Lagos Midnight Log Drum',
    studio: 'VGC Afro Soundstage',
    marketplaceItems: 27,
    creatorType: 'Artist',
    liveStatus: 'Collaborating',
    flag: '🇳🇬'
  },
  {
    id: 'creator-seoul-1',
    username: 'nia_kpop',
    displayName: 'Nia Kim',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=300&q=80',
    country: 'South Korea',
    city: 'Seoul',
    latitude: 37.5665,
    longitude: 126.9780,
    genre: 'Pop',
    followers: 680000,
    listeners: 2100000,
    verified: true,
    online: true,
    currentProject: 'Neon Gangnam Vocal Layering',
    studio: 'Gangnam Sound Factory',
    marketplaceItems: 31,
    creatorType: 'Artist',
    liveStatus: 'Publishing',
    flag: '🇰🇷'
  },
  {
    id: 'creator-barcelona-1',
    username: 'mateo_beats',
    displayName: 'Mateo Rossi',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80',
    country: 'Spain',
    city: 'Barcelona',
    latitude: 41.3851,
    longitude: 2.1734,
    genre: 'EDM',
    followers: 125000,
    listeners: 310000,
    verified: true,
    online: true,
    currentProject: 'Sol de Bcn Afro Percussion',
    studio: 'Gothic Quarter Audio',
    marketplaceItems: 11,
    creatorType: 'Producer',
    liveStatus: 'Mixing',
    flag: '🇪🇸'
  },
  {
    id: 'creator-rome-1',
    username: 'marco_strings',
    displayName: 'Marco Moretti',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=300&q=80',
    country: 'Italy',
    city: 'Rome',
    latitude: 41.9028,
    longitude: 12.4964,
    genre: 'Classical',
    followers: 89000,
    listeners: 195000,
    verified: true,
    online: false,
    currentProject: 'Neoclassical Cello Ensemble',
    studio: 'Accademia Santa Cecilia',
    marketplaceItems: 6,
    creatorType: 'Artist',
    liveStatus: 'Online',
    flag: '🇮🇹'
  }
];

export class MarkerManager {
  private markers: Map<string, EarthMarker> = new Map();

  constructor(initialMarkers: EarthMarker[] = GLOBAL_MARKERS) {
    initialMarkers.forEach((m) => this.markers.set(m.id, m));
  }

  public getMarkers(): EarthMarker[] {
    return Array.from(this.markers.values());
  }

  public findByCity(cityName: string): EarthMarker | undefined {
    return Array.from(this.markers.values()).find(
      (m) => m.city.toLowerCase() === cityName.toLowerCase()
    );
  }
}

