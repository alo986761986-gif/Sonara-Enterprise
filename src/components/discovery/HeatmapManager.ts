export interface HeatmapPoint {
  lat: number;
  lng: number;
  color: string;
  radius: number;
}

export const CITY_HEATMAP_POINTS: HeatmapPoint[] = [
  { lat: 51.5074, lng: -0.1278, color: '#22d3ee', radius: 0.9 },
  { lat: 35.6762, lng: 139.6503, color: '#8b5cf6', radius: 1.1 },
  { lat: 34.0522, lng: -118.2437, color: '#f472b6', radius: 1.0 },
  { lat: 40.7128, lng: -74.006, color: '#38bdf8', radius: 0.95 },
];