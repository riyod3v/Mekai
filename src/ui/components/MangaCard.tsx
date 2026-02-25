import { Link } from 'react-router-dom';
import { BookOpen, Clock, Hash, ImageIcon } from 'lucide-react';
import type { Manga } from '@/types';
import { formatDistanceToNow } from '@/lib/dateUtils';

interface Props {
  manga: Manga;
  /** Show private badge */
  showVisibility?: boolean;
}

export function MangaCard({ manga, showVisibility }: Props) {
  return (
    <Link
      to={`/manga/${manga.id}`}
      className="group flex flex-col overflow-hidden rounded-xl bg-white dark:bg-white/5 backdrop-blur-md border border-gray-200 dark:border-white/10 hover:border-indigo-500/50 hover:shadow-indigo-900/20 hover:shadow-xl transition-all duration-200"
    >
      {/* Cover image */}
      <div className="relative aspect-[3/4] overflow-hidden bg-gray-100 dark:bg-gray-800">
        {manga.cover_url ? (
          <img
            src={manga.cover_url}
            alt={manga.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <ImageIcon className="h-10 w-10 text-gray-400 dark:text-gray-600" />
            <span className="text-xs text-gray-500 dark:text-gray-500 font-medium">No Cover</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col gap-1 p-3">
        <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 line-clamp-2 leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors">
          {manga.title}
        </h3>
        {manga.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{manga.description}</p>
        )}
        <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
          <Clock className="h-3 w-3" />
          <span className="flex-1">{formatDistanceToNow(manga.updated_at)} ago</span>
          {manga.chapter_count !== undefined && (
            <span className="flex items-center gap-0.5 text-indigo-400/80">
              <Hash className="h-3 w-3" />
              {manga.chapter_count} ch
            </span>
          )}
          {showVisibility && manga.visibility === 'private' && (
            <span className="px-1.5 py-0.5 rounded-md bg-yellow-100 dark:bg-yellow-400/20 text-yellow-700 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-400/40 font-semibold tracking-wide">
              Private
            </span>
          )}
          {showVisibility && manga.visibility === 'shared' && (
            <span className="px-1.5 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-400/20 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-400/40 font-semibold tracking-wide">
              Shared
            </span>
          )}
        </div>
      </div>

      {/* Read button hint */}
      <div className="mt-auto border-t border-gray-200 dark:border-white/5 px-3 py-2 flex items-center gap-1 text-xs text-indigo-500 dark:text-indigo-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-300">
        <BookOpen className="h-3 w-3" />
        View Details
      </div>
    </Link>
  );
}
