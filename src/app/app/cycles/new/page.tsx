import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { Badge, PageHeader } from "@/components/ui";
import type { ProductSnapshot, ProductStage } from "@/lib/product/intake";
import CycleIntakeForm from "./cycle-intake-form";

export const metadata: Metadata = { title: "New cycle" };
export const dynamic = "force-dynamic";

const STAGES: ProductStage[] = ["idea", "building", "private_beta", "public_beta", "launched", "growth"];

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

  const initialProfile: ProductSnapshot | null = hasUsableProfile
    ? {
        name: profile.name,
        description: profile.description,
        website: profile.website ?? "",
        stage: STAGES.includes(profile.stage as ProductStage) ? (profile.stage as ProductStage) : "launched",
        problem: profile.problem,
        valueProp: profile.valueProp,
        audience: profile.audience ?? "",
        audiencePain: profile.audiencePain ?? "",
        audienceOutcome: profile.audienceOutcome ?? "",
        observedFields: [],
      }
    : null;

  return (
    <>
      <PageHeader
        eyebrow="Complete cycle"
        title="One update. One full cycle."
        description="Banyan reads the product, drafts the strategy and three channel-native assets, waits for your approval, publishes what you approved, measures what happened, and proposes the next move."
        actions={<Badge variant="warm">Level 1 · human-approved</Badge>}
      />
      <CycleIntakeForm
        initialProfile={initialProfile}
        initialUrl={url && /^https?:\/\//i.test(url) ? url : ""}
      />
    </>
  );
}
