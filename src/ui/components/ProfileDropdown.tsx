import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useThemeContext } from '@/context/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { getMyProfile } from '@/services/profiles';
import type { Profile } from '@/types';

interface Props {
  onSignOut: () => void;
}

export function ProfileDropdown({ onSignOut }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useThemeContext();
  const { user } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);

  // Fetch profile once on mount (avatar lives in the profiles table, not user_metadata)
  useEffect(() => {
    getMyProfile().then(setProfile).catch(() => null);
  }, []);

  // Keep avatar/username in sync when updated from the Settings page
  useEffect(() => {
    function onProfileUpdated(e: Event) {
      const updated = (e as CustomEvent<typeof profile>).detail;
      if (updated) setProfile(updated);
    }
    window.addEventListener('profile-updated', onProfileUpdated);
    return () => window.removeEventListener('profile-updated', onProfileUpdated);
  }, []);

  const username: string = profile?.username ?? user?.user_metadata?.username ?? '';
  const avatarUrl: string | null = profile?.avatar_url ?? null;
  const email: string = profile?.email ?? user?.email ?? '';

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  function handleSettings() {
    setOpen(false);
    navigate('/settings');
  }

  function handleSignOut() {
    setOpen(false);
    onSignOut();
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Profile trigger button — avatar only */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Profile menu"
        aria-expanded={open}
        className="flex items-center px-1 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-400/60 transition-all"
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt="Avatar"
            className="h-7 w-7 rounded-full object-cover border border-black/10 dark:border-white/10"
          />
        ) : (
          <div className="h-7 w-7 rounded-full mekai-primary-bg flex items-center justify-center">
            <span className="text-xs font-semibold text-white leading-none">
              {username ? username.slice(0, 2).toUpperCase() : '?'}
            </span>
          </div>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-slate-900 shadow-lg z-[9999] overflow-hidden">

          {/* Account header */}
          <div className="px-4 py-3 flex items-center gap-3 border-b border-black/5 dark:border-white/5">
            {/* Avatar */}
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Avatar"
                className="h-9 w-9 rounded-full object-cover flex-shrink-0 border border-black/10 dark:border-white/10"
              />
            ) : (
              <div className="h-9 w-9 rounded-full mekai-primary-bg flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-semibold text-white">
                  {username ? username.slice(0, 2).toUpperCase() : '??'}
                </span>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {username || '—'}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                {email}
              </p>
            </div>
          </div>

          {/* Profile Settings */}
          <button
            onClick={handleSettings}
            className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors flex items-center gap-2.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            Profile Settings
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors flex items-center justify-between gap-2.5"
          >
            <span className="flex items-center gap-2.5">
              {isDark ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4"/>
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
                </svg>
              )}
              {isDark ? 'Light mode' : 'Dark mode'}
            </span>
          </button>

          <div className="border-t border-black/5 dark:border-white/5 my-1" />

          {/* Log out */}
          <button
            onClick={handleSignOut}
            className="w-full text-left px-4 py-2.5 text-sm text-red-500 dark:text-red-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors flex items-center gap-2.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
