import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { signIn, signUp, useAuth } from '@/hooks/useAuth';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import clsx from 'clsx';

type Tab = 'login' | 'signup';

export default function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'reader' | 'translator'>('reader');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && session) {
      navigate(role === 'translator' ? '/translator' : '/reader', { replace: true });
    }
  }, [session, loading, navigate, role]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (tab === 'login') {
        await signIn(email, password);
        // role will be determined from profile after login; redirect will
        // happen via the effect in App router / ProtectedRoute
        navigate('/reader', { replace: true });
      } else {
        if (!username.trim()) { toast.error('Username is required.'); return; }
        await signUp(email, password, username.trim(), role);
        toast.success('Account created! Please check your email to confirm, then log in.');
        setTab('login');
      }
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* Left – decorative */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-indigo-900/40 via-gray-900 to-gray-950 items-center justify-center p-12">
        <div className="max-w-md text-center">
          <BookOpen className="h-16 w-16 text-indigo-400 mx-auto mb-6" />
          <h1 className="text-4xl font-extrabold text-white mb-4 tracking-tight">Mekai</h1>
          <p className="text-gray-400 text-lg leading-relaxed">
            An interactive manga reading platform for untranslated and foreign-language manga scans.
            OCR, translate, and build your Word Vault — all in your browser.
          </p>
        </div>
      </div>

      {/* Right – form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Logo mobile */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <BookOpen className="h-7 w-7 text-indigo-400" />
            <span className="text-2xl font-extrabold text-white">Mekai</span>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 glass rounded-xl p-1">
            {(['login', 'signup'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={clsx(
                  'flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-colors',
                  tab === t ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
                )}
              >
                {t === 'login' ? 'Log In' : 'Sign Up'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Username – signup only */}
            {tab === 'signup' && (
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                className={inputCls}
                required
              />
            )}

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className={inputCls}
              required
              autoComplete="email"
            />

            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className={clsx(inputCls, 'pr-10')}
                required
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {/* Role picker – signup only */}
            {tab === 'signup' && (
              <div>
                <p className="text-xs text-gray-400 mb-2">Sign up as:</p>
                <div className="flex gap-2">
                  {(['reader', 'translator'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={clsx(
                        'flex-1 py-2 rounded-lg text-sm font-medium capitalize border transition-colors',
                        role === r
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-white/20 text-gray-400 hover:border-indigo-500/50'
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {role === 'reader'
                    ? 'Readers browse, read, OCR-translate, and build a Word Vault.'
                    : 'Translators upload shared manga and chapters for Readers.'}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              {submitting && <LoadingSpinner size="sm" />}
              {tab === 'login' ? 'Log In' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  'w-full px-4 py-3 rounded-xl bg-white/5 border border-white/15 text-gray-100 placeholder:text-gray-500 text-sm focus:outline-none focus:border-indigo-500 transition-colors';
