import React from 'react';
import { Navigate } from 'react-router-dom';

// Page removed — redirecting to dashboard
const RemovedAccountingDashboard: React.FC = () => {
  return <Navigate to="/" replace />;
};

export default RemovedAccountingDashboard;