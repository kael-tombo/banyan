import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { Badge, Card, PageHeader } from "@/components/ui";
import { accessibleProducts } from "@/lib/products";
import { loadOverview } from "@/lib/org-overview";
import { productTypeLabel } from "@/lib/organizations";
import { OpenProduct } from "./open-product";

export const metadata: Metadata = { title: "All products" };
export const dynamic = "force-dynamic";

const PERIODS = [7, 14, 30] as const;
const fmt = (v: number | null) => (v === null ? "—" : v.toLocaleString());

function Total({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[13px] text-charcoal-soft">{label}</p>
      <p className="num mt-1 font-serif text-[26px] leading-none text-forest-deep">{value}</p>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </div>
  );
}

/** BOS-014: the founder command center — every product this person can reach in the active organization. */
export default async function OrganizationPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const ctx = await requireWorkspaceServer();
  const { days: raw } = await searchParams;
  const days = PERIODS.includes(Number(raw) as (typeof PERIODS)[number]) ? Number(raw) : 14;
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.workspace.organizationId }, select: { name: true } });
  const all = await accessibleProducts(ctx.user.id);
  const inOrg = all.filter((p) => p.workspace.organizationId === ctx.workspace.organizationId);
  const archived = inOrg.filter((p) => p.workspace.status === "archived").length;
  const o = await loadOverview(inOrg, days);
  const t = o.totals;
  const activeId = ctx.workspace.id;

  return (
    <>
      <PageHeader
        eyebrow={org.name}
        title="All products"
        description="Where each product stands, side by side. Every figure comes from recorded rows; a dash means nothing measures it yet."
        actions={
          <nav aria-label="Period" className="inline-flex rounded-[10px] bg-bark/[0.07] p-1">
            {PERIODS.map((d) => (
              <Link
                key={d}
                href={`/app/organization?days=${d}`}
                aria-current={d === days ? "page" : undefined}
                className={`rounded-lg px-3 py-1 text-[13px] ${d === days ? "bg-white font-medium text-charcoal shadow-sm" : "text-charcoal-soft hover:text-charcoal"}`}
              >
                {d} days
              </Link>
            ))}
          </nav>
        }
      />

      <section aria-label="Organization totals" className="card-shadow grid grid-cols-2 overflow-hidden rounded-2xl border border-bark/10 bg-white sm:grid-cols-3 lg:grid-cols-6">
        <Total label="Products" value={String(t.products)} note={archived ? `${archived} archived not shown` : "active"} />
        <Total label="Waiting on you" value={String(t.waiting)} note="drafts, strategies, gates" />
        <Total label="Active cycles" value={String(t.activeCycles)} note="planning or running" />
        <Total label="Published" value={String(t.published)} note={`last ${days} days`} />
        <Total label="Tracked visits" value={fmt(t.visits)} note={t.visits === null ? "not measured" : `last ${days} days`} />
        <Total label="Signups" value={fmt(t.signups)} note={t.signups === null ? "not measured" : `last ${days} days`} />
      </section>

      {t.failures > 0 && (
        <p role="alert" className="mt-4 rounded-xl border border-clay/25 bg-clay/[0.05] px-4 py-2.5 text-sm text-charcoal">
          {t.failures} publication{t.failures === 1 ? "" : "s"} failed or were blocked in the last {days} days. Open the product to see each reason.
        </p>
      )}

      <Card className="mt-4 p-0">
        {o.products.length === 0 ? (
          <p className="p-6 text-sm text-charcoal-soft">No active product in {org.name} that you can open. Create one from the product switcher.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-bark/10 text-[12px] text-charcoal-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-3 py-3 font-medium">Waiting on you</th>
                  <th className="px-3 py-3 font-medium">Active cycle</th>
                  <th className="px-3 py-3 text-right font-medium">Published</th>
                  <th className="px-3 py-3 text-right font-medium">Failed</th>
                  <th className="px-3 py-3 text-right font-medium">Visits</th>
                  <th className="px-3 py-3 text-right font-medium">Signups</th>
                  <th className="px-4 py-3 text-right font-medium">Credits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bark/10">
                {o.products.map((p) => (
                  <tr key={p.id} className={p.id === activeId ? "bg-forest/[0.03]" : undefined}>
                    <td className="px-4 py-3">
                      <OpenProduct productId={p.id} activeId={activeId} href="/app" className="font-medium text-charcoal">
                        {p.name}
                      </OpenProduct>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                        {productTypeLabel(p.productType)}
                        {p.id === activeId && <Badge variant="forest">active</Badge>}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {p.waiting > 0 ? (
                        <OpenProduct productId={p.id} activeId={activeId} href="/app/approvals" className="font-medium text-clay">
                          {p.waiting} waiting
                        </OpenProduct>
                      ) : (
                        <span className="text-muted">nothing</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {p.cycle ? (
                        <OpenProduct productId={p.id} activeId={activeId} href={`/app/cycles/${p.cycle.id}`} className="text-charcoal">
                          <span className="block max-w-[220px] truncate">{p.cycle.objective}</span>
                          <span className="block text-xs text-muted">{Math.round(p.cycle.progress)}% · {p.cycle.deadline ? `ends ${p.cycle.deadline.toLocaleDateString()}` : "no end date"}</span>
                        </OpenProduct>
                      ) : (
                        <span className="text-muted">none</span>
                      )}
                    </td>
                    <td className="num px-3 py-3 text-right">{p.published}</td>
                    <td className={`num px-3 py-3 text-right ${p.failures ? "text-clay" : ""}`}>{p.failures}</td>
                    <td className="num px-3 py-3 text-right">{fmt(p.visits)}</td>
                    <td className="num px-3 py-3 text-right">{fmt(p.signups)}</td>
                    <td className="num px-4 py-3 text-right">{fmt(p.credits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted">
        Visits and signups come from each product&apos;s own tracked links; products without one show a dash. Credits are
        per product today and move to one organization balance with BOS-061.
      </p>
    </>
  );
}
