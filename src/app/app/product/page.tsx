import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { PageHeader } from "@/components/ui";
import { approvalState, parseSources } from "@/lib/product/profile-review";
import { getAnalysis } from "@/lib/product/analysis-runner";
import { ProductReview, type ProfileView } from "./review";

export const metadata: Metadata = { title: "Product profile" };
export const dynamic = "force-dynamic";

const list = (raw: string | null | undefined): string[] => {
  try {
    const v: unknown = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

/** Product profile review and approval (US-021, US-023, US-025). */
export default async function ProductProfilePage() {
  const ctx = await requireWorkspaceServer();
  const [profile, latest] = await Promise.all([
    prisma.productProfile.findUnique({ where: { workspaceId: ctx.workspace.id } }),
    prisma.productAnalysis.findFirst({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "desc" }, select: { id: true } }),
  ]);
  const analysis = latest ? await getAnalysis(ctx.workspace.id, latest.id) : null;
  const state = approvalState(profile);

  const view: ProfileView = {
    exists: Boolean(profile),
    name: profile?.name ?? "",
    description: profile?.description ?? "",
    valueProp: profile?.valueProp ?? "",
    problem: profile?.problem ?? "",
    audience: profile?.audience ?? "",
    website: profile?.website ?? "",
    stage: profile?.stage ?? "building",
    features: list(profile?.features),
    problemsSolved: list(profile?.problemsSolved),
    differentiators: list(profile?.differentiators),
    missingInformation: list(profile?.missingInformation),
    sources: parseSources(profile?.fieldSources),
    version: profile?.version ?? 1,
    approvedAt: profile?.approvedAt?.toISOString() ?? null,
    needsApproval: state.needsApproval,
  };

  return (
    <>
      <PageHeader
        title="Product profile"
        description="What Banyan knows about your product. Strategy and content start from the version you approve, and your own words always win over what the website analysis found."
      />
      <ProductReview
        initial={view}
        lastAnalysis={analysis ? { id: analysis.id, url: analysis.url, status: analysis.status as never, method: analysis.method, error: analysis.error as never, flags: analysis.flags } : null}
      />
    </>
  );
}
