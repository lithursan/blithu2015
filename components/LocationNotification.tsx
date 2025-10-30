import React, { useState, useEffect } from 'react';

interface LocationNotificationProps {
  message: string;
  type: 'success' | 'error' | 'info';
  duration?: number;
}

export const LocationNotification: React.FC<LocationNotificationProps> = ({ 
  message, 
  type, 
  duration = 3000 
}) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration]);

  if (!isVisible) return null;

  const bgColor = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    info: 'bg-blue-500'
  }[type];

  const icon = {
    success: '✅',
    error: '❌',
    info: 'ℹ️'
  }[type];

  return (
    <div className={`fixed top-4 right-4 ${bgColor} text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-slide-in-right`}>
      <div className="flex items-center gap-2">
        <span>{icon}</span>
        <span className="text-sm font-medium">{message}</span>
      </div>
    </div>
  );
};

// Notification Manager Hook
export const useLocationNotification = () => {
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
    duration?: number;
  }>>([]);

  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info', duration?: number) => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, message, type, duration }]);
    
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, duration || 3000);
  };

  return {
    notifications,
    showNotification
  };
};