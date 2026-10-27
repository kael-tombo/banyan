import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser, readSessionToken } from "@/lib/auth/session";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser(await readSessionToken());
  if (!user) redirect("/login?next=%2Fapp");
  if (!user.onboardingCompletedAt) redirect("/onboarding");

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id },
    include: { workspace: { include: { profile: true } } },
    orderBy: { id: "asc" },
  });
  if (!membership) redirect("/onboarding");

  return (
    <AppShell
      user={{ name: user.name, email: user.email }}
      workspace={{ id: membership.workspace.id, name: membership.workspace.name, isSelf: membership.workspace.isSelf }}
      product={membership.workspace.profile?.name ?? ""}
      goal={membership.workspace.profile?.goal ?? ""}
    >
      {children}
    </AppShell>
  );
}
