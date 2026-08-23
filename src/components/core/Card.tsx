import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'interactive' | 'glass' | string;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  variant = 'default',
  ...props
}) => {
  const interactive =
    variant === 'interactive'
      ? 'transition hover:-translate-y-0.5 hover:border-indigo-500/60 hover:shadow-indigo-950/30 cursor-pointer'
      : '';

  const glass =
    variant === 'glass'
      ? 'bg-slate-900/60 backdrop-blur-xl'
      : 'bg-slate-900/80';

  return (
    <div
      className={`rounded-2xl border border-slate-800 ${glass} p-5 text-slate-100 shadow-xl ${interactive} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export default Card;
