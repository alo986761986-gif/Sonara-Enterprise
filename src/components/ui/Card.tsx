import React from 'react';
import { Card as CoreCard, CardProps } from '../core/Card';

export const Card: React.FC<CardProps> = (props) => {
  return <CoreCard {...props} />;
};

