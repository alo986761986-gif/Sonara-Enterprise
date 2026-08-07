import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'standard' | 'premium' | 'interactive';
}

export const Card: React.FC<CardProps> = ({
  variant = 'standard',
  className = '',
  children,
  ...props
}) => {
  const variantClass =
    variant === 'premium'
      ? 'bg-slate-900/90 border border-slate-700 shadow-xl'
      : variant === 'interactive'
        ? 'bg-slate-900/70 border border-slate-800 hover:border-indigo-500/40 hover:shadow-lg transition-all cursor-pointer'
        : 'bg-slate-900/70 border border-slate-800';

  return (
    <div className={`${variantClass} rounded-2xl ${className}`.trim()} {...props}>
      {children}
    </div>
  );
};

export default Card;
