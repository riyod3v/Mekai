import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';

import { Navbar } from '@/components/Navbar';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { useTheme } from '@/hooks/useTheme';
import { FullPageLoader } from '@/components/LoadingSpinner';
import { isSupabaseConfigured } from '@/lib/supabase';
import { SetupScreen } from '@/components/SetupScreen';

import AuthPage from '@/pages/Auth';
import ReaderDashboard from '@/pages/ReaderDashboard';
import TranslatorDashboard from '@/pages/TranslatorDashboard';
import MangaEntryPage from '@/pages/MangaEntryPage';
import MangaReaderPage from '@/pages/MangaReaderPage';
import WordVaultPage from '@/pages/WordVaultPage';
import LandingPage from '@/pages/LandingPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 30,
    },
  },
});

function AppRoutes() {
  const { user, loading: authLoading } = useAuth();
  const { role, isLoading: roleLoading } = useRole();
  useTheme(); // apply + persist theme globally across all routes

  const location = useLocation();
  const isLanding = location.pathname === '/';

  if (authLoading || (user && roleLoading)) return <FullPageLoader />;

  return (
    <>
      {!isLanding && <Navbar />}
      <Routes>
        {/* Signin/Signup */}
        <Route
          path="/auth"
          element={!user ? <AuthPage /> : <Navigate to={role === 'translator' ? '/translator' : '/reader'} replace />}
        />

        {/* Default Landing  */}
        <Route
          path="/"
          element={
            user
              ? <Navigate to={role === 'translator' ? '/translator' : '/reader'} replace />
              : <LandingPage />
          }
        />

        {/* Reader routes */}
        <Route
          path="/reader"
          element={
            <ProtectedRoute requiredRole="reader">
              <ReaderDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/word-vault"
          element={
            <ProtectedRoute requiredRole="reader">
              <WordVaultPage />
            </ProtectedRoute>
          }
        />

        {/* Translator routes */}
        <Route
          path="/translator"
          element={
            <ProtectedRoute requiredRole="translator">
              <TranslatorDashboard />
            </ProtectedRoute>
          }
        />

        {/* Shared routes (any authenticated user) */}
        <Route
          path="/manga/:id"
          element={
            <ProtectedRoute>
              <MangaEntryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/read/:chapterId"
          element={
            <ProtectedRoute>
              <MangaReaderPage />
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  // Show a friendly setup screen when Supabase isn't configured yet
  if (!isSupabaseConfigured) {
    return <SetupScreen />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#1e1e2e',
              color: '#e2e8f0',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
              fontSize: '13px',
            },
            success: { iconTheme: { primary: '#6366f1', secondary: '#fff' } },
            error: { iconTheme: { primary: '#f87171', secondary: '#fff' } },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
