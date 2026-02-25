import { useState } from 'react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';
import type { RegionBox } from '@/types';

interface Props {
  id: string;
  region: RegionBox;
  translated: string;
  romaji: string | null;
  /** Whether this overlay is being highlighted from the History panel */
  highlighted?: boolean;
  onDismiss: (id: string) => void;
}

/**
 * In-bubble translation overlay.
 * Positioned absolutely inside its page container using normalised 0..1 region coords.
 * The page container must be `position: relative` and the image must be `w-full`.
 * Because the image fills 100% of container width, percent-based positioning is exact.
 */
export function TranslationOverlay({
  id, region, translated, romaji, highlighted = false, onDismiss,
}: Props) {
  const [showRomaji, setShowRomaji] = useState(false);

  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${region.x * 100}%`,
    top: `${region.y * 100}%`,
    width: `${region.w * 100}%`,
    height: `${region.h * 100}%`,
    zIndex: 20,
    boxSizing: 'border-box',
  };

  return (
    <div style={style}>
      {/*
        container-type: inline-size enables cqw units for children.
        The overlay div itself is sized by the percent-based `style` above,
        so cqw resolves correctly against the bubble's actual pixel width.
      */}
      <div
        style={{ containerType: 'inline-size', width: '100%', height: '100%' }}
        className={clsx(
          // Base glass-style dark panel
          'relative rounded-lg overflow-hidden',
          'bg-slate-900/82 backdrop-blur-md border border-white/15 shadow-lg',
          // Highlight ring when located from history
          highlighted && 'ring-2 ring-yellow-400 ring-offset-0 animate-pulse',
        )}
      >
        {/* × dismiss */}
        <button
          onClick={() => onDismiss(id)}
          className="absolute top-0.5 right-0.5 z-10 p-0.5 rounded text-gray-500 hover:text-red-400 transition-colors"
          title="Remove overlay"
        >
          <X className="h-2.5 w-2.5" />
        </button>

        {/* Content — container query context is the outer div above */}
        <div
          className="w-full h-full flex flex-col items-center justify-center px-1.5 py-1 gap-0.5 cursor-pointer select-none overflow-hidden"
          onClick={() => romaji && setShowRomaji((v) => !v)}
        >
          {/* English translation — primary */}
          <p
            className="text-center text-white font-medium leading-tight overflow-hidden"
            style={{ fontSize: 'clamp(7px, 1.8cqw, 13px)', lineHeight: 1.25 }}
          >
            {translated}
          </p>

          {/* Romaji — toggle on click */}
          {romaji && showRomaji && (
            <p
              className="text-center text-indigo-300 leading-tight overflow-hidden"
              style={{ fontSize: 'clamp(6px, 1.4cqw, 10px)', lineHeight: 1.2 }}
            >
              {romaji}
            </p>
          )}

          {/* Indicator that romaji is available */}
          {romaji && (
            <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-gray-600">
              {showRomaji
                ? <ChevronUp className="h-2 w-2" />
                : <ChevronDown className="h-2 w-2" />}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
