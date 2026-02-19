import { useState } from 'react';
import { BookmarkPlus, X, RefreshCw, Eye, EyeOff } from 'lucide-react';
import type { OcrResult } from '@/types';
import clsx from 'clsx';

interface Props {
  result: OcrResult;
  onSaveToVault: (result: OcrResult) => void;
  onDismiss: () => void;
  onRetranslate?: () => void;
  /** Whether this is a history replay overlay (can toggle visibility) */
  isHistory?: boolean;
  visible?: boolean;
  onToggleVisible?: () => void;
}

export function TranslationTooltip({
  result,
  onSaveToVault,
  onDismiss,
  onRetranslate,
  isHistory = false,
  visible = true,
  onToggleVisible,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const { absBox } = result;

  return (
    <div
      className="translation-overlay"
      style={{
        left: absBox.left,
        top: absBox.top + absBox.height + 4,
        minWidth: Math.max(absBox.width, 200),
        maxWidth: 340,
      }}
    >
      {/* Selection highlight box */}
      <div
        className="absolute -translate-y-full ocr-selection-box pointer-events-none"
        style={{
          left: 0,
          top: -(absBox.height + 4),
          width: absBox.width,
          height: absBox.height,
        }}
      />

      {/* Tooltip card */}
      <div
        className={clsx(
          'rounded-xl glass border border-indigo-500/30 shadow-2xl text-xs',
          !visible && 'opacity-40'
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-white/10">
          <span className="font-medium text-indigo-300 text-xs truncate flex-1">
            {isHistory ? 'Saved Translation' : 'OCR Result'}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {onToggleVisible && (
              <button
                onClick={onToggleVisible}
                className="p-1 rounded text-gray-400 hover:text-white transition-colors"
                title={visible ? 'Hide overlay' : 'Show overlay'}
              >
                {visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              </button>
            )}
            {onRetranslate && (
              <button
                onClick={onRetranslate}
                className="p-1 rounded text-gray-400 hover:text-indigo-300 transition-colors"
                title="Re-translate"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={() => setExpanded((v) => !v)}
              className="p-1 rounded text-gray-400 hover:text-white transition-colors font-bold"
              title="Collapse"
            >
              {expanded ? '−' : '+'}
            </button>
            <button
              onClick={onDismiss}
              className="p-1 rounded text-gray-400 hover:text-red-400 transition-colors"
              title="Close"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>

        {expanded && (
          <div className="p-3 flex flex-col gap-2">
            {/* OCR text */}
            <div>
              <p className="text-gray-500 uppercase tracking-wide text-[10px] font-medium mb-0.5">Original</p>
              <p className="text-gray-200 font-mono whitespace-pre-wrap break-words leading-relaxed">
                {result.text}
              </p>
            </div>

            {/* Translation */}
            {result.translated && (
              <div>
                <p className="text-gray-500 uppercase tracking-wide text-[10px] font-medium mb-0.5">Translation</p>
                <p className="text-green-300 whitespace-pre-wrap break-words">{result.translated}</p>
              </div>
            )}

            {/* Romaji */}
            {result.romaji && (
              <div>
                <p className="text-gray-500 uppercase tracking-wide text-[10px] font-medium mb-0.5">Romaji</p>
                <p className="text-blue-300 italic">{result.romaji}</p>
              </div>
            )}

            {/* Save to vault */}
            {!isHistory && result.translated && (
              <button
                onClick={() => onSaveToVault(result)}
                className="mt-1 flex items-center gap-1.5 justify-center w-full py-1.5 rounded-lg bg-indigo-600/50 hover:bg-indigo-600 text-indigo-100 transition-colors text-xs font-medium"
              >
                <BookmarkPlus className="h-3 w-3" />
                Save to Word Vault
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
