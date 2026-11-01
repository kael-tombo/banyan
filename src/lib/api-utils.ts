import { NextRequest, NextResponse } from "next/server";
import { ZodError, ZodTypeAny, z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser, readSessionToken } from "@/lib/auth/session";
import { rateLimit } from "@/lib/ratelimit";
import { Membership, User, Workspace } from "@prisma/client";
import { cookies } from "next/headers";
import { ACTIVE_PRODUCT_COOKIE, resolveActiveProduct } from "@/lib/products";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function apiError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/**
 * Same-origin enforcement for mutating requests (CSRF defense in depth on top
 * of SameSite=Lax cookies).
 */
export function assertSameOrigin(req: NextRequest): NextResponse | null {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return null;
  const origin = req.headers.get("origin");
  if (!origin) return null; // non-browser or same-origin form post; cookie remains required
  try {
    const o = new URL(origin);
    const host = req.headers.get("host");
    if (host && o.host !== host) return apiError("Cross-origin request rejected", 403);
  } catch {
    return apiError("Invalid origin", 403);
  }
  return null;
}

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export type ApiContext = { user: User; workspace: Workspace; membership: Membership };

/**
 * Resolve the signed-in user's active workspace. Workspace isolation is
 * central: every API route resolves membership through this function and all
 * queries are scoped by workspaceId.
 */
export async function requireWorkspace(): Promise<ApiContext | null> {
  const token = await readSessionToken();
  const user = await getSessionUser(token);
  if (!user) return null;
  // ADR-005: the active product is a cookie preference, re-validated here on every request.
  const preferred = (await cookies()).get(ACTIVE_PRODUCT_COOKIE)?.value ?? null;
  const active = await resolveActiveProduct(user.id, preferred);
  if (!active) return null;
  return { user, workspace: active.workspace, membership: active.membership };
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

export async function guardRate(req: NextRequest, bucket: string, limit: number, windowMs: number): Promise<NextResponse | null> {
  const key = `${bucket}:${clientIp(req)}`;
  const res = await rateLimit(key, limit, windowMs);
  if (!res.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "retry-after-ms": String(res.retryAfterMs) } }
    );
  }
  return null;
}

/**
 * Validate a request body against a schema. Routes read the JSON body
 * themselves (`await req.json()`), so this accepts the already-parsed value;
 * that also keeps the raw body available for checks such as partial updates.
 * Returns a 400 result on validation failure instead of throwing.
 */
export function parseJson<S extends ZodTypeAny>(schema: S, raw: unknown): ParseResult<z.output<S>> {
  try {
    return { ok: true, data: schema.parse(raw) };
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        ok: false,
        status: 400,
        message: err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "),
      };
    }
    throw err;
  }
}

/** Default cap for JSON request bodies (512 KB — generous for every payload Banyan accepts). */
export const MAX_JSON_BODY_BYTES = 512 * 1024;

/**
 * Read + size-cap + parse + validate a JSON request body in one step.
 * The size cap runs before parsing, which closes the memory-exhaustion path
 * (oversized bodies reaching zod validation) regardless of client-supplied
 * chunking. Returns 413 for oversized bodies, 400 for malformed JSON or
 * schema violations.
 */
export async function readJson<S extends ZodTypeAny>(
  req: NextRequest,
  schema: S,
  maxBytes: number = MAX_JSON_BODY_BYTES
): Promise<ParseResult<z.output<S>>> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, status: 413, message: "Request body too large." };
  }
  let text: string;
  try {
    text = await req.text();
  } catch {
    return { ok: false, status: 400, message: "Invalid request body." };
  }
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    return { ok: false, status: 413, message: "Request body too large." };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, status: 400, message: "Invalid JSON body." };
  }
  return parseJson(schema, raw);
}

/** Retry wrapper for transient failures with a labeled number of attempts. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
  }
  throw lastError;
}
