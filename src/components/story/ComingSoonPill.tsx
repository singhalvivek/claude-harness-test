// A clearly-labelled, inert "coming soon" control. Rendered as a real disabled
// <button> so it reads as a not-yet-available action (never as a bug), is
// keyboard-discoverable, and can never fire. Used for the story's Map-overview
// toggle and Share button, which become real in Phase 2.

export function ComingSoonPill({ label }: { label: string }) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title={`${label} — coming in a later phase`}
      className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-ink/15 bg-white/70 px-3 py-1.5 text-sm font-medium text-ink/55"
    >
      {label}
      <span className="rounded-full bg-trail/15 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-trail">
        Soon
      </span>
    </button>
  );
}
