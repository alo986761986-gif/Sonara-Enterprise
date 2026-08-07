import React, { useEffect, useRef } from 'react';
import { EarthScene } from './discovery/EarthScene';
import type { EarthMarker } from './discovery/MarkerManager';

export interface WorldwideDiscoveryProps {
  onSelectCreator?: (creator: EarthMarker) => void;
}

export const WorldwideDiscovery: React.FC<WorldwideDiscoveryProps> = ({
  onSelectCreator,
}) => {
  const globeContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!globeContainerRef.current) return;

    const earth = new EarthScene({
      container: globeContainerRef.current,
      onMarkerClick: marker => onSelectCreator?.(marker),
    });

    return () => {
      earth.dispose();
    };
  }, [onSelectCreator]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#02050e]">
      <div
        ref={globeContainerRef}
        className="absolute inset-0 h-full w-full"
      />
    </div>
  );
};

export default WorldwideDiscovery;
