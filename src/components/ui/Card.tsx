import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'white' | 'grey-blue' | 'outlined' | 'soft-orange';
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  variant = 'white',
  className = '',
  children,
  ...props
}) => {
  const base = 'rounded-2xl transition-all';
  const variants = {
    white: 'bg-white border border-slate-100 shadow-soft',
    'grey-blue': 'bg-brand-grey-blue border border-brand-grey-blue-border shadow-none',
    outlined: 'bg-white border border-slate-200 shadow-none',
    'soft-orange': 'bg-brand-orange-tint/50 border border-brand-orange/20 shadow-none',
  };

  return (
    <div className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </div>
  );
};
