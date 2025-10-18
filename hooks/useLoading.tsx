import React, { useState, useCallback } from 'react';

interface LoadingState {
  [key: string]: boolean;
}

export const useLoading = () => {
  const [loadingStates, setLoadingStates] = useState<LoadingState>({});

  const setLoading = useCallback((key: string, isLoading: boolean) => {
    setLoadingStates(prev => ({
      ...prev,
      [key]: isLoading
    }));
  }, []);

  const isLoading = useCallback((key: string) => {
    return loadingStates[key] || false;
  }, [loadingStates]);

  const isAnyLoading = useCallback(() => {
    return Object.values(loadingStates).some(loading => loading);
  }, [loadingStates]);

  return {
    setLoading,
    isLoading,
    isAnyLoading,
    loadingStates
  };
};

// Loading Spinner Component
interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 'md', 
  className = '' 
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  return (
    <div className={`inline-block animate-spin rounded-full border-2 border-solid border-current border-r-transparent ${sizeClasses[size]} ${className}`}>
      <span className="sr-only">Loading...</span>
    </div>
  );
};

// Loading Button Component
interface LoadingButtonProps {
  isLoading: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  className?: string;
  disabled?: boolean;
}

export const LoadingButton: React.FC<LoadingButtonProps> = ({
  isLoading,
  children,
  onClick,
  type = 'button',
  className = '',
  disabled = false
}) => {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isLoading || disabled}
      className={`flex items-center justify-center gap-2 ${className} ${
        isLoading || disabled ? 'opacity-50 cursor-not-allowed' : ''
      }`}
    >
      {isLoading && <LoadingSpinner size="sm" />}
      {children}
    </button>
  );
};