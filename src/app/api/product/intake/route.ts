import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, assertSameOrigin, guardRate, json, readJson, requireWorkspace } from "@/lib/api-utils";
import { requireRole } from "@/lib/permissions";
import { safeFetch, SafeFetchError } from "@/lib/net/safe-fetch";
import { extractProductSnapshot, normalizeProductUrl } from "@/lib/product/intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  url: z.string().trim().min(4).max(400),
});

/**
 * Read one public product page into an editable snapshot. This is the only
 * place in the cycle intake that fetches a user-supplied URL; it goes through
 * the SSRF-safe fetcher, reads HTML only, and never persists anything. The
 * founder reviews and corrects the result before it becomes business context.
 */
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const limited = guardRate(req, "product-intake", 8, 60_000);
  if (limited) return limited;

  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "write");
  if (forbidden) return apiError(forbidden, 403);

  const parsed = await readJson(req, schema);
  if (!parsed.ok) return apiError(parsed.message, parsed.status);

  const normalized = normalizeProductUrl(parsed.data.url);
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return apiError("Enter a valid product URL.", 400);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return apiError("Only http and https URLs are supported.", 400);
  }
  if (url.username || url.password) {
    return apiError("URLs with embedded credentials are not allowed.", 400);
  }
  if (normalized.length > 300) {
    return apiError("That URL is too long. Use the product's public home page.", 400);
  }

  try {
    const res = await safeFetch(url, {
      timeoutMs: 12_000,
      maxBytes: 750_000,
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "BanyanBot/1.0 (product snapshot)",
      },
    });

    if (res.status < 200 || res.status >= 300) {
      return apiError(`The page returned HTTP ${res.status}. Try the public home page.`, 422);
    }
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return apiError("That URL did not return an HTML page.", 422);
    }

    const snapshot = extractProductSnapshot(res.text, normalized);
    return json({
      snapshot,
      sourceUrl: normalized,
      fetchedAt: new Date().toISOString(),
      truncated: res.truncated,
    });
  } catch (err) {
    if (err instanceof SafeFetchError) {
      return apiError(err.message, 400);
    }
    return apiError("Could not read that page. Check the URL and try again.", 502);
  }
}
