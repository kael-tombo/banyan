import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { PageHeader, Badge } from "@/components/ui";
import { CampaignWizard } from "./wizard";

export const metadata: Metadata = { title: "New campaign" };

export default async function NewCampaignPage() {
  const ctx = await requireWorkspaceServer();
  const [profile, campaigns] = await Promise.all([
    prisma.productProfile.findUnique({ where: { workspaceId: ctx.workspace.id } }),
    prisma.campaign.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  return (
    <>
      <PageHeader title="New campaign" description="All fields required except optional ones; refine later at any time from the campaign page." />
      {!profile?.name && (
        <div className="mb-6 rounded-md border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
          Save a product name in <Link href="/app/workspace" className="underline">Workspace</Link> first — campaigns ground generation in it.
        </div>
      )}
      <CampaignWizard
        profile={{ name: profile?.name ?? "", description: profile?.description ?? "", audience: profile?.audience ?? "", goal: profile?.goal ?? "", valueProp: profile?.valueProp ?? "" }}
        existing={campaigns.map((c) => ({ id: c.id, name: c.name }))}
      />
      {campaigns.length === 0 && <Badge variant="warm">No campaign history yet — enabling duplication after your first campaign.</Badge>}
    </>
  );
}
