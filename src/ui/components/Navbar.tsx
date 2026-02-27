import { Link, useNavigate } from 'react-router-dom';
import { BookMarked, Vault, BookOpen } from 'lucide-react';
import { useAuth, signOut } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { useThemeContext } from '@/context/ThemeContext';
import { ProfileDropdown } from '@/ui/components/ProfileDropdown';
import { useNotification } from '@/context/NotificationContext';

export function Navbar() {
  const { user } = useAuth();
  const { isTranslator } = useRole();
  const { isDark } = useThemeContext();
  const navigate = useNavigate();
  const notify = useNotification();

  async function handleSignOut() {
    try {
      await signOut();
      navigate('/auth');
    } catch {
      notify.error('Failed to sign out');
    }
  }

  if (!user) return null;

  return (
    <header className="sticky top-0 z-50 w-full bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-white/10 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <img
            src={isDark ? '/IMG/branding/mekai-logo-dark.svg' : '/IMG/branding/mekai-logo-light.svg'}
            alt="Mekai"
            className="h-7 w-auto"
          />
          <span className="font-extrabold text-xl tracking-tight text-slate-900 dark:text-white">
            Mekai
          </span>
        </Link>

        {/* Nav links */}
        <nav className="hidden sm:flex items-center gap-1">
          {isTranslator ? (
            <NavLink to="/translator">
              <BookMarked className="h-4 w-4" />
              Dashboard
            </NavLink>
          ) : (
            <>
              <NavLink to="/reader">
                <BookOpen className="h-4 w-4" />
                Library
              </NavLink>
              <NavLink to="/word-vault">
                <Vault className="h-4 w-4" />
                Word Vault
              </NavLink>
            </>
          )}
        </nav>

        {/* Right side actions */}
        <div className="flex items-center gap-1">
          {/* Profile dropdown (Settings, Theme toggle, Log out) */}
          <ProfileDropdown onSignOut={handleSignOut} />
        </div>
      </div>
    </header>
  );
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
    >
      {children}
    </Link>
  );
}
