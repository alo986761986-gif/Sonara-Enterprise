export interface EarthArc {
  id: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string;
  altitude: number;
  stroke: number;
  dashLength: number;
  dashGap: number;
  dashAnimateTime: number;
  label?: string;
  type?: 'ai' | 'trade' | 'collab';
}

export const INITIAL_GLOBAL_ARCS: EarthArc[] = [
  {
    id: 'arc-london-berlin',
    startLat: 51.5074,
    startLng: -0.1278,
    endLat: 52.52,
    endLng: 13.405,
    color: '#38bdf8',
    altitude: 0.22,
    stroke: 1.8,
    dashLength: 0.45,
    dashGap: 0.16,
    dashAnimateTime: 1800,
    label: 'London -> Berlin',
    type: 'collab',
  },
  {
    id: 'arc-tokyo-la',
    startLat: 35.6762,
    startLng: 139.6503,
    endLat: 34.0522,
    endLng: -118.2437,
    color: '#8b5cf6',
    altitude: 0.28,
    stroke: 2,
    dashLength: 0.5,
    dashGap: 0.12,
    dashAnimateTime: 2000,
    label: 'Tokyo -> Los Angeles',
    type: 'ai',
  },
  {
    id: 'arc-paris-ny',
    startLat: 48.8566,
    startLng: 2.3522,
    endLat: 40.7128,
    endLng: -74.006,
    color: '#f472b6',
    altitude: 0.2,
    stroke: 1.6,
    dashLength: 0.4,
    dashGap: 0.14,
    dashAnimateTime: 1700,
    label: 'Paris -> New York',
    type: 'trade',
  },
];