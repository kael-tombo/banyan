import type { Metadata } from "next";
import Link from "next/link";
import { requireWorkspaceServer } from "@/lib/workspace";
import { PageHeader, Card, Badge } from "@/components/ui";
import { CHANNEL_META, isChannel } from "@/lib/formats";
import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { settingsProviders } from "@/lib/auth/oauth/server";
import { isProviderId } from "@/lib/auth/oauth/providers";
import { SignInMethods, type LinkedAccount } from "./sign-in-methods";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireWorkspaceServer();
  const channels = JSON.parse(ctx.profile?.channels || "[]") as string[];
  const linked = await prisma.oAuthAccount.findMany({ where: { userId: ctx.user.id }, orderBy: { createdAt: "asc" } });
  const accounts: LinkedAccount[] = linked.flatMap((a) =>
    isProviderId(a.provider) ? [{ id: a.id, provider: a.provider, email: a.email, displayName: a.displayName, lastUsedAt: a.lastUsedAt?.toISOString() ?? null }] : [],
  );

  return (
    <>
      <PageHeader
        title="Settings"
        description="Account, workspace, and operational details. Secrets are never shown here — third-party credentials are stored encrypted and only ever sent from the server."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-medium text-charcoal">Account</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-charcoal-soft">Name</dt>
              <dd className="text-charcoal">{ctx.user.name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-charcoal-soft">Email</dt>
              <dd className="truncate text-charcoal">{ctx.user.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-charcoal-soft">Onboarding</dt>
              <dd>
                {ctx.user.onboardingCompletedAt ? (
                  <Badge variant="forest">completed</Badge>
                ) : (
                  <Link href="/onboarding" className="text-forest">finish onboarding</Link>
                )}
              </dd>
            </div>
          </dl>
        </Card>

        <Card>
          <h2 className="mb-3 font-medium text-charcoal">Workspace</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-charcoal-soft">Name</dt>
              <dd className="text-charcoal">{ctx.workspace.name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-charcoal-soft">Slug</dt>
              <dd className="text-charcoal">{ctx.workspace.slug}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-charcoal-soft">Role</dt>
              <dd className="text-charcoal">{ctx.membership.role}</dd>
            </div>
            {ctx.workspace.isSelf && (
              <div className="flex justify-between gap-4">
                <dt className="text-charcoal-soft">Type</dt>
                <dd><Badge variant="sage">Banyan self-distribution</Badge></dd>
              </div>
            )}
          </dl>
          <p className="mt-3 text-xs text-charcoal-soft">
            Product profile, audience and distribution goal live in <Link href="/app/workspace" className="text-forest">Workspace</Link>.
          </p>
        </Card>
      </div>

      <Suspense>
        <SignInMethods hasPassword={Boolean(ctx.user.passwordHash)} accounts={accounts} providers={settingsProviders(accounts.map((a) => a.provider))} />
      </Suspense>

      <Card className="mt-6">
        <h2 className="mb-2 font-medium text-charcoal">Selected channels</h2>
        <div className="flex flex-wrap gap-2">
          {channels.length ? (
            channels.map((c) => (
              <Badge key={c} variant="warm">
                {isChannel(c) ? CHANNEL_META[c].label : c}
              </Badge>
            ))
          ) : (
            <span className="text-sm text-charcoal-soft">None selected yet — choose channels in Workspace.</span>
          )}
        </div>
      </Card>

      <Card className="mt-6">
        <h2 className="mb-2 font-medium text-charcoal">Publishing worker</h2>
        <p className="text-sm text-charcoal-soft">
          Scheduled publications are attempted by a worker endpoint,
          <code className="mx-1">POST /api/worker/tick</code>, protected by <code>WORKER_SECRET</code>. Run it in-process
          with <code className="mx-1">npm run worker</code>, or point a cron job at the endpoint with an
          <code className="mx-1">Authorization: Bearer &lt;WORKER_SECRET&gt;</code> header. Until a channel connection is
          configured, attempts are recorded as <Badge variant="clay">blocked</Badge> with actionable messaging instead of
          failing silently.
        </p>
      </Card>

      <Card className="mt-6">
        <h2 className="mb-2 font-medium text-charcoal">Legal</h2>
        <p className="text-sm text-charcoal-soft">
          <Link href="/privacy" className="text-forest">Privacy</Link>
          <span className="mx-2">·</span>
          <Link href="/terms" className="text-forest">Terms</Link>
        </p>
      </Card>
    </>
  );
}
