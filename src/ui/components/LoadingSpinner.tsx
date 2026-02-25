import clsx from 'clsx';

interface Props {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
  sm: 'h-4 w-4 border-2',
  md: 'h-8 w-8 border-2',
  lg: 'h-12 w-12 border-4',
};

export function LoadingSpinner({ className, size = 'md' }: Props) {
  return (
    <div
      className={clsx(
        'inline-block rounded-full border-indigo-500 border-t-transparent animate-spin',
        sizeMap[size],
        className
      )}
      role="status"
      aria-label="Loading"
    />
  );
}

export function FullPageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-950">
      <LoadingSpinner size="lg" />
    </div>
  );
}
