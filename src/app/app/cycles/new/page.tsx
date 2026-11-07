import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { Badge, PageHeader } from "@/components/ui";
import { intakeFromSavedProfile } from "@/lib/product/intake-profile";
import CycleIntakeForm from "./cycle-intake-form";

export const metadata: Metadata = { title: "New cycle" };
export const dynamic = "force-dynamic";

export default async function NewCyclePage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const { url } = await searchParams;
  const ctx = await requireWorkspaceServer();
  const profile = await prisma.productProfile.findUnique({ where: { workspaceId: ctx.workspace.id } });

  const hasUsableProfile =
    profile &&
    profile.name.trim().length > 0 &&
    profile.description.trim().length > 0 &&
    profile.problem.trim().length > 0 &&
    profile.valueProp.trim().length > 0;

  return (
    <>
      <PageHeader
        eyebrow="Complete cycle"
        title="One update. One full cycle."
        description="Banyan reads your site, drafts the strategy and three channel-native posts, waits for your approval, publishes what you approved, measures what happened, and proposes the next move."
        actions={<Badge variant="warm">Level 1 · human-approved</Badge>}
      />
      <CycleIntakeForm
        initialProfile={hasUsableProfile ? intakeFromSavedProfile(profile) : null}
        initialUrl={url && /^https?:\/\//i.test(url) ? url : ""}
      />
    </>
  );
}
