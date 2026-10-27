import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { PageHeader } from "@/components/ui";
import { NewContentForm } from "./new";

export const metadata: Metadata = { title: "New content" };

export default async function NewContentPage() {
  const ctx = await requireWorkspaceServer();

  const [campaigns, profile] = await Promise.all([
    prisma.campaign.findMany({
      where: { workspaceId: ctx.workspace.id, status: { notIn: ["archived"] } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true },
    }),
    prisma.productProfile.findUnique({ where: { workspaceId: ctx.workspace.id } }),
  ]);

  const selected = JSON.parse(profile?.channels || "[]") as string[];
  const defaultChannel = selected[0] ?? "x";

  return (
    <>
      <PageHeader
        title="New content"
        description="Create a draft, then generate channel-appropriate copy in your brand voice from the editor. Everything stays editable and versioned — generation never overwrites your edits."
      />
      <NewContentForm campaigns={campaigns} defaultChannel={defaultChannel} />
    </>
  );
}
