/** Small spinning indicator. */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-ink/20 border-t-trail ${className}`}
    />
  );
}

/** Pulsing placeholder block used for loading skeletons. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-ink/10 ${className}`} />;
}
