import { cookies } from "next/headers";
import { ACTIVE_PRODUCT_COOKIE, resolveActiveProduct } from "@/lib/products";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser, readSessionToken } from "@/lib/auth/session";
import { OnboardingWizard } from "./wizard";
import { getProgress } from "@/lib/onboarding/progress";
import Link from "next/link";
import { ExploreFirst } from "./explore-first";
import CycleIntakeForm from "@/app/app/cycles/new/cycle-intake-form";
import type { ProductSnapshot, ProductStage } from "@/lib/product/intake";

const STAGES: ProductStage[] = ["idea", "building", "private_beta", "public_beta", "launched", "growth"];

export const metadata: Metadata = { title: "Your first cycle" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; mode?: string }>;
}) {
  const { url, mode } = await searchParams;
  const user = await getSessionUser(await readSessionToken());
  if (!user) redirect("/login");
  if (user.onboardingCompletedAt) redirect("/app");

  // A product URL carried from the landing hero prefills the website field —
  // the first concrete step of "from product URL to your next experiment".
  const seedUrl = url && /^https?:\/\//i.test(url) ? url : "";

  // ADR-005: onboard the active product.
  const active = await resolveActiveProduct(user.id, (await cookies()).get(ACTIVE_PRODUCT_COOKIE)?.value ?? null);
  const workspace = active?.workspace;
  const profile = workspace ? await prisma.productProfile.findUnique({ where: { workspaceId: workspace.id } }) : null;
  // Blocker 04: onboarding IS the first cycle. Paste the product URL, review what Banyan read,
  // say what you are shipping, and the cycle starts: strategy, three drafts, your approval,
  // publishing, results. The detailed setup stays available for founders who want it first.
  if (mode !== "detailed") {
    const usable = profile && profile.name.trim() && profile.description.trim() && profile.problem.trim() && profile.valueProp.trim();
    const initialProfile: ProductSnapshot | null = usable
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
      <main className="min-h-screen bg-canvas px-4 py-10 sm:py-14">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-medium text-moss">Welcome to Banyan</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-forest-deep sm:text-3xl">Your first cycle starts with one link.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-charcoal-soft">
            Paste your product&apos;s URL. Banyan reads it, you correct what it got wrong, and you say what you are shipping.
            Then the agents draft the strategy and three posts. Nothing is published until you approve it.
          </p>
          <div className="mt-6">
            <CycleIntakeForm initialProfile={initialProfile} initialUrl={seedUrl} firstCycle />
          </div>
          <p className="mt-6 text-xs text-charcoal-soft">
            Prefer to set everything up first?{" "}
            <Link href="/onboarding?mode=detailed" className="font-medium text-forest hover:underline">Use the detailed setup</Link>
            {" · "}
            <ExploreFirst />
          </p>
        </div>
      </main>
    );
  }

  const progress = workspace ? await getProgress(workspace.id) : null;

  return (
    <OnboardingWizard
      initialStages={progress?.stages ?? []}
      initialSteps={{
        workspace: {
          workspaceName: workspace?.name ?? "",
          businessName: workspace?.businessName || profile?.name || "",
          industry: workspace?.industry ?? "",
          businessModel: workspace?.businessModel || "saas",
          timeZone: workspace?.timeZone || "UTC",
        },
        product: {
          name: profile?.name ?? "",
          description: profile?.description ?? "",
          website: profile?.website || seedUrl,
          stage: profile?.stage ?? "building",
          problem: profile?.problem ?? "",
          valueProp: profile?.valueProp ?? "",
        },
        audience: { audience: profile?.audience ?? "", pain: "", outcome: "", geography: "" },
        goal: { goal: profile?.goal ?? "first_users", goalTarget: profile?.goalTarget ?? null, goalMetric: profile?.goalMetric ?? "" },
        channels: JSON.parse(profile?.channels || '["x"]'),
        voice: JSON.parse(profile?.brandVoice || '{"tone":"direct, plain-spoken","language":"English","approvalPreference":"manual_everything"}'),
      }}
      workspaceName={workspace?.name ?? "Your workspace"}
    />
  );
}
