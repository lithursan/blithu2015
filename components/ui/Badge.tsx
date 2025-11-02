
import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'default';
}

const badgeStyles = {
  default: 'bg-gradient-to-r from-slate-100 to-slate-200 text-slate-800 dark:from-slate-700 dark:to-slate-600 dark:text-slate-300 shadow-sm',
  success: 'bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-md',
  warning: 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md',
  danger: 'bg-gradient-to-r from-red-500 to-pink-600 text-white shadow-md',
  info: 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-md',
};

export const Badge: React.FC<BadgeProps & { className?: string }> = ({ children, variant = 'default', className = '' }) => {
  return (
    <span className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all duration-300 hover:scale-105 ${badgeStyles[variant]} ${className}`}>
      {children}
    </span>
  );
};