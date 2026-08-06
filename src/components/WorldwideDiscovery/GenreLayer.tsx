// GenreLayer.tsx - Genre Distribution & Filter Layer
import React from 'react';

export const GENRE_LIST = [
  'Electronic', 'Pop', 'Hip Hop', 'Rock', 'Jazz', 'Classical', 'Ambient',
  'LoFi', 'House', 'Techno', 'Trap', 'Afrobeats', 'Latin', 'K-Pop', 'J-Pop', 'Reggaeton'
] as const;

export type GenreType = typeof GENRE_LIST[number];

export interface GenreLayerProps {
  selectedGenre?: string;
  onGenreChange?: (genre: string) => void;
}

export const GenreLayer: React.FC<GenreLayerProps> = ({
  selectedGenre = 'All',
}) => {
  return null; // Logic container for active genre filter state applied to Globe engine
};

export default GenreLayer;
