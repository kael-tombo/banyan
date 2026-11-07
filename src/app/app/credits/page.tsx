import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { Card, PageHeader } from "@/components/ui";
import { getBalance } from "@/lib/credits/service";
import { fold, KIND_LABEL, PRICING, type CreditKind } from "@/lib/credits/ledger";

export const metadata: Metadata = { title: "Credits" };
export const dynamic = "force-dynamic";

/** Credits and their full history (US-063). Every number is the sum of the ledger. */
export default async function CreditsPage() {
  const ctx = await requireWorkspaceServer();
  const wid = ctx.workspace.id;
  const balance = await getBalance(wid);
  const [entries, campaigns] = await Promise.all([
    prisma.creditEntry.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.campaign.findMany({ where: { workspaceId: wid }, select: { id: true, name: true } }),
  ]);
  const campaignName = new Map(campaigns.map((c) => [c.id, c.name]));
  const all = await prisma.creditEntry.findMany({ where: { workspaceId: wid }, select: { kind: true, amount: true } });
  const check = fold(all);
  const spent = all.filter((e) => e.kind === "settle").reduce((s, e) => s + e.amount, 0);

  const signed = (kind: string, amount: number) => {
    if (kind === "reserve" || kind === "expire") return `−${amount}`;
    // Spending comes out of the held credits, not the available ones again.
    if (kind === "settle") return `${amount} from held`;
    if (kind === "adjust") return amount > 0 ? `+${amount}` : `−${Math.abs(amount)}`;
    return `+${amount}`;
  };

  return (
    <>
      <PageHeader title="Credits" description="Credits pay for the model work Banyan does for you. Every number on this page is the sum of the history below." />

      <section aria-label="Balance" className="card-shadow grid grid-cols-1 overflow-hidden rounded-2xl border border-bark/10 bg-white sm:grid-cols-3">
        <div className="p-5">
          <p className="text-[13px] text-charcoal-soft">Available</p>
          <p className="num mt-2 font-serif text-[32px] leading-none text-forest-deep">{balance.available}</p>
        </div>
        <div className="border-t border-bark/[0.08] p-5 sm:border-l sm:border-t-0">
          <p className="text-[13px] text-charcoal-soft">Held for work in progress</p>
          <p className="num mt-2 font-serif text-[32px] leading-none text-forest-deep">{balance.reserved}</p>
        </div>
        <div className="border-t border-bark/[0.08] p-5 sm:border-l sm:border-t-0">
          <p className="text-[13px] text-charcoal-soft">Spent to date</p>
          <p className="num mt-2 font-serif text-[32px] leading-none text-forest-deep">{spent}</p>
        </div>
      </section>
      {(check.available !== balance.available || check.reserved !== balance.reserved) && (
        <p role="alert" className="mt-3 text-[13px] text-clay">The cached balance differs from the ledger. The ledger is the record; contact support.</p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="text-base font-medium text-charcoal">History</h2>
          {entries.length === 0 ? (
            <p className="mt-3 text-sm text-charcoal-soft">No credit movements yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="border-b border-bark/10 text-xs text-muted">
                    <th className="pb-2 pr-3 font-medium">When</th>
                    <th className="pb-2 pr-3 font-medium">What</th>
                    <th className="pb-2 pr-3 font-medium">For</th>
                    <th className="pb-2 text-right font-medium">Credits</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bark/[0.06]">
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap py-2.5 pr-3 text-xs text-muted">{e.createdAt.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                      <td className="py-2.5 pr-3 text-charcoal">{KIND_LABEL[e.kind as CreditKind] ?? e.kind}<span className="block text-xs text-muted">{e.note}</span></td>
                      <td className="py-2.5 pr-3 text-[13px]">
                        {e.campaignId ? (
                          <Link href={`/app/campaigns/${e.campaignId}`} className="text-forest hover:text-forest-deep">{campaignName.get(e.campaignId) ?? "Campaign"}</Link>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="num py-2.5 text-right font-mono text-[13px] text-charcoal">{signed(e.kind, e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card>
          <h2 className="text-base font-medium text-charcoal">How credits work</h2>
          <ul className="mt-3 space-y-2 text-[13px] leading-5 text-charcoal-soft">
            <li>Writing drafts costs {PRICING.base} credit per run, {PRICING.perDraft} per draft and {PRICING.perExtraChannel} per extra channel. The cost is shown before you approve a strategy.</li>
            <li>Credits are held when work starts and spent only for drafts that exist. If a run stops early, the rest is returned.</li>
            <li>A retried run is never charged twice.</li>
            <li>Strategies, analysis, export and recording live links cost nothing.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
