// RealtimeArcRenderer.ts - Converts Collaboration Graph Edges into Animated 3D Arcs
// Renders curved glowing arcs, energy streams, altitude variations, and color schemes.

import { EarthArc } from './ArcManager';
import { CollabEdge, NetworkViewMode } from './CollaborationEngine';

export class RealtimeArcRenderer {
  public convertEdgesToEarthArcs(edges: CollabEdge[], viewMode: NetworkViewMode = 'globe'): EarthArc[] {
    return edges.map((e) => {
      // Altitude adjustments: higher floating arcs in Hybrid and Network mode
      let altitude = e.altitude;
      if (viewMode === 'hybrid') altitude += 0.12;
      if (viewMode === 'network') altitude += 0.18;

      // Animate time: faster stream for pulsing / active events
      const animateTime = e.status === 'pulsing' ? 1200 : 2000;
      const stroke = e.status === 'pulsing' ? 2.4 : 1.6;

      return {
        id: e.id,
        startLat: e.sourceLat,
        startLng: e.sourceLng,
        endLat: e.targetLat,
        endLng: e.targetLng,
        color: e.color,
        altitude,
        stroke,
        dashLength: 0.42,
        dashGap: 0.12,
        dashAnimateTime: animateTime,
        label: `${e.projectTitle} (${e.sourceCity} ⇄ ${e.targetCity})`,
        type: e.type.includes('ai') ? 'ai' : e.type.includes('marketplace') ? 'trade' : 'collab',
      };
    });
  }
}
