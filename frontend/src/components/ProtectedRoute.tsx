import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { User } from '../types';

interface Props {
  children: ReactNode;
  adminOnly?: boolean;
  agentOnly?: boolean;
  allowAgent?: boolean;
}

export default function ProtectedRoute({ children, adminOnly = false, agentOnly = false, allowAgent = false }: Props) {
  const token = sessionStorage.getItem('token');
  const userStr = sessionStorage.getItem('user');

  if (!token || !userStr) {
    return <Navigate to="/login" replace />;
  }

  const user: User = JSON.parse(userStr);

  if (adminOnly && user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  if (agentOnly && user.role !== 'agent') {
    return <Navigate to="/dashboard" replace />;
  }

  // Redirect agents away from pure-applicant routes (dashboard)
  // unless the route explicitly allows agents (apply, applicationStatus, profile)
  if (!adminOnly && !agentOnly && !allowAgent && user.role === 'agent') {
    return <Navigate to="/agent" replace />;
  }

  return <>{children}</>;
}
