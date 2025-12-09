import React from 'react';
import { Navigate } from 'react-router-dom';

// Chart of Accounts removed — redirect to dashboard
const RemovedChartOfAccounts: React.FC = () => {
  return <Navigate to="/" replace />;
};

export default RemovedChartOfAccounts;