import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { FullPageLoader } from './LoadingSpinner';
import { isAllowedRedirectPath } from '@/lib/utils/redirectUtils';
import type { Role } from '@/types';

interface Props {
  children: React.ReactNode;
  requiredRole?: Role;
}

export function ProtectedRoute({ children, requiredRole }: Props) {
  const { user, loading: authLoading } = useAuth();
  const { role, isLoading: roleLoading } = useRole();
  const location = useLocation();

  if (authLoading || roleLoading) return <FullPageLoader />;

  if (!user) {
    // Preserve the intended destination so AuthPage can redirect back after login.
    // Only pass paths that are on the allowlist to avoid open-redirect via the URL.
    const intended = location.pathname;
    const redirectParam = isAllowedRedirectPath(intended)
      ? `?redirect=${encodeURIComponent(intended)}`
      : '';
    return <Navigate to={`/auth${redirectParam}`} replace />;
  }

  if (requiredRole && role !== requiredRole) {
    // Redirect to the user's correct dashboard
    return <Navigate to={role === 'translator' ? '/translator' : '/reader'} replace />;
  }

  return <>{children}</>;
}
