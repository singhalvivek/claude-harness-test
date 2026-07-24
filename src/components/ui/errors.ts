/**
 * Error helpers for interpreting failures thrown by the typed api-client
 * wrappers (`@/lib/api-client`). The wrappers throw on non-2xx responses;
 * we read a numeric HTTP status when the thrown error carries one so the UI
 * can branch (401 login, 502 geocode, 400/413 upload) without coupling to a
 * specific Error subclass.
 */

/** Best-effort extraction of an HTTP status code from an unknown thrown value. */
export function getErrorStatus(err: unknown): number | undefined {
  if (err && typeof err === "object") {
    const rec = err as Record<string, unknown>;
    const direct = rec.status ?? rec.statusCode ?? rec.httpStatus;
    if (typeof direct === "number") return direct;
    const msg = typeof rec.message === "string" ? rec.message : "";
    const match = msg.match(/\b(4\d\d|5\d\d)\b/);
    if (match) return Number(match[1]);
  }
  return undefined;
}

/** Human-readable message for an unknown thrown value, with a fallback. */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim() !== "") return msg;
  }
  if (typeof err === "string" && err.trim() !== "") return err;
  return fallback;
}
