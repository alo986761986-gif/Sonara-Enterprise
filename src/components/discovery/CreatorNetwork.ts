// CreatorNetwork.ts - Creator Node Mechanics & Clustering Engine
// Calculates creator node sizes based on Followers, Popularity, Marketplace Score, Verified status.
// Groups nearby creators into cluster badges ("128 creators") when zoomed out.

import { EarthMarker } from './MarkerManager';

export interface CreatorCluster {
  id: string;
  lat: number;
  lng: number;
  count: number;
  label: string;
  region: string;
  creators: EarthMarker[];
}

export class CreatorNetwork {
  public calculateNodeSize(marker: EarthMarker): number {
    let size = 26; // Base size px

    // Followers contribution
    size += Math.min(14, (marker.followers / 100000) * 10);

    // Marketplace items contribution
    size += Math.min(6, marker.marketplaceItems * 0.8);

    // Verified bonus
    if (marker.verified) size += 4;

    return Math.round(size);
  }

  public computeClusters(markers: EarthMarker[], clusterDistanceLatDegree: number = 8.0): CreatorCluster[] {
    const clusters: CreatorCluster[] = [];
    const visited = new Set<string>();

    markers.forEach((m) => {
      if (visited.has(m.id)) return;

      const group: EarthMarker[] = [m];
      visited.add(m.id);

      markers.forEach((other) => {
        if (visited.has(other.id)) return;
        const dLat = Math.abs(m.latitude - other.latitude);
        const dLng = Math.abs(m.longitude - other.longitude);

        if (dLat < clusterDistanceLatDegree && dLng < clusterDistanceLatDegree) {
          group.push(other);
          visited.add(other.id);
        }
      });

      if (group.length > 1) {
        // Calculate centroid
        const avgLat = group.reduce((sum, g) => sum + g.latitude, 0) / group.length;
        const avgLng = group.reduce((sum, g) => sum + g.longitude, 0) / group.length;

        clusters.push({
          id: `cluster-${m.city.toLowerCase()}`,
          lat: avgLat,
          lng: avgLng,
          count: group.length,
          label: `${group.length} Creators`,
          region: m.country,
          creators: group,
        });
      }
    });

    return clusters;
  }
}
