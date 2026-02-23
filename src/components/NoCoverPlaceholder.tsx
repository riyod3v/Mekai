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
        'bg-gradient-to-br from-[#1a1b26] to-[#16161e]',
        'border border-white/10 rounded-xl',
        className
      )}
    >
      <ImageOff className="h-7 w-7 text-gray-600" strokeWidth={1.5} />
      <span className="text-[11px] font-medium text-gray-600 tracking-wide select-none">
        No Cover
      </span>
    </div>
  );
}
