import { useEffect } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  side?: 'left' | 'right' | 'bottom';
  children: React.ReactNode;
}

export function Drawer({ open, onClose, title, side = 'right', children }: DrawerProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const transitions: Record<string, { base: string; open: string; closed: string }> = {
    right: {
      base: 'fixed inset-y-0 right-0 w-80 max-w-full flex flex-col glass border-l border-white/10 shadow-2xl z-50 overflow-y-auto transition-transform duration-300',
      open: 'translate-x-0',
      closed: 'translate-x-full',
    },
    left: {
      base: 'fixed inset-y-0 left-0 w-80 max-w-full flex flex-col glass border-r border-white/10 shadow-2xl z-50 overflow-y-auto transition-transform duration-300',
      open: 'translate-x-0',
      closed: '-translate-x-full',
    },
    bottom: {
      base: 'fixed inset-x-0 bottom-0 rounded-t-2xl max-h-[70dvh] flex flex-col glass border-t border-white/10 shadow-2xl z-50 overflow-y-auto transition-transform duration-300',
      open: 'translate-y-0',
      closed: 'translate-y-full',
    },
  };

  const t = transitions[side];

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div className={clsx(t.base, open ? t.open : t.closed)}>
        <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
          {title && <h2 className="font-semibold text-sm text-gray-100">{title}</h2>}
          <button
            onClick={onClose}
            className="ml-auto p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </>
  );
}
