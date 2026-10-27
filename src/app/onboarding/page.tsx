import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser, readSessionToken } from "@/lib/auth/session";
import { OnboardingWizard } from "./wizard";

export const metadata: Metadata = { title: "Set up your workspace" };

export default async function OnboardingPage() {
  const user = await getSessionUser(await readSessionToken());
  if (!user) redirect("/login");
  if (user.onboardingCompletedAt) redirect("/app");

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id },
    include: { workspace: { include: { profile: true } } },
  });
  const profile = membership?.workspace.profile ?? null;

  return (
    <OnboardingWizard
      initialSteps={{
        product: {
          name: profile?.name ?? "",
          description: profile?.description ?? "",
          website: profile?.website ?? "",
          stage: profile?.stage ?? "building",
          problem: profile?.problem ?? "",
          valueProp: profile?.valueProp ?? "",
        },
        audience: { audience: profile?.audience ?? "", pain: "", outcome: "", geography: "" },
        goal: { goal: profile?.goal ?? "first_users", goalTarget: profile?.goalTarget ?? null, goalMetric: profile?.goalMetric ?? "" },
        channels: JSON.parse(profile?.channels || '["x"]'),
        voice: JSON.parse(profile?.brandVoice || '{"tone":"direct, plain-spoken","language":"English","approvalPreference":"manual_everything"}'),
      }}
      workspaceName={membership?.workspace.name ?? "Your workspace"}
    />
  );
}
