import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'soft-orange' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  disabled,
  children,
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 min-h-[44px] select-none';

  // Strict Contrast Rule from Project Pack: Navy text (#0B1F4B) on Orange (#FF7A1A) buttons
  const variantClasses = {
    primary:
      'bg-brand-orange text-brand-navy hover:bg-brand-orange-hover focus:ring-brand-orange shadow-sm active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none',
    secondary:
      'bg-brand-navy text-white hover:bg-brand-navy-light focus:ring-brand-navy active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none',
    outline:
      'border-2 border-brand-navy text-brand-navy bg-transparent hover:bg-brand-grey-blue focus:ring-brand-navy disabled:opacity-40 disabled:pointer-events-none',
    ghost:
      'text-brand-navy bg-transparent hover:bg-brand-grey-blue focus:ring-slate-300 disabled:opacity-40 disabled:pointer-events-none',
    'soft-orange':
      'bg-brand-orange-tint text-brand-navy border border-brand-orange/20 hover:bg-brand-orange/20 focus:ring-brand-orange disabled:opacity-50 disabled:pointer-events-none',
    danger:
      'bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-600 shadow-sm active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none',
  };

  const sizeClasses = {
    sm: 'text-xs px-3 py-2 min-w-[36px] min-h-[44px]',
    md: 'text-sm px-4 py-2.5 min-w-[44px] min-h-[44px]',
    lg: 'text-base px-6 py-3 min-w-[48px] min-h-[48px]',
  };

  const widthClass = fullWidth ? 'w-full' : '';

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${widthClass} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};
