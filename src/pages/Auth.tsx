import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Sun, Moon } from 'lucide-react';
import toast from 'react-hot-toast';
import { signIn, signUp, useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { supabase } from '@/lib/supabase';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import SimpleModal from '@/components/SimpleModal';
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

// ─── Error Modal ──────────────────────────────────────────────────────────────

function ErrorModal({
  open,
  title = 'Error',
  items,
  onClose,
}: {
  open: boolean;
  title?: string;
  items: string[];
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-sm rounded-xl border border-white/10 bg-slate-900 text-slate-100 shadow-xl">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="text-sm font-semibold">{title}</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="px-4 py-4">
          <ul className="space-y-2 text-sm">
            {items.map((it) => (
              <li key={it} className="flex gap-2">
                <span className="text-red-400">•</span>
                <span>{it}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end">
            <button
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white"
              style={{ backgroundColor: '#40467c' }}
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
type EmailStatus = 'idle' | 'checking' | 'exists' | 'available' | 'invalid' | 'error';

export default function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'reader' | 'translator'>('reader');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Validation state
  const [touched, setTouched] = useState({ username: false, email: false, password: false });
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalItems, setModalItems] = useState<string[]>([]);
  const [emailStatus, setEmailStatus] = useState<EmailStatus>('idle');
  const [emailStatusMsg, setEmailStatusMsg] = useState('');

  // Verification flow state
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpSubmitting, setOtpSubmitting] = useState(false);

  const isSignup = tab === 'signup';
  const logoSrc = isDark
    ? '/IMG/branding/mekai-logo-dark.svg'
    : '/IMG/branding/mekai-logo-light.svg';

  useEffect(() => {
    if (!loading && session) {
      const dest = session.user?.user_metadata?.role === 'translator' ? '/translator' : '/reader';
      navigate(dest, { replace: true });
    }
  }, [session, loading, navigate]);

  function switchTab(t: Tab) {
    setTab(t);
    setSubmitAttempted(false);
    setTouched({ username: false, email: false, password: false });
    setModalOpen(false);
    setEmailStatus('idle');
    setEmailStatusMsg('');
  }

  // Debounced email existence check
  useEffect(() => {
    const e = email.trim().toLowerCase();
    if (!e) { setEmailStatus('idle'); setEmailStatusMsg(''); return; }
    if (!isValidEmail(e)) { setEmailStatus('invalid'); setEmailStatusMsg('Invalid email format'); return; }

    setEmailStatus('checking');
    setEmailStatusMsg('Checking...');

    const t = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('email_registry')
          .select('email')
          .eq('email', e)
          .maybeSingle();
        if (error) throw error;
        const exists = !!data?.email;
        if (isSignup) {
          setEmailStatus(exists ? 'exists' : 'available');
          setEmailStatusMsg(exists ? 'Email already registered' : 'Email available');
        } else {
          setEmailStatus(exists ? 'exists' : 'available');
          setEmailStatusMsg(exists ? 'Email found' : 'No account for this email');
        }
      } catch {
        setEmailStatus('idle');
        setEmailStatusMsg('');
      }
    }, 450);

    return () => clearTimeout(t);
  }, [email, isSignup]);

  function validateForm(): string[] {
    const errors: string[] = [];
    if (isSignup && !username.trim()) errors.push('Username is required.');
    if (!email.trim()) errors.push('Email is required.');
    else if (!isValidEmail(email)) errors.push('Email format looks invalid.');
    if (isSignup && emailStatus === 'exists') errors.push('Email is already registered.');
    if (!isSignup && emailStatus === 'available' && email.trim()) errors.push('No account found for this email.');
    if (!password) errors.push('Password is required.');
    else if (isSignup) errors.push(...getPasswordIssues(password));
    return errors;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitAttempted(true);

    const errors = validateForm();
    if (errors.length) {
      setModalItems(errors);
      setModalOpen(true);
      return;
    }

    setSubmitting(true);
    try {
      if (tab === 'login') {
        await signIn(email, password);
        // session change picked up by useAuth → redirect effect fires
      } else {
        await signUp(email, password, username.trim(), role);
        // Show verification modal instead of immediately switching to login
        setVerifyEmail(email.trim().toLowerCase());
        setShowOtp(false);
        setOtpCode('');
        setVerifyOpen(true);
      }
    } catch (err: unknown) {
      setModalItems([friendlyAuthError(err)]);
      setModalOpen(true);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyOtp() {
    if (otpCode.trim().length < 6) return;
    setOtpSubmitting(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: verifyEmail,
        token: otpCode.trim(),
        type: 'email',
      });
      if (error) throw error;
      // Session will be created → useAuth picks it up → redirect effect fires
      setVerifyOpen(false);
    } catch (err: unknown) {
      setModalItems([friendlyAuthError(err)]);
      setModalOpen(true);
    } finally {
      setOtpSubmitting(false);
    }
  }

  async function handleResendEmail() {
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: verifyEmail });
      if (error) throw error;
      toast.success('Verification email resent!');
    } catch {
      toast.error('Failed to resend. Please try again in a moment.');
    }
  }

  function closeVerifyModal() {
    setVerifyOpen(false);
    switchTab('login');
    toast("You can sign in once you've verified your email.", { icon: 'ℹ️' });
  }

  // Real-time password feedback (signup only)
  const showPwFeedback = isSignup && (touched.password || submitAttempted);

  const emailStatusColor =
    emailStatus === 'checking' ? 'text-slate-400'
    : emailStatus === 'invalid' || emailStatus === 'error' ? 'text-red-400'
    : isSignup && emailStatus === 'exists' ? 'text-amber-400'
    : isSignup && emailStatus === 'available' ? 'text-emerald-400'
    : !isSignup && emailStatus === 'exists' ? 'text-emerald-400'
    : !isSignup && emailStatus === 'available' ? 'text-red-400'
    : 'text-slate-400';

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
                style={tab === t ? { backgroundColor: '#40467c' } : undefined}
              >
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
                  onBlur={() => setTouched((t) => ({ ...t, username: true }))}
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
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                placeholder="you@example.com"
                className={inputCls}
                autoComplete="email"
              />
              {emailStatus !== 'idle' && (
                <div className={`text-xs mt-0.5 ${emailStatusColor}`}>{emailStatusMsg}</div>
              )}
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, password: true }))}
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

              {/* Real-time password feedback */}
              {showPwFeedback && (
                <div className="mt-2 space-y-1">
                  {([
                    { label: 'At least 8 characters', pass: password.length >= 8 },
                    { label: 'One uppercase letter (A–Z)', pass: /[A-Z]/.test(password) },
                    { label: 'One number (0–9)', pass: /[0-9]/.test(password) },
                    { label: 'One special character (!@#…)', pass: /[^A-Za-z0-9]/.test(password) },
                  ] as { label: string; pass: boolean }[]).map(({ label, pass }) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className={pass ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>
                        {pass ? '✓' : '✗'}
                      </span>
                      <span className={`text-xs ${pass ? 'text-slate-500 dark:text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
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

      {/* Validation / generic error modal */}
      <ErrorModal
        open={modalOpen}
        items={modalItems}
        onClose={() => setModalOpen(false)}
      />

      {/* Email verification modal */}
      <SimpleModal
        open={verifyOpen}
        title="Check your email"
        onClose={closeVerifyModal}
        primaryLabel="Back to Sign In"
      >
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          We sent a verification link to{' '}
          <span className="font-semibold text-slate-900 dark:text-slate-100">{verifyEmail}</span>.
          Click the link to activate your account, or enter the 6-digit code below.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          {/* OTP toggle */}
          {!showOtp ? (
            <button
              type="button"
              onClick={() => setShowOtp(true)}
              className="w-full py-2.5 rounded-xl text-sm font-medium border border-slate-300 dark:border-white/20 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
            >
              I have a code
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className={clsx(inputCls, 'text-center tracking-[0.4em] text-lg font-mono')}
                autoFocus
              />
              <button
                type="button"
                onClick={handleVerifyOtp}
                disabled={otpCode.length !== 6 || otpSubmitting}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#40467c' }}
              >
                {otpSubmitting && <LoadingSpinner size="sm" />}
                Verify Code
              </button>
            </div>
          )}

          {/* Resend */}
          <button
            type="button"
            onClick={handleResendEmail}
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:underline text-center transition-colors"
          >
            Didn't get the email? Resend
          </button>
        </div>
      </SimpleModal>
    </div>
  );
}

const inputCls =
  'w-full px-4 py-3 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/15 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:border-indigo-400 dark:focus:border-indigo-500 transition-colors';
