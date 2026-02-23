import { ImageOff } from 'lucide-react';
import clsx from 'clsx';

interface Props {
  className?: string;
}

/**
 * Styled placeholder shown wherever a manga cover_url is null.
 * Sized by the parent — pass width/height/aspect classes via `className`.
 */
export function NoCoverPlaceholder({ className }: Props) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center gap-2',
        'bg-slate-100 dark:bg-gradient-to-br dark:from-[#1a1b26] dark:to-[#16161e]',
        'border border-slate-200 dark:border-white/10 rounded-xl',
        className
      )}
    >
      <ImageOff className="h-7 w-7 text-slate-400 dark:text-gray-600" strokeWidth={1.5} />
      <span className="text-[11px] font-medium text-slate-400 dark:text-gray-600 tracking-wide select-none">
        No Cover
      </span>
    </div>
  );
}
