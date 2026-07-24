/** Formatting helpers shared by the editor UI. */

/** ISO string -> a `datetime-local` input value ("YYYY-MM-DDTHH:mm"), local time. */
export function toDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** `datetime-local` value -> ISO 8601 string, or null when empty. */
export function fromDateTimeLocal(value: string): string | null {
  if (!value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Friendly display for a stop's date/time. */
export function formatDateTime(iso: string | null): string {
  if (!iso) return "No date set";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "No date set";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Friendly display for a date-only value (e.g. trip updatedAt). */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
