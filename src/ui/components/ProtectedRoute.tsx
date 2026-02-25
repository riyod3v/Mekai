import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { FullPageLoader } from './LoadingSpinner';
import type { Role } from '@/types';

interface Props {
  children: React.ReactNode;
  requiredRole?: Role;
}

export function ProtectedRoute({ children, requiredRole }: Props) {
  const { user, loading: authLoading } = useAuth();
  const { role, isLoading: roleLoading } = useRole();

  if (authLoading || roleLoading) return <FullPageLoader />;

  if (!user) return <Navigate to="/auth" replace />;

  if (requiredRole && role !== requiredRole) {
    // Redirect to the user's correct dashboard
    return <Navigate to={role === 'translator' ? '/translator' : '/reader'} replace />;
  }

  return <>{children}</>;
}
