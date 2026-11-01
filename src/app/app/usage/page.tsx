import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { usageSummary } from "@/lib/model/router";
import { Badge, Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { Receipt } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Model usage" };

function fmtUsd(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(4)}`;
}

function fmtTokens(n: number): string {
  return n.toLocaleString();
}

export default async function UsagePage() {
  const ctx = await requireWorkspaceServer();
  const since = new Date(Date.now() - 30 * 86_400_000);
  const summary = await usageSummary(ctx.workspace.id, since);
  const recent = await prisma.modelCall.findMany({
    where: { workspaceId: ctx.workspace.id },
    orderBy: { createdAt: "desc" },
    take: 15,
  });

  // US-045: outcomes per registered prompt version over the same window.
  const promptRows = await prisma.modelCall.findMany({
    where: { workspaceId: ctx.workspace.id, createdAt: { gte: since }, promptName: { not: null } },
    select: { promptName: true, promptVersion: true, schemaValid: true, attempt: true, ok: true },
    take: 5_000,
  });
  const byPrompt = [...promptRows.reduce((map, r) => {
    const key = `${r.promptName}.v${r.promptVersion}`;
    const e = map.get(key) ?? { key, calls: 0, valid: 0, invalid: 0, retries: 0, failed: 0 };
    e.calls += 1;
    if (r.schemaValid === true) e.valid += 1;
    if (r.schemaValid === false) e.invalid += 1;
    if (r.attempt > 1) e.retries += 1;
    if (!r.ok) e.failed += 1;
    return map.set(key, e);
  }, new Map<string, { key: string; calls: number; valid: number; invalid: number; retries: number; failed: number }>()).values()].sort((a, b) => a.key.localeCompare(b.key));

  const totals = summary.totals;
  const hasCalls = totals.calls > 0;

  return (
    <>
      <PageHeader
        title="Model usage"
        description="Every model call is logged with its provider, tokens and estimated cost — the receipts behind the landing page's promise. Fallback template calls are marked as such and cost nothing."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rooted">
          <p className="text-xs font-semibold uppercase tracking-wide text-charcoal-soft">Calls · 30 days</p>
          <p className="mt-1 font-serif text-3xl text-forest-deep">{totals.calls}</p>
          <p className="mt-0.5 text-xs text-charcoal-soft">routed model calls recorded</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-charcoal-soft">Tokens · 30 days</p>
          <p className="mt-1 font-serif text-3xl text-forest-deep">{fmtTokens(totals.promptTokens + totals.completionTokens)}</p>
          <p className="mt-0.5 text-xs text-charcoal-soft">{fmtTokens(totals.promptTokens)} in · {fmtTokens(totals.completionTokens)} out</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-charcoal-soft">Estimated cost · 30 days</p>
          <p className="mt-1 font-serif text-3xl text-forest-deep">{fmtUsd(totals.estCostMicros)}</p>
          <p className="mt-0.5 text-xs text-charcoal-soft">from recorded pricing — 0 when pricing is unknown, never a guess</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-charcoal-soft">Quota today</p>
          <p className="mt-1 font-serif text-3xl text-forest-deep">{summary.quota.usedToday}<span className="text-lg text-charcoal-soft"> / {summary.quota.limit}</span></p>
          <p className="mt-0.5 text-xs text-charcoal-soft">live model calls · {summary.quota.remaining} remaining</p>
        </Card>
      </div>

      {!hasCalls ? (
        <div className="mt-6">
          <EmptyState
            title="No model calls recorded yet"
            body="Generation, planning and evaluation calls all land here with their full ledger entry. Until then, generation runs on the labelled template fallback — honest, and free."
            icon={<Receipt size={22} className="text-forest" />}
          />
        </div>
      ) : (
        <>
          <Card className="mt-6">
            <h2 className="font-medium text-charcoal">By provider &amp; model</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-bark/15 text-xs uppercase tracking-wide text-charcoal-soft">
                    <th className="pb-2 pr-3 font-medium">Provider</th>
                    <th className="pb-2 pr-3 font-medium">Model</th>
                    <th className="pb-2 pr-3 font-medium">Type</th>
                    <th className="pb-2 pr-3 text-right font-medium">Calls</th>
                    <th className="pb-2 pr-3 text-right font-medium">Tokens</th>
                    <th className="pb-2 text-right font-medium">Est. cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bark/10">
                  {summary.calls.map((c, i) => (
                    <tr key={`${c.provider}-${c.model}-${c.isFallback}-${i}`}>
                      <td className="py-2.5 pr-3 text-charcoal">{c.provider}</td>
                      <td className="py-2.5 pr-3 text-charcoal">{c.model}</td>
                      <td className="py-2.5 pr-3">
                        <Badge variant={c.isFallback ? "warm" : "forest"}>{c.isFallback ? "fallback" : "live"}</Badge>
                      </td>
                      <td className="py-2.5 pr-3 text-right text-charcoal">{c.calls}</td>
                      <td className="py-2.5 pr-3 text-right text-charcoal">{fmtTokens(c.promptTokens + c.completionTokens)}</td>
                      <td className="py-2.5 text-right text-charcoal">{fmtUsd(c.estCostMicros)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {byPrompt.length > 0 && (
            <Card className="mt-6">
              <h2 className="font-medium text-charcoal">By prompt version</h2>
              <p className="mt-1 text-[13px] text-charcoal-soft">Schema pass rate counts only outputs a workflow validated. Retries are second and later attempts.</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-bark/15 text-xs text-charcoal-soft">
                      <th className="pb-2 pr-3 font-medium">Prompt</th>
                      <th className="pb-2 pr-3 text-right font-medium">Calls</th>
                      <th className="pb-2 pr-3 text-right font-medium">Schema pass</th>
                      <th className="pb-2 pr-3 text-right font-medium">Retries</th>
                      <th className="pb-2 text-right font-medium">Failed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bark/10">
                    {byPrompt.map((p) => (
                      <tr key={p.key}>
                        <td className="py-2.5 pr-3 font-mono text-[13px] text-charcoal">{p.key}</td>
                        <td className="num py-2.5 pr-3 text-right text-charcoal">{p.calls}</td>
                        <td className="num py-2.5 pr-3 text-right text-charcoal">
                          {p.valid + p.invalid > 0 ? `${Math.round((p.valid / (p.valid + p.invalid)) * 100)}% of ${p.valid + p.invalid}` : "not validated"}
                        </td>
                        <td className="num py-2.5 pr-3 text-right text-charcoal">{p.retries}</td>
                        <td className="num py-2.5 text-right text-charcoal">{p.failed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card className="mt-6">
            <h2 className="font-medium text-charcoal">Recent calls</h2>
            <ul className="mt-3 divide-y divide-bark/10">
              {recent.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate text-charcoal">
                      {c.purpose}
                      {c.promptName && <span className="ml-2 font-mono text-xs text-muted">{c.promptName}.v{c.promptVersion}{c.attempt > 1 ? ` · attempt ${c.attempt}` : ""}</span>}
                    </p>
                    <p className="text-xs text-charcoal-soft">
                      {c.provider} / {c.model} · {c.createdAt.toLocaleString()} · {c.latencyMs} ms
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={c.isFallback ? "warm" : "forest"}>{c.isFallback ? "fallback" : "live"}</Badge>
                    <StatusBadge status={c.ok ? "completed" : "failed"} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-charcoal-soft">
              Showing the 15 most recent calls. The full ledger is queryable per workspace; quota counts live (non-fallback) calls per day.
            </p>
          </Card>
        </>
      )}
    </>
  );
}
