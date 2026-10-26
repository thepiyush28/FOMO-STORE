import React from 'react';

export interface BadgeProps {
  variant?: 'navy' | 'orange' | 'green' | 'red' | 'neutral' | 'placeholder';
  size?: 'sm' | 'md';
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  size = 'md',
  children,
  className = '',
}) => {
  const base = 'inline-flex items-center justify-center font-medium rounded-full select-none';

  const variants = {
    navy: 'bg-brand-navy text-white',
    orange: 'bg-brand-orange-tint text-brand-orange font-bold border border-brand-orange/30',
    green: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    red: 'bg-rose-50 text-rose-700 border border-rose-200',
    neutral: 'bg-slate-100 text-slate-700 border border-slate-200',
    placeholder: 'bg-amber-50 text-amber-900 border border-amber-300/80 font-mono text-[11px]',
  };

  const sizes = {
    sm: 'text-[11px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
  };

  return (
    <span className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </span>
  );
};
