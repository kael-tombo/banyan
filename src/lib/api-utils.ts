import { NextRequest, NextResponse } from "next/server";
import { ZodError, ZodSchema } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser, readSessionToken } from "@/lib/auth/session";
import { rateLimit } from "@/lib/ratelimit";
import { Membership, User, Workspace } from "@prisma/client";

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
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id },
    include: { workspace: true },
    orderBy: { id: "asc" },
  });
  if (!membership) return null;
  return { user, workspace: membership.workspace, membership };
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

export function parseBody<T>(schema: ZodSchema<T>, raw: unknown): ParseResult<T> {
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

export function guardRate(req: NextRequest, bucket: string, limit: number, windowMs: number): NextResponse | null {
  const key = `${bucket}:${clientIp(req)}`;
  const res = rateLimit(key, limit, windowMs);
  if (!res.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "retry-after-ms": String(res.retryAfterMs) } }
    );
  }
  return null;
}

export function parseJson<T>(schema: ZodSchema<T>, req: NextRequest): Promise<ParseResult<T>> {
  return req.json().then((raw) => parseBody(schema, raw));
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
