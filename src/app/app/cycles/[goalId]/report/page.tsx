import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspaceServer } from "@/lib/workspace";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { channelName, type ShippedState } from "@/lib/cycle-report";
import { loadCycleReport } from "@/lib/cycle-report-data";
import { NextCycleButton, SuggestNextMove } from "./next-cycle-button";

export const metadata: Metadata = { title: "Cycle report" };
export const dynamic = "force-dynamic";

const STATE_LABEL: Record<ShippedState, { text: string; variant: "forest" | "moss" | "warm" | "clay" | "charcoal" }> = {
  provider: { text: "Published · confirmed by the platform", variant: "forest" },
  manual: { text: "Published by you · URL recorded", variant: "moss" },
  handoff: { text: "Prepared for you to publish", variant: "warm" },
  approved_unpublished: { text: "Approved · not published", variant: "warm" },
  not_approved: { text: "Not approved", variant: "charcoal" },
};

const STATUS_LABEL = {
  met: { text: "Target met", variant: "forest" },
  in_progress: { text: "Below target · window open", variant: "moss" },
  missed: { text: "Target missed", variant: "clay" },
  no_target: { text: "No target set", variant: "charcoal" },
  unmeasured: { text: "Not measured", variant: "warm" },
} as const;


const fmtDate = (d: Date) => d.toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="mt-4 break-inside-avoid">
      <h2 className="font-serif text-xl tracking-[-0.01em] text-forest-deep">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-charcoal-soft">{hint}</p>}
      <div className="mt-3">{children}</div>
    </Card>
  );
}

function Figure({ value, label, note }: { value: number | null; label: string; note: string }) {
  return (
    <div className="rounded-xl border border-bark/10 bg-ivory/40 p-3">
      <p className="num font-serif text-2xl leading-none text-forest-deep">{value === null ? "—" : value.toLocaleString()}</p>
      <p className="mt-1 text-[12px] font-semibold text-charcoal">{label}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-charcoal-soft">{value === null ? "Not measured" : note}</p>
    </div>
  );
}

export default async function CycleReportPage({ params }: { params: Promise<{ goalId: string }> }) {
  const { goalId } = await params;
  const ctx = await requireWorkspaceServer();
  const loaded = await loadCycleReport(ctx.workspace.id, goalId);
  if (!loaded) notFound();
  const { goal, report } = loaded;
  const rec = loaded.recommendation;

  const o = report.objective;
  const status = STATUS_LABEL[o.status];
  const windowText = report.window.end
    ? `${fmtDate(report.window.start)} – ${fmtDate(report.window.end)}${report.window.closed ? "" : ` · ${report.window.daysRemaining} day${report.window.daysRemaining === 1 ? "" : "s"} left`}`
    : `Since ${fmtDate(report.window.start)} · no end date`;

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            Cycle report <Badge variant={report.final ? "forest" : "warm"}>{report.final ? "Final" : "Draft · still measuring"}</Badge>
          </span>
        }
        title={goal.objective}
        description={windowText}
        actions={
          <LinkButton href={`/app/cycles/${goal.id}`} variant="ghost" size="sm">
            Back to the cycle
          </LinkButton>
        }
      />

      <Section title="Against the objective" hint={`Success metric: ${o.metric}${o.target !== null ? ` · target ${o.target.toLocaleString()}${o.unit ? ` ${o.unit}` : ""}` : ""}`}>
        <div className="flex flex-wrap items-end gap-4">
          <p className="num font-serif text-5xl leading-none text-forest-deep">{o.actual === null ? "—" : o.actual.toLocaleString()}</p>
          <div className="pb-1">
            <Badge variant={status.variant}>{status.text}</Badge>
            <p className="mt-1 text-xs text-charcoal-soft">{o.basis}</p>
          </div>
        </div>
      </Section>

      <Section title="What shipped" hint="Each asset, the revision approval, and where it went live.">
        {report.shipped.length === 0 ? (
          <p className="text-sm text-charcoal-soft">Nothing has been drafted for this cycle yet.</p>
        ) : (
          <ul className="divide-y divide-bark/10">
            {report.shipped.map((s) => (
              <li key={s.contentId} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <span className="min-w-0">
                  <Link href={`/app/content/${s.contentId}`} className="font-medium text-charcoal hover:underline">
                    {channelName(s.channel)} {s.format}
                  </Link>
                  <span className="block truncate text-xs text-charcoal-soft">{s.title}</span>
                  <span className="mt-1 block text-xs text-charcoal-soft">
                    {s.approvedBy ? `Approved by ${s.approvedBy}` : "No approval recorded"}
                    {s.publishedAt ? ` · live ${fmtDate(s.publishedAt)}` : ""}
                    {s.url && (
                      <>
                        {" · "}
                        <a href={s.url} target="_blank" rel="noreferrer noopener" className="text-forest hover:underline">
                          live post
                        </a>
                      </>
                    )}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1 text-right">
                  <Badge variant={STATE_LABEL[s.state].variant}>{STATE_LABEL[s.state].text}</Badge>
                  <span className="text-xs text-charcoal-soft">
                    {s.link ? `/t/${s.link.slug} · ${s.link.clicks} visit${s.link.clicks === 1 ? "" : "s"} · ${s.link.signups} signup${s.link.signups === 1 ? "" : "s"}` : "No tracked link"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="What it produced" hint="Counted from recorded rows only. A dash means nothing measures it; 0 means it was measured and nothing happened.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Figure value={report.produced.visits} label="Visits" note="Through Banyan's tracked links" />
          <Figure value={report.produced.trackedSignups} label="Tracked signups" note="Attributed to a tracked link" />
          {report.produced.recorded.map((r) => (
            <Figure
              key={`${r.metric}-${r.source}`}
              value={r.total}
              label={r.metric.replace(/_/g, " ")}
              note={`${r.source === "manual" ? "Recorded by hand" : "Reported by the platform"} · ${r.entries} entr${r.entries === 1 ? "y" : "ies"}`}
            />
          ))}
        </div>
        <p className="mt-3 text-xs text-charcoal-soft">
          <Link href="/app/analytics" className="text-forest hover:underline">See every tracked link and event</Link>
        </p>
      </Section>

      <Section title="What cannot be attributed" hint="Limits of these numbers. Read them before drawing conclusions.">
        {report.notAttributable.length === 0 ? (
          <p className="text-sm text-charcoal-soft">Every published asset has a tracked link and the window has closed.</p>
        ) : (
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-charcoal">
            {report.notAttributable.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Change one thing next" hint="One recommendation, citing recorded evidence.">
        {report.next.kind === "proposal" ? (
          <div>
            <p className="font-medium text-charcoal">{report.next.title}</p>
            <p className="mt-1 text-sm text-charcoal-soft">{report.next.rationale}</p>
            <p className="mt-2 text-xs text-charcoal-soft">
              Confidence: <Badge variant={report.next.confidence === "high" ? "forest" : report.next.confidence === "medium" ? "moss" : "warm"}>{report.next.confidence}</Badge>
              {report.next.uncertainty ? ` · ${report.next.uncertainty}` : ""}
            </p>
            {report.next.evidence.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-charcoal-soft">
                {report.next.evidence.map((e, i) => (
                  <li key={i}>
                    {e.summary ?? "Evidence"}
                    {e.source ? ` (${e.source}${e.ref ? `: ${e.ref}` : ""})` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-clay">This recommendation cites no recorded evidence.</p>
            )}
            <div className="mt-3">
              {rec && rec.status !== "acted_upon" ? (
                <NextCycleButton recommendationId={rec.id} change={rec.title} />
              ) : (
                <p className="text-xs text-charcoal-soft">The next cycle has already been started from this recommendation.</p>
              )}
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-charcoal-soft">{report.next.reason}</p>
            {!rec && (report.final || report.shipped.some((x) => x.state === "provider" || x.state === "manual")) && (<div className="mt-3"><SuggestNextMove goalId={goal.id} /></div>)}
          </div>
        )}
      </Section>
    </>
  );
}
