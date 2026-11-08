import { requireRole } from "@/lib/permissions";
import { apiError, assertSameOrigin, guardRate, json, requireWorkspace } from "@/lib/api-utils";
import { exportCampaign } from "@/lib/distribution/export";
import { NextRequest, NextResponse } from "next/server";

/**
 * Export mode (US-034): every approved, unpublished post of a campaign in one
 * package. Unapproved and already-published items are skipped and counted.
 * `?format=md` returns a Markdown file download.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const limited = await guardRate(req, "export", 60, 60_000);
  if (limited) return limited;
  const ctx = await requireWorkspace();
  if (!ctx) return apiError("Unauthorized", 401);
  const forbidden = requireRole(ctx.membership.role, "control");
  if (forbidden) return apiError(forbidden, 403);
  const { id } = await params;

  const result = await exportCampaign(ctx.workspace.id, id);
  if (!result.ok) return apiError(result.message, result.status);

  if (req.nextUrl.searchParams.get("format") === "md") {
    return new NextResponse(result.markdown, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="banyan-campaign-${id}.md"`,
      },
    });
  }
  return json({ count: result.count, items: result.items, markdown: result.markdown });
}
