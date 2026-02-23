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

// ─── Validation Helpers ──────────────────────────────────────────────────────

function validateEmail(email: string): string | undefined {
  if (!email.trim()) return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Email is invalid';
}

function validatePasswordRequired(pw: string): string | undefined {
  if (!pw) return 'Password is required';
}

function validateSignupPassword(pw: string): string | undefined {
  if (!pw) return 'Password is required';
  if (pw.length < 8) return 'Password must be at least 8 characters long';
  if (!/[A-Z]/.test(pw)) return 'Password must contain at least one uppercase letter';
  if (!/[0-9]/.test(pw)) return 'Password must contain at least one number';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Password must contain at least one special character';
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
  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
    username?: string;
    role?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);



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
    setErrors({});
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);

    if (tab === 'login') {
      const nextErrors: typeof errors = {};
      const emailErr = validateEmail(email);
      const passwordErr = validatePasswordRequired(password);
      if (emailErr) nextErrors.email = emailErr;
      if (passwordErr) nextErrors.password = passwordErr;
      if (Object.keys(nextErrors).length > 0) { setErrors(nextErrors); return; }
      setErrors({});

      setSubmitting(true);
      try {
        await signIn(email, password);
      } catch (err: unknown) {
        const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
        if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
          setErrors({ password: 'Email or password is incorrect' });
        } else {
          setFormError(friendlyAuthError(err));
        }
      } finally {
        setSubmitting(false);
      }
    } else {
      const nextErrors: typeof errors = {};
      if (!username.trim()) nextErrors.username = 'Username is required';
      else if (username.trim().length < 3 || username.trim().length > 24) nextErrors.username = 'Username must be 3–24 characters';
      else if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) nextErrors.username = 'Username can only contain letters, numbers, and underscore';
      const emailErr = validateEmail(email);
      if (emailErr) nextErrors.email = emailErr;
      const passwordErr = validateSignupPassword(password);
      if (passwordErr) nextErrors.password = passwordErr;
      if (Object.keys(nextErrors).length > 0) { setErrors(nextErrors); return; }
      setErrors({});

      setSubmitting(true);
      try {
        await signUp(email, password, username.trim(), role as 'reader' | 'translator');
        toast.success('Account created! Signing you in…');
      } catch (err: unknown) {
        const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
        if (msg.includes('user already registered') || msg.includes('already been registered') || msg.includes('already registered')) {
          setErrors({ email: 'Email is already registered' });
        } else {
          setFormError(friendlyAuthError(err));
        }
      } finally {
        setSubmitting(false);
      }
    }
  }

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
                  onChange={(e) => { setUsername(sanitizeText(e.target.value)); setErrors((prev) => ({ ...prev, username: undefined })); }}
                  placeholder="Your name"
                  className={inputCls(!!errors.username)}
                />
                {errors.username && <p className="mt-1 text-sm text-red-400">{errors.username}</p>}
              </div>
            )}

            {/* Email */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(sanitizeEmail(e.target.value)); setErrors((prev) => ({ ...prev, email: undefined })); }}
                placeholder="you@example.com"
                className={inputCls(!!errors.email)}
                autoComplete="email"
              />
              {errors.email && <p className="mt-1 text-sm text-red-400">{errors.email}</p>}
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrors((prev) => ({ ...prev, password: undefined })); }}
                  placeholder="••••••••"
                  className={clsx(inputCls(!!errors.password), 'pr-10')}
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

              {errors.password && <p className="mt-1 text-sm text-red-400">{errors.password}</p>}
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
                      onClick={() => { setRole(r); setErrors((prev) => ({ ...prev, role: undefined })); }}
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
                {errors.role && <p className="mt-1 text-sm text-red-400">{errors.role}</p>}
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {role === 'reader'
                    ? 'Readers browse, read, OCR-translate, and build a Word Vault.'
                    : 'Translators upload shared manga and chapters for Readers.'}
                </p>
              </div>
            )}

            {/* Form-level API error */}
            {formError && (
              <p className="text-sm text-red-400 text-center -mt-1">{formError}</p>
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

    </div>
  );
}

function inputCls(hasError: boolean) {
  return [
    'w-full px-4 py-3 rounded-xl bg-white dark:bg-white/5 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none transition-colors border',
    hasError
      ? 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500/30'
      : 'border-slate-200 dark:border-white/15 focus:border-indigo-400 dark:focus:border-indigo-500',
  ].join(' ');
}
