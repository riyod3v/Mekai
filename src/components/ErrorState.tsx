import { AlertTriangle } from 'lucide-react';

interface Props {
  title?: string;
  message?: string;
  retry?: () => void;
}

export function ErrorState({
  title = 'Something went wrong',
  message = 'An unexpected error occurred. Please try again.',
  retry,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 px-4 text-center">
      <AlertTriangle className="h-12 w-12 text-red-400" />
      <h2 className="text-lg font-semibold text-gray-100">{title}</h2>
      <p className="text-sm text-gray-400 max-w-sm">{message}</p>
      {retry && (
        <button
          onClick={retry}
          className="mt-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
        >
          Try Again
        </button>
      )}
    </div>
  );
}
