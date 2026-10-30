import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { Badge, Card, EmptyState, PageHeader, TabBar } from "@/components/ui";
import { CheckCircle2, Lightbulb } from "lucide-react";
import { OpportunityActions } from "./opportunity-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Opportunities" };

const CONFIDENCE_VARIANT = { high: "forest", medium: "warm", low: "warm" } as const;

type Rec = {
  id: string;
  title: string;
  rationale: string;
  evidence: string;
  confidence: string;
  uncertainty: string | null;
  producedBy: string;
  goalId: string | null;
  status: string;
  updatedAt: Date;
};

function parseEvidence(raw: string): { source?: string; summary?: string }[] {
  try {
    const parsed: unknown = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? (parsed as { source?: string; summary?: string }[]) : [];
  } catch {
    return [];
  }
}

function OpportunityCard({ rec }: { rec: Rec }) {
  const evidence = parseEvidence(rec.evidence);
  return (
    <li className="card-lift flex flex-col gap-3 rounded-lg border border-bark/15 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-charcoal">{rec.title}</p>
        <Badge variant={CONFIDENCE_VARIANT[rec.confidence as keyof typeof CONFIDENCE_VARIANT] ?? "warm"}>
          {rec.confidence} confidence
        </Badge>
        <Badge variant="charcoal">{rec.producedBy.replace("agent:", "")}</Badge>
      </div>
      <p className="text-sm leading-relaxed text-charcoal-soft">{rec.rationale}</p>
      {evidence.length > 0 && (
        <ul className="space-y-1">
          {evidence.slice(0, 3).map((e, j) => (
            <li key={j} className="flex items-start gap-1.5 text-xs text-charcoal-soft/85">
              <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-forest" aria-hidden="true" />
              <span className="min-w-0">{e.summary || e.source}</span>
            </li>
          ))}
        </ul>
      )}
      {rec.uncertainty && (
        <p className="text-xs italic text-charcoal-soft/80">What would disconfirm it: {rec.uncertainty}</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-bark/10 pt-3">
        <OpportunityActions
          id={rec.id}
          status={rec.status as "open" | "accepted" | "dismissed" | "acted_upon"}
          title={rec.title}
        />
        {rec.goalId && (
          <Link href={`/app/goals/${rec.goalId}`} className="text-xs font-medium text-forest hover:underline">
            View goal →
          </Link>
        )}
      </div>
    </li>
  );
}

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const ctx = await requireWorkspaceServer();

  const all = await prisma.recommendation.findMany({
    where: { workspaceId: ctx.workspace.id },
    orderBy: { updatedAt: "desc" },
  });

  const groups = {
    new: all.filter((r) => r.status === "open"),
    saved: all.filter((r) => r.status === "accepted" || r.status === "acted_upon"),
    dismissed: all.filter((r) => r.status === "dismissed"),
  };
  const current = tab === "saved" || tab === "dismissed" ? tab : "new";
  const visible = groups[current];
  const counts = { new: groups.new.length, saved: groups.saved.length, dismissed: groups.dismissed.length };

  return (
    <>
      <PageHeader
        title="Growth opportunities"
        description="Signals worth investigating, ranked by the evidence behind them. Confidence is a judgment the analyst states — never a measured score dressed up as one."
      />

      <TabBar
        tabs={[
          { href: "/app/opportunities?tab=new", label: `New (${counts.new})`, current: current === "new" },
          { href: "/app/opportunities?tab=saved", label: `Saved (${counts.saved})`, current: current === "saved" },
          { href: "/app/opportunities?tab=dismissed", label: `Dismissed (${counts.dismissed})`, current: current === "dismissed" },
        ]}
      />

      {visible.length === 0 ? (
        current === "new" ? (
          <EmptyState
            title="No open opportunities"
            body="Opportunities come from the analyst agent after real outcomes are measured — audience research, recorded metrics, experiment learnings. They are never invented to fill a queue. Create a goal to start the loop."
            icon={<Lightbulb size={22} className="text-forest" />}
            action={
              <a href="/app/goals" className="inline-flex items-center justify-center gap-2 rounded-lg bg-forest-deep px-4 py-2 text-sm font-medium text-ivory transition-colors hover:bg-forest">
                Create a goal
              </a>
            }
          />
        ) : (
          <EmptyState
            title={current === "saved" ? "Nothing saved yet" : "Nothing dismissed"}
            body={
              current === "saved"
                ? "Save an opportunity you want to keep in view — dismissed ones stay out of the way but are never deleted."
                : "Opportunities you mark as not relevant land here. They stay inspectable; nothing is silently discarded."
            }
            icon={<Lightbulb size={22} className="text-forest" />}
          />
        )
      ) : (
        <ul className="grid gap-3">
          {visible.map((rec) => (
            <OpportunityCard key={rec.id} rec={rec as Rec} />
          ))}
        </ul>
      )}

      <Card className="mt-6">
        <p className="text-sm text-charcoal-soft">
          The full strategy synthesis — bets, risks and assumptions in the context of your goal — lives on{" "}
          <Link href="/app/strategy" className="font-medium text-forest hover:underline">the strategy page</Link>. This queue
          is the lifecycle view: save what matters, dismiss what does not, turn the best into experiments.
        </p>
      </Card>
    </>
  );
}
