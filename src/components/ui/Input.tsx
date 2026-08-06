import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input: React.FC<InputProps> = ({ className, ...props }) => {
  return (
    <input 
      className={`w-full min-h-[48px] px-4 sm:px-5 border border-white/10 rounded-2xl bg-white/[0.04] text-slate-100 text-sm sm:text-base placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/80 transition-all shadow-inner ${className || ''}`} 
      {...props} 
    />
  );
};
