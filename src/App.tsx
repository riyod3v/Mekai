import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationProvider } from '@/context/NotificationContext';
import { StatusBar } from '@/ui/components/StatusBar';

import { Navbar } from '@/ui/components/Navbar';
import { ProtectedRoute } from '@/ui/components/ProtectedRoute';
import { ThemeProvider } from '@/context/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { FullPageLoader } from '@/ui/components/LoadingSpinner';

import AuthPage from '@/ui/pages/AuthPage';
import ReaderDashboard from '@/ui/pages/ReaderDashboard';
import TranslatorDashboard from '@/ui/pages/TranslatorDashboard';
import MangaEntryPage from '@/ui/pages/MangaEntryPage';
import MangaReaderPage from '@/ui/pages/MangaReaderPage';
import WordVaultPage from '@/ui/pages/WordVaultPage';
import LandingPage from '@/ui/pages/LandingPage';
import SettingsPage from '@/ui/pages/ProfileSettings';

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

  const location = useLocation();
  const hideNavbar =
    location.pathname === '/' ||
    location.pathname === '/auth' ||
    location.pathname.startsWith('/read/');

  if (authLoading || (user && roleLoading)) return <FullPageLoader />;

  return (
    <>
      {!hideNavbar && (
        <Navbar />
      )}
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
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
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
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <NotificationProvider>
          <BrowserRouter>
            <AppRoutes />
            <StatusBar />
          </BrowserRouter>
        </NotificationProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
