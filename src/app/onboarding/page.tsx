import { cookies } from "next/headers";
import { ACTIVE_PRODUCT_COOKIE, resolveActiveProduct } from "@/lib/products";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser, readSessionToken } from "@/lib/auth/session";
import { OnboardingWizard } from "./wizard";
import { getProgress } from "@/lib/onboarding/progress";

export const metadata: Metadata = { title: "Set up your workspace" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const { url } = await searchParams;
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
