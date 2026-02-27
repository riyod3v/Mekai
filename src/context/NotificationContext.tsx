import { createContext, useCallback, useContext, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────

export type NotificationType = 'success' | 'error' | 'info' | 'warn' | 'loading';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  /** Auto-dismiss delay in ms. `0` = manual dismiss only. Default 4000. */
  duration: number;
}

interface NotifyOptions {
  /** Override auto-dismiss duration (ms). 0 = sticky. Default 4000. */
  duration?: number;
}

interface NotificationContextValue {
  notifications: Notification[];
  success: (msg: string, opts?: NotifyOptions) => string;
  error: (msg: string, opts?: NotifyOptions) => string;
  info: (msg: string, opts?: NotifyOptions) => string;
  warn: (msg: string, opts?: NotifyOptions) => string;
  loading: (msg: string, opts?: NotifyOptions) => string;
  dismiss: (id: string) => void;
  /** Update an existing notification (e.g. loading → success). */
  update: (id: string, type: NotificationType, msg: string, opts?: NotifyOptions) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────

let _counter = 0;
function uid(): string {
  _counter += 1;
  return `notif-${Date.now()}-${_counter}`;
}

const DEFAULT_DURATION: Record<NotificationType, number> = {
  success: 4000,
  error: 6000,
  info: 4000,
  warn: 5000,
  loading: 0, // sticky until dismissed/updated
};

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const scheduleAutoDismiss = useCallback(
    (id: string, duration: number) => {
      if (duration <= 0) return;
      const t = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, t);
    },
    [dismiss],
  );

  const push = useCallback(
    (type: NotificationType, message: string, opts?: NotifyOptions): string => {
      const id = uid();
      const duration = opts?.duration ?? DEFAULT_DURATION[type];
      setNotifications((prev) => [...prev, { id, type, message, duration }]);
      scheduleAutoDismiss(id, duration);
      return id;
    },
    [scheduleAutoDismiss],
  );

  const update = useCallback(
    (id: string, type: NotificationType, message: string, opts?: NotifyOptions) => {
      const duration = opts?.duration ?? DEFAULT_DURATION[type];
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, type, message, duration } : n)),
      );
      // Reset auto-dismiss timer
      const existing = timers.current.get(id);
      if (existing) {
        clearTimeout(existing);
        timers.current.delete(id);
      }
      scheduleAutoDismiss(id, duration);
    },
    [scheduleAutoDismiss],
  );

  const value: NotificationContextValue = {
    notifications,
    success: useCallback((msg, opts) => push('success', msg, opts), [push]),
    error: useCallback((msg, opts) => push('error', msg, opts), [push]),
    info: useCallback((msg, opts) => push('info', msg, opts), [push]),
    warn: useCallback((msg, opts) => push('warn', msg, opts), [push]),
    loading: useCallback((msg, opts) => push('loading', msg, opts), [push]),
    dismiss,
    update,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────

export function useNotification(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotification must be used inside <NotificationProvider>');
  return ctx;
}
