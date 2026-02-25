import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { getMyProfile, updateMyProfile } from '@/services/profiles';
import type { Profile } from '@/types';
import { LoadingSpinner } from '@/ui/components/LoadingSpinner';

interface Props {
  open: boolean;
  onClose: () => void;
}

const USERNAME_RE = /^[a-zA-Z0-9_]+$/;

function validateUsername(v: string): string {
  if (!v) return 'Username is required.';
  if (v.length < 3) return 'Must be at least 3 characters.';
  if (v.length > 24) return 'Must be 24 characters or fewer.';
  if (!USERNAME_RE.test(v)) return 'Only letters, numbers, and underscores allowed.';
  return '';
}

export function ProfileSettingsModal({ open, onClose }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(false);

  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [saving, setSaving] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch profile whenever modal opens
  useEffect(() => {
    if (!open) return;
    setLoadError('');
    setLoading(true);
    getMyProfile()
      .then((p) => {
        setProfile(p);
        setUsername(p.username);
        setUsernameError('');
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load profile.');
      })
      .finally(() => setLoading(false));
  }, [open]);

  // Focus input after load
  useEffect(() => {
    if (!loading && profile && open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [loading, profile, open]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const trimmed = username.trim();
  const currentError = validateUsername(trimmed);
  const unchanged = profile ? trimmed === profile.username : true;
  const saveDisabled = !!currentError || unchanged || saving;

  async function handleSave() {
    if (saveDisabled) return;
    setSaving(true);
    try {
      const updated = await updateMyProfile({ username: trimmed });
      setProfile(updated);
      toast.success('Username updated!');
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative w-full max-w-sm rounded-xl border border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/10 dark:border-white/10">
          <h2 className="text-sm font-semibold tracking-wide">Profile Settings</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5">
          {loading && (
            <div className="flex justify-center py-6">
              <LoadingSpinner size="md" />
            </div>
          )}

          {!loading && loadError && (
            <p className="text-sm text-red-400 text-center py-4">{loadError}</p>
          )}

          {!loading && profile && (
            <div className="flex flex-col gap-4">
              {/* Username */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Username
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setUsernameError(validateUsername(e.target.value.trim()));
                  }}
                  onBlur={() => setUsernameError(validateUsername(trimmed))}
                  maxLength={24}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-colors"
                />
                {usernameError && (
                  <p className="text-xs text-red-400">{usernameError}</p>
                )}
              </div>

              {/* Role (read-only) */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Role
                </label>
                <div className="px-3 py-2.5 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm capitalize text-slate-600 dark:text-slate-400 select-none">
                  {profile.role}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && profile && (
          <div className="flex justify-end gap-2 px-5 pb-5">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saveDisabled}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-50 mekai-primary-bg"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
