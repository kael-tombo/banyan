import { requireRole } from "@/lib/permissions";
import { apiError, assertSameOrigin, guardRate, json, requireWorkspace } from "@/lib/api-utils";
import { exportContentItem } from "@/lib/distribution/export";
import { NextRequest, NextResponse } from "next/server";

/**
 * Export mode (US-034): the ready-to-publish package for one approved post.
 * POST because the first export creates the post's tracked link.
 * `?format=md` returns a Markdown file download instead of JSON.
 * Never publishes anything: the live URL is recorded afterwards through
 * POST /api/content/[id]/publish with mode "manual".
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

  const result = await exportContentItem(ctx.workspace.id, id);
  if (!result.ok) return apiError(result.message, result.status);

  if (req.nextUrl.searchParams.get("format") === "md") {
    return new NextResponse(result.markdown, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="banyan-${result.pkg.channel}-${id}.md"`,
      },
    });
  }
  return json({ package: result.pkg, text: result.text, markdown: result.markdown });
}
