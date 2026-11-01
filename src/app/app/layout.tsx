import { getBalance } from "@/lib/credits/service";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser, readSessionToken } from "@/lib/auth/session";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser(await readSessionToken());
  if (!user) redirect("/login?next=%2Fapp");

  // Onboarding is optional, not a gate: it is only required to create the
  // workspace (which signup already did). Anyone with a workspace can use the
  // app immediately; an in-app prompt guides them until setup is finished.
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id },
    include: { workspace: { include: { profile: true } } },
    orderBy: { id: "asc" },
  });
  if (!membership) redirect("/onboarding");

  // One count for the things only a human can move: content awaiting review
  // plus execution gates paused mid-workflow. Shown in the rail and top bar.
  const [awaitingContent, awaitingGates, awaitingStrategy] = await Promise.all([
    prisma.contentItem.count({
      where: { workspaceId: membership.workspace.id, status: "ready_for_review" },
    }),
    prisma.agentTask.count({
      where: {
        workspaceId: membership.workspace.id,
        type: "approval_gate",
        status: "waiting_approval",
      },
    }),
    prisma.strategy.count({ where: { workspaceId: membership.workspace.id, status: "proposed" } }),
  ]);

  const credits = await getBalance(membership.workspace.id).catch(() => null);

  return (
    <AppShell
      user={{ name: user.name, email: user.email }}
      workspace={{ id: membership.workspace.id, name: membership.workspace.name, isSelf: membership.workspace.isSelf }}
      product={membership.workspace.profile?.name ?? ""}
      goal={membership.workspace.profile?.goal ?? ""}
      // Setup is done once the wizard finished or a product profile exists: the
      // banner asks for exactly that, and the launch path covers what comes next.
      onboardingComplete={Boolean(user.onboardingCompletedAt || membership.workspace.profile)}
      attention={{ approvals: awaitingContent + awaitingGates + awaitingStrategy }}
      credits={credits?.available ?? null}
    >
      {children}
    </AppShell>
  );
}
