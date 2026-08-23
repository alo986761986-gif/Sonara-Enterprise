import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | string;
  size?: 'sm' | 'md' | 'lg' | string;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  type = 'button',
  ...props
}) => {
  const variants: Record<string, string> = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-500 border-indigo-500',
    secondary: 'bg-slate-800 text-slate-100 hover:bg-slate-700 border-slate-700',
    outline: 'bg-transparent text-slate-200 hover:bg-slate-800 border-slate-700',
    ghost: 'bg-transparent text-slate-300 hover:bg-slate-800 border-transparent',
    danger: 'bg-rose-600 text-white hover:bg-rose-500 border-rose-500'
  };

  const sizes: Record<string, string> = {
    sm: 'px-3 py-2 text-xs',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-5 py-3 text-base'
  };

  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
