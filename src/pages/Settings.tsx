import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { getMyProfile, updateMyProfile } from '@/services/profiles';
import type { Profile } from '@/types';

// ─── helpers ────────────────────────────────────────────────

const USERNAME_RE = /^[a-zA-Z0-9_]+$/;

function validateUsername(v: string): string {
  if (v.length < 3) return 'At least 3 characters required.';
  if (v.length > 24) return 'Maximum 24 characters.';
  if (!USERNAME_RE.test(v)) return 'Only letters, numbers, and underscores.';
  return '';
}

interface PwIssue { label: string; ok: boolean }
function getPwIssues(pw: string): PwIssue[] {
  return [
    { label: 'At least 8 characters', ok: pw.length >= 8 },
    { label: 'Uppercase letter', ok: /[A-Z]/.test(pw) },
    { label: 'Number', ok: /[0-9]/.test(pw) },
    { label: 'Special character (!@#$…)', ok: /[^A-Za-z0-9]/.test(pw) },
  ];
}

// ─── Eye-toggle input ────────────────────────────────────────

function PasswordInput({
  id,
  label,
  value,
  onChange,
  error,
  autoComplete,
  show: showProp,
  onToggleShow,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  autoComplete?: string;
  show?: boolean;
  onToggleShow?: () => void;
}) {
  const [internalShow, setInternalShow] = useState(false);
  const show = showProp !== undefined ? showProp : internalShow;
  const toggle = onToggleShow ?? (() => setInternalShow((s) => !s));
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className={`w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 ${onToggleShow !== undefined || showProp === undefined ? 'pr-10' : 'pr-3'} focus:outline-none focus:ring-2 transition-colors ${
            error
              ? 'border-red-400 dark:border-red-500 focus:ring-red-400/30'
              : 'border-slate-300 dark:border-slate-600 focus:ring-indigo-400/30 focus:border-indigo-400 dark:focus:border-indigo-500'
          }`}
        />
        {(onToggleShow !== undefined || showProp === undefined) && (
        <button
          type="button"
          onClick={toggle}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? (
            /* eye-off */
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          ) : (
            /* eye */
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          )}
        </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{error}</p>}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────

export default function SettingsPage() {
  const navigate = useNavigate();

  // ── Profile ─────────────────────────────────────────────
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  useEffect(() => {
    getMyProfile()
      .then((p) => {
        setProfile(p);
        setUsername(p.username ?? '');
      })
      .catch(() => toast.error('Could not load profile.'))
      .finally(() => setProfileLoading(false));
  }, []);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    const err = validateUsername(username);
    if (err) { setUsernameError(err); return; }
    setUsernameError('');
    setSavingProfile(true);
    try {
      const updated = await updateMyProfile({ username });
      setProfile(updated);
      toast.success('Username updated!');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSavingProfile(false);
    }
  }

  // ── Avatar upload ─────────────────────────────────────────
  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Image must be under 2 MB.'); return; }
    setAvatarUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated.');
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${user.id}/avatar.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true });
      if (uploadErr) throw new Error(uploadErr.message);
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      const updated = await updateMyProfile({ avatar_url: publicUrl });
      setProfile(updated);
      toast.success('Avatar updated!');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  }

  async function handleRemoveAvatar() {
    setAvatarUploading(true);
    try {
      const updated = await updateMyProfile({ avatar_url: null });
      setProfile(updated);
      toast.success('Avatar removed.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove avatar.');
    } finally {
      setAvatarUploading(false);
    }
  }

  // ── Change Password ──────────────────────────────────────
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw]         = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);

  const [pwErrors, setPwErrors] = useState({ current: '', new: '', confirm: '' });
  const [savingPw, setSavingPw]  = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (savingPw) return;

    const issues = getPwIssues(newPw);
    const errors = {
      current: currentPw.trim() === '' ? 'Enter your current password.' : '',
      new: issues.some((i) => !i.ok) ? 'Password does not meet all requirements.' : '',
      confirm: newPw !== confirmPw ? 'Passwords do not match.' : '',
    };
    setPwErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    setSavingPw(true);
    try {
      // Re-authenticate with current password
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('No email on account.');

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPw,
      });
      if (signInErr) {
        setPwErrors((prev) => ({ ...prev, current: 'Current password is incorrect.' }));
        return;
      }

      // Update to new password
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPw });
      if (updateErr) throw new Error(updateErr.message);

      toast.success('Password changed successfully!');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setPwErrors({ current: '', new: '', confirm: '' });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to change password.');
    } finally {
      setSavingPw(false);
    }
  }

  // ── Render ───────────────────────────────────────────────

  const newPwIssues = getPwIssues(newPw);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            aria-label="Go back"
            className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold leading-tight">Profile Settings</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Manage your profile and account security</p>
          </div>
        </div>

        {/* ── Profile section ── */}
        <section className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-slate-900 divide-y divide-black/5 dark:divide-white/5 shadow-sm">
          <div className="px-6 py-4">
            <h2 className="text-base font-semibold">Profile</h2>
          </div>

          {profileLoading ? (
            <div className="px-6 py-8 flex justify-center">
              <div className="h-5 w-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            </div>
          ) : (
            <form onSubmit={handleSaveProfile} className="px-6 py-5 space-y-5">
              {/* Avatar */}
              <div className="flex items-center gap-4">
                <div className="relative flex-shrink-0">
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt="Avatar"
                      className="h-16 w-16 rounded-full object-cover border border-black/10 dark:border-white/10"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-full mekai-primary-bg flex items-center justify-center">
                      <span className="text-xl font-semibold text-white">
                        {profile?.username?.slice(0, 2).toUpperCase() ?? '??'}
                      </span>
                    </div>
                  )}
                  {avatarUploading && (
                    <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                      <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    </div>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="avatar-upload"
                    className="cursor-pointer text-sm font-medium text-indigo-500 dark:text-indigo-400 hover:underline"
                  >
                    Change photo
                  </label>
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                    disabled={avatarUploading}
                  />
                  {profile?.avatar_url && (
                    <button
                      type="button"
                      onClick={handleRemoveAvatar}
                      disabled={avatarUploading}
                      className="block mt-0.5 text-xs text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-40"
                    >
                      Remove
                    </button>
                  )}
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">JPG, PNG or GIF · max 2 MB</p>
                </div>
              </div>

              {/* Email — read-only */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
                <input
                  readOnly
                  value={profile?.email ?? ''}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm bg-slate-100 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 cursor-not-allowed"
                />
              </div>

              {/* Role — read-only */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Role</label>
                <input
                  readOnly
                  value={profile?.role ?? ''}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm bg-slate-100 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 cursor-not-allowed capitalize"
                />
              </div>

              {/* Username — editable */}
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (usernameError) setUsernameError(validateUsername(e.target.value));
                  }}
                  maxLength={24}
                  autoComplete="username"
                  className={`w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 transition-colors ${
                    usernameError
                      ? 'border-red-400 dark:border-red-500 focus:ring-red-400/30'
                      : 'border-slate-300 dark:border-slate-600 focus:ring-indigo-400/30 focus:border-indigo-400 dark:focus:border-indigo-500'
                  }`}
                />
                {usernameError && (
                  <p className="mt-1 text-xs text-red-500 dark:text-red-400">{usernameError}</p>
                )}
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">3–24 chars, letters, numbers, underscores.</p>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingProfile || username === (profile?.username ?? '')}
                  className="mekai-primary-bg text-white text-sm font-medium px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {savingProfile ? 'Saving…' : 'Save profile'}
                </button>
              </div>
            </form>
          )}
        </section>

        {/* ── Change Password section ── */}
        <section className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-slate-900 divide-y divide-black/5 dark:divide-white/5 shadow-sm">
          <div className="px-6 py-4">
            <h2 className="text-base font-semibold">Change Password</h2>
          </div>

          <form onSubmit={handleChangePassword} className="px-6 py-5 space-y-5">
            <PasswordInput
              id="current-password"
              label="Current password"
              value={currentPw}
              onChange={(v) => { setCurrentPw(v); if (pwErrors.current) setPwErrors((p) => ({ ...p, current: '' })); }}
              error={pwErrors.current}
              autoComplete="current-password"
            />

            <PasswordInput
              id="new-password"
              label="New password"
              value={newPw}
              onChange={(v) => { setNewPw(v); if (pwErrors.new) setPwErrors((p) => ({ ...p, new: '' })); }}
              error={pwErrors.new}
              autoComplete="new-password"
              show={showNewPw}
              onToggleShow={() => setShowNewPw((s) => !s)}
            />

            {/* Requirements checklist — shows once user starts typing */}
            {newPw.length > 0 && (
              <ul className="space-y-1 pl-1">
                {newPwIssues.map((issue) => (
                  <li key={issue.label} className={`flex items-center gap-2 text-xs ${issue.ok ? 'text-emerald-500' : 'text-slate-400 dark:text-slate-500'}`}>
                    <span className="text-base leading-none">{issue.ok ? '✓' : '○'}</span>
                    {issue.label}
                  </li>
                ))}
              </ul>
            )}

            <PasswordInput
              id="confirm-password"
              label="Confirm new password"
              value={confirmPw}
              onChange={(v) => { setConfirmPw(v); if (pwErrors.confirm) setPwErrors((p) => ({ ...p, confirm: '' })); }}
              error={pwErrors.confirm}
              autoComplete="new-password"
              show={showNewPw}
            />

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingPw}
                className="mekai-primary-bg text-white text-sm font-medium px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {savingPw ? 'Updating…' : 'Change password'}
              </button>
            </div>
          </form>
        </section>

      </div>
    </div>
  );
}
