
import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'default';
}

const badgeStyles = {
  default: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
  success: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  danger: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
};

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'default' }) => {
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${badgeStyles[variant]}`}>
      {children}
    </span>
  );
};