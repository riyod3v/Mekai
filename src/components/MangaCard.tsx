import { Link } from 'react-router-dom';
import { BookOpen, Clock } from 'lucide-react';
import type { Manga } from '@/types';
import { formatDistanceToNow } from '@/lib/dateUtils';

interface Props {
  manga: Manga;
  /** Show private badge */
  showVisibility?: boolean;
}

const PLACEHOLDER_COVER = 'https://picsum.photos/seed/mekai-placeholder/300/420';

export function MangaCard({ manga, showVisibility }: Props) {
  return (
    <Link
      to={`/manga/${manga.id}`}
      className="group flex flex-col overflow-hidden rounded-xl glass border border-white/10 hover:border-indigo-500/50 hover:shadow-indigo-900/20 hover:shadow-xl transition-all duration-200"
    >
      {/* Cover image */}
      <div className="relative aspect-[3/4] overflow-hidden bg-gray-800">
        <img
          src={manga.cover_url || PLACEHOLDER_COVER}
          alt={manga.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).src = PLACEHOLDER_COVER;
          }}
        />
        {showVisibility && manga.visibility === 'private' && (
          <span className="absolute top-2 left-2 text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 font-medium">
            Private
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col gap-1 p-3">
        <h3 className="font-semibold text-sm text-gray-100 line-clamp-2 leading-snug group-hover:text-indigo-300 transition-colors">
          {manga.title}
        </h3>
        {manga.description && (
          <p className="text-xs text-gray-400 line-clamp-2">{manga.description}</p>
        )}
        <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
          <Clock className="h-3 w-3" />
          {formatDistanceToNow(manga.updated_at)} ago
        </div>
      </div>

      {/* Read button hint */}
      <div className="mt-auto border-t border-white/5 px-3 py-2 flex items-center gap-1 text-xs text-indigo-400 group-hover:text-indigo-300">
        <BookOpen className="h-3 w-3" />
        View Details
      </div>
    </Link>
  );
}
