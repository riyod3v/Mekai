import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, BookMarked, Vault } from 'lucide-react';
import { useAuth, signOut } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { useTheme } from '@/hooks/useTheme';
import { ProfileDropdown } from '@/components/ProfileDropdown';
import toast from 'react-hot-toast';

interface NavbarProps {
  onProfileSettings?: () => void;
}

export function Navbar({ onProfileSettings }: NavbarProps) {
  const { user } = useAuth();
  const { isTranslator } = useRole();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  async function handleSignOut() {
    try {
      await signOut();
      navigate('/auth');
    } catch {
      toast.error('Failed to sign out');
    }
  }

  if (!user) return null;

  return (
    <header className="sticky top-0 z-50 w-full glass border-b border-white/10 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link
          to={isTranslator ? '/translator' : '/reader'}
          className="flex items-center gap-2 font-extrabold text-xl tracking-tight text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          <BookOpen className="h-5 w-5" />
          Mekai
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
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
          >
            {isDark ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4"/>
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
              </svg>
            )}
          </button>

          {/* Profile dropdown (contains Settings + Log out) */}
          <ProfileDropdown
            onSettingsClick={onProfileSettings ?? (() => {})}
            onSignOut={handleSignOut}
          />
        </div>
      </div>
    </header>
  );
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
    >
      {children}
    </Link>
  );
}
