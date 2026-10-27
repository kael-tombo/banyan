import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { PageHeader, Badge } from "@/components/ui";
import { WorkspaceProfileForm, ChannelBadge } from "./form";
import Link from "next/link";

export default async function WorkspacePage() {
  const ctx = await requireWorkspaceServer();
  const channels = JSON.parse(ctx.profile?.channels || "[]") as string[];
  const connections = await prisma.channelConnection.findMany({ where: { workspaceId: ctx.workspace.id } });

  return (
    <>
      <PageHeader title="Workspace" description="Your product profile, audience, and distribution goal. This grounds every generated document. Loaded from the database — changes persist across sessions." />
      {!ctx.profile?.name && (
        <p className="mb-6 rounded-md border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
          Your profile has no product name yet. Generation, planning, and content scoring will not treat these fields as available until you save them.
        </p>
      )}
      <WorkspaceProfileForm profile={ctx.profile} workspaceName={ctx.workspace.name} isSelf={ctx.workspace.isSelf} />
      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-charcoal">Selected channels</h2>
        <p className="flex flex-wrap gap-2">
          {channels.length ? (
            channels
              .map((c) => <ChannelBadge key={c} channel={c} connections={connections} />)
          ) : (
            <Badge variant="warm">None selected yet</Badge>
          )}
        </p>
        <p className="mt-2 text-xs text-charcoal-soft">
          Selected means "chosen," not "connected." Connection status comes from real verification checks, stored in <code>ChannelConnection.status</code>.
        </p>
      </div>
    </>
  );
}
