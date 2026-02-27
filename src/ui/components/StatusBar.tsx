import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, Loader2, X } from 'lucide-react';
import { useNotification, type Notification, type NotificationType } from '@/context/NotificationContext';

// ─── Style map ────────────────────────────────────────────────

const STYLE: Record<NotificationType, { bg: string; icon: React.ReactNode; border: string }> = {
  success: {
    bg: 'bg-emerald-950/90',
    border: 'border-emerald-500/40',
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />,
  },
  error: {
    bg: 'bg-red-950/90',
    border: 'border-red-500/40',
    icon: <XCircle className="h-4 w-4 text-red-400 shrink-0" />,
  },
  info: {
    bg: 'bg-indigo-950/90',
    border: 'border-indigo-500/40',
    icon: <Info className="h-4 w-4 text-indigo-400 shrink-0" />,
  },
  warn: {
    bg: 'bg-amber-950/90',
    border: 'border-amber-500/40',
    icon: <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />,
  },
  loading: {
    bg: 'bg-indigo-950/90',
    border: 'border-indigo-500/40',
    icon: <Loader2 className="h-4 w-4 text-indigo-400 shrink-0 animate-spin" />,
  },
};

// ─── Single notification banner ───────────────────────────────

function StatusBanner({ n, onDismiss }: { n: Notification; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation on next frame
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const { bg, border, icon } = STYLE[n.type];

  return (
    <div
      className={`
        flex items-center gap-2.5 px-4 py-2.5 rounded-xl border backdrop-blur-md
        shadow-lg shadow-black/20
        text-sm text-gray-100
        transition-all duration-300 ease-out
        ${bg} ${border}
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}
      `}
    >
      {icon}
      <span className="flex-1 min-w-0 truncate">{n.message}</span>
      {n.type !== 'loading' && (
        <button
          onClick={onDismiss}
          className="shrink-0 text-gray-400 hover:text-white transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ─── StatusBar (renders all active notifications) ─────────────

export function StatusBar() {
  const { notifications, dismiss } = useNotification();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none w-full max-w-md px-4">
      {notifications.map((n) => (
        <div key={n.id} className="pointer-events-auto w-full">
          <StatusBanner n={n} onDismiss={() => dismiss(n.id)} />
        </div>
      ))}
    </div>
  );
}
