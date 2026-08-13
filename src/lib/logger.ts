// Structured, single-line JSON logging to stdout. No LLM tracing (there is no
// LLM); observability here is per-request logs from the route handlers.

type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

function emit(level: Level, msg: string, fields: Fields = {}): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...fields,
  });
  // Single line to stdout for every level so log shippers capture one stream.
  process.stdout.write(line + "\n");
}

export const log = {
  info: (msg: string, fields?: Fields): void => emit("info", msg, fields),
  warn: (msg: string, fields?: Fields): void => emit("warn", msg, fields),
  error: (msg: string, fields?: Fields): void => emit("error", msg, fields),
};

export interface RequestLog {
  method: string;
  path: string;
  status: number;
  ms: number;
  error?: string;
  [key: string]: unknown;
}

/**
 * Small helper for route handlers to log one line per request.
 * 5xx statuses log at `error`, everything else at `info`.
 */
export function logRequest(entry: RequestLog): void {
  const level: Level = entry.status >= 500 ? "error" : "info";
  emit(level, "request", entry);
}
