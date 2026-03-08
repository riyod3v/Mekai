import { useState, useCallback } from 'react';
import { Trash2, Clock, Crosshair, Volume2, Star, Copy, Check } from 'lucide-react';
import { logger } from '@/lib/utils/logger';
import { useNotification } from '@/context/NotificationContext';
import {
  useTranslationHistory,
  useDeleteTranslationHistory,
} from '@/hooks/useTranslationHistory';
import { LoadingSpinner } from './LoadingSpinner';
import type { TranslationHistoryRow } from '@/types';

interface Props {
  chapterId: string;
  /** Called when user clicks the locate icon — parent scrolls to and highlights that overlay */
  onHighlight?: (entry: TranslationHistoryRow) => void;
  /** Called when user wants to save an entry to Word Vault */
  onSaveToVault?: (entry: TranslationHistoryRow) => void;
}

function snippet(text: string | null | undefined, max = 80): string {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function HistoryItem({
  entry, onHighlight, onDelete, onSaveToVault, onSpeak, deleting,
}: {
  entry: TranslationHistoryRow;
  onHighlight?: (e: TranslationHistoryRow) => void;
  onDelete: (id: string) => void;
  onSaveToVault?: (e: TranslationHistoryRow) => void;
  onSpeak: (text: string) => void;
  deleting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API not available
    }
  }, []);

  return (
    <li
      className="bg-white dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-white/10 p-3 flex flex-col gap-1.5 group hover:border-indigo-300/30 dark:hover:border-indigo-500/30 transition-colors"
    >
      {/* Page badge + actions */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-medium text-indigo-500 dark:text-indigo-300 uppercase tracking-wide">
          Page {entry.page_index + 1}
        </span>
        <div
          className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Copy translation */}
          <button
            onClick={() => handleCopy(entry.translated)}
            title="Copy translation"
            className="p-1 rounded text-gray-400 dark:text-gray-500 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors"
          >
            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          </button>
          {/* Save to vault */}
          {onSaveToVault && (
            <button
              onClick={() => onSaveToVault(entry)}
              title="Save to Word Vault"
              className="p-1 rounded text-gray-400 dark:text-gray-500 hover:text-yellow-500 dark:hover:text-yellow-400 transition-colors"
            >
              <Star className="h-3 w-3" />
            </button>
          )}
          {onHighlight && (
            <button
              onClick={() => onHighlight(entry)}
              title="Locate on page"
              className="p-1 rounded text-gray-400 dark:text-gray-500 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors"
            >
              <Crosshair className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={() => onDelete(entry.id)}
            disabled={deleting}
            title="Delete"
            className="p-1 rounded text-gray-400 dark:text-gray-500 hover:text-red-400 transition-colors"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Translation (primary, full-width) — clickable to expand */}
      <div
        className="cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <p className="text-sm text-emerald-600 dark:text-green-300 break-words leading-relaxed">
          {snippet(entry.translated)}
        </p>
      </div>

      {/* Romaji pronunciation — always visible when available */}
      {entry.romaji && (
        <div className="flex items-center gap-1.5">
          <p className="text-xs text-indigo-500 dark:text-indigo-300 italic break-words leading-relaxed flex-1">
            {entry.romaji}
          </p>
          <button
            onClick={(e) => { e.stopPropagation(); onSpeak(entry.romaji!); }}
            title="Pronounce"
            className="p-1 rounded text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors shrink-0"
          >
            <Volume2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Expanded: original JP text */}
      {expanded && (
        <div className="flex flex-col gap-1.5 pt-1.5 border-t border-gray-200 dark:border-white/10">
          {/* Original Japanese text */}
          <div>
            <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Original</span>
            <p className="text-sm text-gray-700 dark:text-gray-400 break-words leading-relaxed">
              {entry.ocr_text ?? ''}
            </p>
          </div>

          {/* Full translation */}
          <div>
            <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Translation</span>
            <p className="text-sm text-emerald-600 dark:text-green-300 break-words leading-relaxed">
              {entry.translated}
            </p>
          </div>

          {/* Full romaji with speak button */}
          {entry.romaji && (
            <div>
              <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Pronunciation</span>
              <div className="flex items-center gap-1.5">
                <p className="text-sm text-indigo-500 dark:text-indigo-300 italic break-words leading-relaxed flex-1">
                  {entry.romaji}
                </p>
                <button
                  onClick={(e) => { e.stopPropagation(); onSpeak(entry.romaji!); }}
                  title="Pronounce"
                  className="p-1.5 rounded-lg text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors shrink-0"
                >
                  <Volume2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Timestamp */}
          <span className="text-[10px] text-gray-400 dark:text-gray-600">
            {new Date(entry.created_at).toLocaleString()}
          </span>
        </div>
      )}

      {/* Show/hide original toggle hint */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-[10px] text-gray-500 dark:text-gray-600 select-none hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors text-left"
      >
        {expanded ? 'Hide details ▴' : 'Show details ▾'}
      </button>
    </li>
  );
}

export function HistoryPanel({ chapterId, onHighlight, onSaveToVault }: Props) {
  const { data: entries = [], isLoading } = useTranslationHistory(chapterId);
  const deleteMutation = useDeleteTranslationHistory(chapterId);
  const notify = useNotification();

  function handleDelete(id: string) {
    deleteMutation.mutate(id, {
      onSuccess: () => notify.success('Entry removed'),
      onError: () => notify.error('Failed to delete entry'),
    });
  }

  const handleSpeak = useCallback((text: string) => {
    try {
      if ('speechSynthesis' in window && text) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ja-JP';
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
      }
    } catch (error) {
      logger.warn('[HistoryPanel] Text-to-speech not available:', error);
    }
  }, []);

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <Clock className="h-7 w-7 text-gray-400 dark:text-gray-600" />
        <p className="text-sm text-gray-500">No history yet.</p>
        <p className="text-xs text-gray-400 dark:text-gray-600 max-w-48">
          Enable OCR mode and drag to select text on a page to get started.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {entries.map((entry) => (
        <HistoryItem
          key={entry.id}
          entry={entry}
          onHighlight={onHighlight}
          onDelete={handleDelete}
          onSaveToVault={onSaveToVault}
          onSpeak={handleSpeak}
          deleting={deleteMutation.isPending}
        />
      ))}
    </ul>
  );
}
