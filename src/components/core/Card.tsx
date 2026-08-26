import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
}

export const Card = React.forwardRef<HTMLElement, CardProps>(function Card(
  { children, className = '', ...props },
  ref
) {
  return (
    <section
      ref={ref}
      className={`rounded-2xl border border-slate-800 bg-slate-900/75 shadow-xl ${className}`}
      {...props}
    >
      {children}
    </section>
  );
});

Card.displayName = 'Card';
