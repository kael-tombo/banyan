import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, assertSameOrigin, guardRate, json, readJson } from "@/lib/api-utils";
import { verifyEmail } from "@/lib/auth/email-flows";

const schema = z.object({ token: z.string().min(1).max(200) });

const REASON: Record<"invalid" | "expired" | "used", string> = {
  invalid: "This confirmation link is not valid.",
  expired: "This confirmation link has expired (links last 24 hours).",
  used: "This confirmation link has already been used.",
};

/** US-011. POST, not GET, so a mail scanner prefetching the link cannot use it up. */
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const limited = await guardRate(req, "verify-email", 20, 15 * 60_000);
  if (limited) return limited;
  const parsed = await readJson(req, schema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);
  const res = await verifyEmail(parsed.data.token);
  if (!res.ok) return apiError(REASON[res.reason], 400, { reason: res.reason });
  return json({ ok: true });
}
