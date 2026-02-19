import { BookOpen, ExternalLink, Terminal, KeyRound, Database } from 'lucide-react';

export function SetupScreen() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-xl glass rounded-2xl border border-indigo-500/30 shadow-2xl shadow-indigo-950/50 p-8 flex flex-col gap-6">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-600/20 border border-indigo-500/30">
            <BookOpen className="h-6 w-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white tracking-tight">Mekai</h1>
            <p className="text-xs text-gray-500">Manga Reading Platform</p>
          </div>
        </div>

        {/* Notice */}
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 flex items-start gap-3">
          <KeyRound className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-200">
            <span className="font-semibold">Supabase credentials not configured.</span>{' '}
            Follow the steps below to connect your backend.
          </p>
        </div>

        {/* Steps */}
        <ol className="flex flex-col gap-5">
          {/* Step 1 */}
          <Step number={1} icon={<ExternalLink className="h-4 w-4" />} title="Create a Supabase project">
            <p className="text-sm text-gray-400">
              Go to{' '}
              <a
                href="https://supabase.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:underline"
              >
                supabase.com
              </a>
              , create a new project, then open{' '}
              <span className="text-gray-200">Settings → API</span> and copy your{' '}
              <span className="font-mono text-xs text-indigo-300">Project URL</span> and{' '}
              <span className="font-mono text-xs text-indigo-300">anon public key</span>.
            </p>
          </Step>

          {/* Step 2 */}
          <Step number={2} icon={<Database className="h-4 w-4" />} title="Run the SQL schema">
            <p className="text-sm text-gray-400">
              In the Supabase Dashboard → <span className="text-gray-200">SQL Editor</span>, paste and run the file:
            </p>
            <CodeBlock>mekai/supabase/schema.sql</CodeBlock>
            <p className="text-xs text-gray-500 mt-1">
              This creates all tables, RLS policies, storage buckets, realtime subscriptions, and triggers.
            </p>
          </Step>

          {/* Step 3 */}
          <Step number={3} icon={<Terminal className="h-4 w-4" />} title="Add credentials to .env.local">
            <p className="text-sm text-gray-400 mb-2">
              Edit <span className="font-mono text-xs text-indigo-300">mekai/.env.local</span>:
            </p>
            <CodeBlock>{`VITE_SUPABASE_URL=https://your-project.supabase.co\nVITE_SUPABASE_ANON_KEY=your-anon-key`}</CodeBlock>
            <p className="text-sm text-gray-400 mt-2">
              Then restart the dev server:
            </p>
            <CodeBlock>{`cd mekai\nnpm run dev`}</CodeBlock>
          </Step>
        </ol>

        {/* Footer note */}
        <p className="text-xs text-gray-600 text-center border-t border-white/5 pt-4">
          This screen only appears when credentials are missing or placeholder. It will not appear in production with real values.
        </p>
      </div>
    </div>
  );
}

function Step({
  number,
  icon,
  title,
  children,
}: {
  number: number;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4">
      {/* Number badge */}
      <div className="shrink-0 flex flex-col items-center gap-1">
        <div className="w-7 h-7 rounded-full bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-xs font-bold text-indigo-300">
          {number}
        </div>
        <div className="flex-1 w-px bg-white/5" />
      </div>

      {/* Content */}
      <div className="flex flex-col gap-2 pb-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-100">
          <span className="text-indigo-400">{icon}</span>
          {title}
        </div>
        {children}
      </div>
    </li>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs font-mono text-green-300 overflow-x-auto whitespace-pre-wrap break-all">
      {children}
    </pre>
  );
}
