// MarketplaceLayer.tsx - Marketplace Stems & Pack Sellers Node Layer
import React from 'react';
import { EarthMarker, GLOBAL_MARKERS } from '../discovery/MarkerManager';

export interface MarketplaceLayerProps {
  items?: EarthMarker[];
  enabled?: boolean;
}

export const MarketplaceLayer: React.FC<MarketplaceLayerProps> = ({
  items = GLOBAL_MARKERS,
  enabled = true,
}) => {
  const activeSellers = React.useMemo(() => {
    if (!enabled) return [];
    return items.filter((m) => m.creatorType === 'Marketplace Seller' || (m.marketplaceItems && m.marketplaceItems > 0));
  }, [items, enabled]);

  return null; // Geographic rendering in Cesium WebGL
};

export default MarketplaceLayer;
