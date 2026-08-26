import React from 'react';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
};

export function Button({ className = '', variant = 'primary', size = 'md', type = 'button', ...props }: Props) {
  const variants = {
    primary: 'bg-purple-600 text-white hover:bg-purple-500 border-purple-500/40',
    secondary: 'bg-slate-900 text-slate-200 hover:bg-slate-800 border-slate-700',
    ghost: 'bg-transparent text-slate-300 hover:bg-white/5 border-slate-800'
  };
  const sizes = {
    sm: 'px-3 py-2 text-xs',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-5 py-3 text-sm'
  };
  return <button type={type} className={`inline-flex items-center justify-center rounded-xl border font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`} {...props} />;
}
