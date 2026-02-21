import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Sun, Moon } from 'lucide-react';
import toast from 'react-hot-toast';
import { signIn, signUp, useAuth } from '@/hooks/useAuth';
import { useThemeContext } from '@/context/ThemeContext';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import clsx from 'clsx';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeText(v: string) {
  return v.replace(/\s+/g, ' ').trim();
}

function sanitizeEmail(v: string) {
  return v.trim().toLowerCase();
}

function getPasswordIssues(pw: string) {
  const issues: string[] = [];
  if (pw.length < 8) issues.push('Password must be at least 8 characters.');
  if (!/[A-Z]/.test(pw)) issues.push('Password must include at least 1 uppercase letter.');
  if (!/[0-9]/.test(pw)) issues.push('Password must include at least 1 number.');
  if (!/[^A-Za-z0-9]/.test(pw)) issues.push('Password must include at least 1 special character.');
  return issues;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Maps raw Supabase/network error messages to human-friendly text
function friendlyAuthError(err: unknown): string {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes('invalid login credentials') || msg.includes('invalid credentials'))
    return 'Incorrect email or password. Please try again.';
  if (msg.includes('email not confirmed'))
    return 'Please confirm your email address before signing in. Check your inbox.';
  if (msg.includes('user already registered') || msg.includes('already been registered'))
    return 'An account with this email already exists. Try signing in instead.';
  if (msg.includes('token is expired') || msg.includes('otp expired') || msg.includes('token has expired'))
    return 'This code has expired. Use the resend button to get a new one.';
  if (msg.includes('otp') || msg.includes('invalid token'))
    return 'Invalid code. Double-check what you entered and try again.';
  if (msg.includes('password should be at least'))
    return 'Password must be at least 6 characters (Supabase minimum).';
  if (msg.includes('rate limit') || msg.includes('too many requests'))
    return 'Too many attempts. Please wait a moment before trying again.';
  if (msg.includes('network') || msg.includes('fetch'))
    return 'Network error. Check your connection and try again.';
  if (msg.includes('signup is disabled'))
    return 'New registrations are currently disabled. Contact support.';
  return 'Something went wrong. Please try again.';
}

// ─── Error Modal ─────────────────────────────────────────────────────────────

function ErrorModal({
  open,
  items,
  onClose,
}: {
  open: boolean;
  items: string[];
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 text-slate-100 shadow-2xl">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <span className="text-sm font-semibold">Error</span>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors" aria-label="Close">✕</button>
        </div>
        <div className="px-5 py-4">
          <ul className="space-y-2">
            {items.map((it) => (
              <li key={it} className="flex items-start gap-2 text-sm">
                <span className="text-red-400 mt-0.5">•</span>
                <span>{it}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex justify-end">
            <button
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-white mekai-primary-bg hover:opacity-90 transition-opacity"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Auth Page ────────────────────────────────────────────────────────────────

type Tab = 'login' | 'signup';

export default function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const { isDark, toggleTheme } = useThemeContext();

  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'reader' | 'translator'>('reader');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalItems, setModalItems] = useState<string[]>([]);



  const isSignup = tab === 'signup';
  const logoSrc = isDark
    ? '/IMG/branding/mekai-logo-dark.svg'
    : '/IMG/branding/mekai-logo-light.svg';

  useEffect(() => {
    if (!loading && session) {
      navigate('/', { replace: true });
    }
  }, [session, loading, navigate]);

  function switchTab(t: Tab) {
    setTab(t);
    setModalOpen(false);
  }

  function validateFields(): boolean {
    const errs: string[] = [];
    if (isSignup) {
      if (!username.trim()) errs.push('Username is required.');
      else if (username.trim().length < 3) errs.push('Username must be at least 3 characters.');
    }
    if (!email.trim()) errs.push('Email is required.');
    else if (!isValidEmail(email)) errs.push('Email format looks invalid.');
    if (!password) errs.push('Password is required.');
    else if (isSignup) errs.push(...getPasswordIssues(password));
    if (errs.length) { setModalItems(errs); setModalOpen(true); return false; }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!validateFields()) return;

    setSubmitting(true);
    try {
      if (tab === 'login') {
        await signIn(email, password);
      } else {
        await signUp(email, password, username.trim(), role as 'reader' | 'translator');
        toast.success('Account created! Signing you in…');
      }
    } catch (err: unknown) {
      setModalItems([friendlyAuthError(err)]);
      setModalOpen(true);
    } finally {
      setSubmitting(false);
    }
  }

  const showPwFeedback = isSignup && password.length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Theme toggle top-right */}
      <div className="flex justify-end p-4">
        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-black/5 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-white/10 transition-colors"
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      {/* Centered card */}
      <div className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          {/* Logo + title */}
          <div className="flex flex-col items-center mb-8">
            <Link to="/" className="mb-3 transition-transform hover:scale-105">
              <img src={logoSrc} alt="Mekai" className="h-16 w-16" />
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">Mekai</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Manga reading &amp; translation platform
            </p>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-slate-200 dark:bg-white/10 rounded-xl p-1">
            {(['login', 'signup'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className={clsx(
                  'flex-1 py-2 rounded-lg text-sm font-medium transition-colors',
                  tab === t
                    ? 'text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                )}
                style={tab === t ? { backgroundColor: '#40467c' } : undefined}              >
                {t === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            {/* Username – signup only */}
            {isSignup && (
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(sanitizeText(e.target.value))}
                  placeholder="Your name"
                  className={inputCls}
                />
              </div>
            )}

            {/* Email */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(sanitizeEmail(e.target.value))}
                placeholder="you@example.com"
                className={inputCls}
                autoComplete="email"
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={clsx(inputCls, 'pr-10')}
                  autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {showPwFeedback && (
                <ul className="mt-2 space-y-1 pl-1">
                  {([
                    { label: 'At least 8 characters', ok: password.length >= 8 },
                    { label: 'Uppercase letter', ok: /[A-Z]/.test(password) },
                    { label: 'Number', ok: /[0-9]/.test(password) },
                    { label: 'Special character (!@#$…)', ok: /[^A-Za-z0-9]/.test(password) },
                  ] as { label: string; ok: boolean }[]).map(({ label, ok }) => (
                    <li key={label} className={`flex items-center gap-2 text-xs ${ok ? 'text-emerald-500' : 'text-slate-400 dark:text-slate-500'}`}>
                      <span className="text-base leading-none">{ok ? '✓' : '○'}</span>
                      {label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Role picker – signup only */}
            {isSignup && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">Sign up as:</p>
                <div className="flex gap-2">
                  {(['reader', 'translator'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={clsx(
                        'flex-1 py-2 rounded-xl text-sm font-medium capitalize border transition-colors',
                        role === r
                          ? 'text-white border-transparent'
                          : 'border-slate-300 dark:border-white/20 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-white/40'
                      )}
                      style={role === r ? { backgroundColor: '#40467c', borderColor: '#40467c' } : undefined}
                    >
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {role === 'reader'
                    ? 'Readers browse, read, OCR-translate, and build a Word Vault.'
                    : 'Translators upload shared manga and chapters for Readers.'}
                </p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className={clsx(
                'w-full py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 mt-1 transition-opacity',
                submitting ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90'
              )}
              style={{ backgroundColor: '#40467c' }}
            >
              {submitting && <LoadingSpinner size="sm" />}
              {tab === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>

      <ErrorModal open={modalOpen} items={modalItems} onClose={() => setModalOpen(false)} />
    </div>
  );
}

const inputCls =
  'w-full px-4 py-3 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/15 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:border-indigo-400 dark:focus:border-indigo-500 transition-colors';
