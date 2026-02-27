import { useState } from 'react';
import { Trash2, Clock, Crosshair } from 'lucide-react';
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
}

function snippet(text: string | null | undefined, max = 55): string {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function HistoryItem({
  entry, onHighlight, onDelete, deleting,
}: {
  entry: TranslationHistoryRow;
  onHighlight?: (e: TranslationHistoryRow) => void;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li
      className="glass rounded-xl border border-white/10 p-3 flex flex-col gap-1.5 group cursor-pointer"
      onClick={() => setExpanded((v) => !v)}
    >
      {/* Page badge + actions */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-medium text-indigo-300 uppercase tracking-wide">
          Page {entry.page_index + 1}
        </span>
        <div
          className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          {onHighlight && (
            <button
              onClick={() => onHighlight(entry)}
              title="Locate on page"
              className="p-1 rounded text-gray-500 hover:text-indigo-300 transition-colors"
            >
              <Crosshair className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={() => onDelete(entry.id)}
            disabled={deleting}
            title="Delete"
            className="p-1 rounded text-gray-500 hover:text-red-400 transition-colors"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Translation (primary) */}
      <p className="text-xs text-green-300 break-words leading-relaxed">
        {snippet(entry.translated)}
      </p>

      {/* Expanded: romaji + ocr text */}
      {expanded && (
        <div className="flex flex-col gap-1 pt-1 border-t border-white/10">
          {entry.romaji && (
            <p className="text-xs text-indigo-300 italic break-words">{entry.romaji}</p>
          )}
          <p className="text-xs font-mono text-gray-500 break-words leading-relaxed">
            {entry.ocr_text ?? ''}
          </p>
        </div>
      )}
    </li>
  );
}

export function HistoryPanel({ chapterId, onHighlight }: Props) {
  const { data: entries = [], isLoading } = useTranslationHistory(chapterId);
  const deleteMutation = useDeleteTranslationHistory(chapterId);
  const notify = useNotification();

  function handleDelete(id: string) {
    deleteMutation.mutate(id, {
      onSuccess: () => notify.success('Entry removed'),
      onError: () => notify.error('Failed to delete entry'),
    });
  }

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
        <Clock className="h-7 w-7 text-gray-600" />
        <p className="text-sm text-gray-500">No history yet.</p>
        <p className="text-xs text-gray-600 max-w-48">
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
          deleting={deleteMutation.isPending}
        />
      ))}
    </ul>
  );
}
