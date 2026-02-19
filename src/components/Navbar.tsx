import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, BookMarked, LogOut, Vault } from 'lucide-react';
import { useAuth, signOut } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import toast from 'react-hot-toast';

export function Navbar() {
  const { user } = useAuth();
  const { isTranslator } = useRole();
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

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign Out</span>
        </button>
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
