import { ReactNode } from "react";

/**
 * A clearly-labelled "coming soon" pill so a deferred feature never reads as a
 * broken control. Renders `<label> — coming soon`.
 */
export function ComingSoonPill({
  label,
  testId,
  className = "",
}: {
  label: string;
  testId?: string;
  className?: string;
}) {
  return (
    <span
      data-coming-soon=""
      data-testid={testId}
      title="Coming soon"
      className={`inline-flex select-none items-center gap-1.5 rounded-full border border-ink/15 bg-ink/[0.04] px-2.5 py-0.5 text-xs font-sans text-ink/60 ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-trail/60" aria-hidden="true" />
      {label} — coming soon
    </span>
  );
}

/** A neutral inline pill used for small status hints. */
export function Pill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-ink/5 px-2 py-0.5 text-xs font-sans text-ink/70 ${className}`}
    >
      {children}
    </span>
  );
}
