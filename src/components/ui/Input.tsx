import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  endIcon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  icon,
  endIcon,
  className = '',
  ...props
}) => {
  return (
    <div className="relative flex items-center w-full">
      {icon && (
        <div className="absolute left-3.5 text-slate-400 pointer-events-none flex items-center justify-center">
          {icon}
        </div>
      )}
      <input
        className={`w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl text-brand-navy placeholder:text-slate-400 text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-navy/20 focus:border-brand-navy transition-all ${
          icon ? 'pl-10' : 'pl-4'
        } ${endIcon ? 'pr-10' : 'pr-4'} ${className}`}
        {...props}
      />
      {endIcon && (
        <div className="absolute right-3.5 flex items-center justify-center">
          {endIcon}
        </div>
      )}
    </div>
  );
};
