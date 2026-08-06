// SonaraEarth.tsx - Forwarding module to new Worldwide Discovery architecture
import React from 'react';
import { WorldwideDiscovery } from '../WorldwideDiscovery';
import { EarthMarker } from './MarkerManager';

export interface SonaraEarthProps {
  onSelectCreator?: (creator: EarthMarker) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export const SonaraEarth: React.FC<SonaraEarthProps> = ({
  onSelectCreator,
}) => {
  return <WorldwideDiscovery onSelectCreator={onSelectCreator} />;
};

export default SonaraEarth;
