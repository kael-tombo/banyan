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
import { BanyanMark } from "@/components/BanyanMark";
import CycleIntakeForm from "@/app/app/cycles/new/cycle-intake-form";
import { intakeFromSavedProfile } from "@/lib/product/intake-profile";
import { savedScan } from "@/lib/research/runner";

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
    const initialProfile = usable && profile ? intakeFromSavedProfile(profile) : null;
    const scan = workspace ? await savedScan(workspace.id, profile?.lastAnalysisId) : { analysisId: null, research: null };
    return (
      <div className="min-h-screen bg-canvas">
        {/* A quiet frame: the brand, and the two ways out. The steps carry the page. */}
        <header className="border-b border-bark/10 bg-canvas/80 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
            <span className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight text-forest-deep">
              <BanyanMark size={24} /> Banyan
            </span>
            <span className="flex items-center gap-3 text-[12px] text-charcoal-soft">
              <Link href="/onboarding?mode=detailed" className="hover:text-forest">Detailed setup</Link>
              <span aria-hidden="true" className="text-bark/30">·</span>
              <ExploreFirst />
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 pb-16 pt-10 sm:pt-14">
          <CycleIntakeForm initialProfile={initialProfile} initialUrl={seedUrl} firstCycle initialAnalysisId={scan.analysisId} initialResearch={scan.research} />
        </main>
      </div>
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
