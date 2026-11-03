import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, assertSameOrigin, guardRate, json, readJson } from "@/lib/api-utils";
import { requestPasswordReset } from "@/lib/auth/email-flows";
import { emailConfigured } from "@/lib/email/transport";
import { rateLimit } from "@/lib/ratelimit";

const schema = z.object({ email: z.string().trim().email().max(200) });

const RESET_REQUESTED_MESSAGE = "If an account uses that address, a reset link is on its way. It works once and expires in 1 hour.";

/**
 * US-012. The answer is the same whether or not the address has an account,
 * and per-address limiting is silent, so neither reveals who uses Banyan.
 */
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const limited = await guardRate(req, "password-forgot", 5, 15 * 60_000);
  if (limited) return limited;
  const parsed = await readJson(req, schema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  const email = parsed.data.email.toLowerCase();
  const perAddress = await rateLimit(`password-forgot-address:${email}`, 3, 60 * 60_000);
  if (perAddress.ok) await requestPasswordReset(email);
  return json({ ok: true, message: RESET_REQUESTED_MESSAGE, emailConfigured: emailConfigured() });
}
