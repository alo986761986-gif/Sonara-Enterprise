import React from 'react';
import { ContextEngine } from './ContextEngine';
import { PredictionEngine } from './PredictionEngine';
import { RecommendationEngine } from './RecommendationEngine';
import { MemoryEngine } from './MemoryEngine';

export const SonaraIntelligenceCore: React.FC = () => (
  <>
    <ContextEngine />
    <PredictionEngine />
    <RecommendationEngine />
    <MemoryEngine />
  </>
);
