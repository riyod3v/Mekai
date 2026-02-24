import { BookX } from 'lucide-react';

interface Props {
  title?: string;
  message?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({
  title = 'Nothing here yet',
  message = 'No content to display.',
  action,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 px-4 text-center">
      <BookX className="h-14 w-14 text-gray-600" />
      <h2 className="text-base font-semibold text-gray-300">{title}</h2>
      <p className="text-sm text-gray-500 max-w-xs">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-2 px-4 py-2 rounded-lg mekai-primary-bg hover:opacity-90 text-white text-sm font-medium transition-opacity"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
