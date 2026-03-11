import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookMarked, Vault, BookOpen, Menu, X } from 'lucide-react';
import { useAuth, signOut } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { useThemeContext } from '@/context/ThemeContext';
import { ProfileDropdown } from '@/ui/components/ProfileDropdown';
import { useNotification } from '@/context/NotificationContext';
import logoDark from '@/assets/IMG/branding/mekai-logo-dark.svg';
import logoLight from '@/assets/IMG/branding/mekai-logo-light.svg';

export function Navbar() {
  const { user } = useAuth();
  const { isTranslator } = useRole();
  const { isDark } = useThemeContext();
  const navigate = useNavigate();
  const notify = useNotification();
  const [mobileOpen, setMobileOpen] = useState(false);

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
        <Link to="/" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
          <img
            src={isDark ? logoDark : logoLight}
            alt="Mekai"
            className="h-7 w-auto"
          />
          <span className="font-extrabold text-xl tracking-tight text-slate-900 dark:text-white">
            Mekai
          </span>
        </Link>

        {/* Desktop nav links */}
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

          {/* Mobile hamburger */}
          <button
            className="sm:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile nav menu */}
      {mobileOpen && (
        <div className="sm:hidden border-t border-slate-200 dark:border-white/10 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md px-4 py-2 flex flex-col gap-1">
          {isTranslator ? (
            <MobileNavLink to="/translator" onClick={() => setMobileOpen(false)}>
              <BookMarked className="h-4 w-4" />
              Dashboard
            </MobileNavLink>
          ) : (
            <>
              <MobileNavLink to="/reader" onClick={() => setMobileOpen(false)}>
                <BookOpen className="h-4 w-4" />
                Library
              </MobileNavLink>
              <MobileNavLink to="/word-vault" onClick={() => setMobileOpen(false)}>
                <Vault className="h-4 w-4" />
                Word Vault
              </MobileNavLink>
            </>
          )}
        </div>
      )}
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

function MobileNavLink({ to, onClick, children }: { to: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
    >
      {children}
    </Link>
  );
}
