import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';

interface SimpleModalProps {
  open: boolean;
  title: string;
  message?: string;
  children?: React.ReactNode;
  onClose: () => void;
  primaryLabel?: string;
  /** If provided, renders a second action button beside the primary one */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Prevent closing on backdrop/Escape (e.g. while async work is pending) */
  persistent?: boolean;
}

export default function SimpleModal({
  open,
  title,
  message,
  children,
  onClose,
  primaryLabel = 'OK',
  secondaryLabel,
  onSecondary,
  persistent = false,
}: SimpleModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open || persistent) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, persistent]);

  // Trap focus inside panel when open
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      aria-modal="true"
      role="dialog"
      aria-label={title}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={persistent ? undefined : onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={clsx(
          'relative z-10 w-full max-w-sm mx-4 rounded-2xl shadow-2xl',
          'bg-white dark:bg-slate-900',
          'border border-slate-200 dark:border-white/10',
          'focus:outline-none',
          'animate-in fade-in zoom-in-95 duration-150'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h2>
          {!persistent && (
            <button
              onClick={onClose}
              className="p-1 -mr-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-5 pb-4">
          {message && (
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {message}
            </p>
          )}
          {children && (
            <div className="mt-3">{children}</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 pb-5">
          {secondaryLabel && (
            <button
              type="button"
              onClick={onSecondary}
              className={clsx(
                'flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors',
                'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300',
                'hover:bg-slate-200 dark:hover:bg-white/20'
              )}
            >
              {secondaryLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className={clsx(
              'flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90'
            )}
            style={{ backgroundColor: '#40467c' }}
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
