/**
 * Structured logs (blocker 10, US-064): one JSON line per event, with secrets
 * redacted before anything is written. Banyan holds OAuth tokens, API keys and
 * session cookies; none of them may reach a log file or a log vendor.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Field names whose values are never logged, matched case-insensitively anywhere in the key. */
const SECRET_KEY = /(pass(word)?|secret|token|api[-_]?key|authorization|cookie|session|credential|private[-_]?key|config_?encrypted)/i;

/** Values that look like secrets even under an innocent key. */
const SECRET_VALUE: RegExp[] = [
  /\b(sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g, // provider API keys
  /\bsfl_[A-Za-z0-9_-]{16,}\b/g, // SocialFlow Lite keys
  /\bbny_[A-Za-z0-9_-]{16,}\b/g, // Banyan personal access tokens
  /\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*/gi,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, // JWTs
  /\b(postgres(ql)?|redis|rediss):\/\/[^:\s/]+:[^@\s]+@/gi, // connection strings with a password
];

export const REDACTED = "[redacted]";

export function redactString(s: string): string {
  let out = s;
  for (const re of SECRET_VALUE) out = out.replace(re, (m) => (/^(postgres|redis)/i.test(m) ? m.replace(/:[^:@/]+@$/, `:${REDACTED}@`) : REDACTED));
  return out;
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[too deep]";
  if (typeof value === "string") return redactString(value);
  if (value instanceof Error) return { name: value.name, message: redactString(value.message) };
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEY.test(k) ? REDACTED : redact(v, depth + 1);
    return out;
  }
  return value;
}

export function logLine(level: LogLevel, event: string, fields: Record<string, unknown> = {}, service = "web"): string {
  return JSON.stringify({ level, time: new Date().toISOString(), service, event, ...(redact(fields) as Record<string, unknown>) });
}

export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}, service = "web"): void {
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  const line = logLine(level, event, fields, service);
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}
