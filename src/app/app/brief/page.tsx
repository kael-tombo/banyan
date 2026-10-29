import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireWorkspaceServer } from "@/lib/workspace";
import { Badge, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { ArrowRight, CheckCircle2, ClipboardList, Compass, ShieldCheck, TriangleAlert } from "lucide-react";
import {
  buildBriefCards,
  buildEvidenceRows,
  computeBriefCompleteness,
  PROVENANCE_META,
  type Provenance,
} from "@/lib/product-brief";

export const dynamic = "force-dynamic";
export const metadata = { title: "Product & Audience" };

export default async function ProductAudiencePage() {
  const ctx = await requireWorkspaceServer();
  const wid = ctx.workspace.id;

  const [profile, facts, insights] = await Promise.all([
    prisma.productProfile.findUnique({ where: { workspaceId: wid } }),
    prisma.profileFact.findMany({ where: { workspaceId: wid }, orderBy: { updatedAt: "asc" } }),
    prisma.audienceInsight.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: "desc" } }),
  ]);

  const factInputs = facts.map((f) => ({ id: f.id, category: f.category, value: f.value, provenance: f.provenance, source: f.source, confidence: f.confidence }));
  const cards = buildBriefCards(
    {
      name: profile?.name ?? null,
      description: profile?.description ?? null,
      problem: profile?.problem ?? null,
      valueProp: profile?.valueProp ?? null,
      audience: profile?.audience ?? null,
      market: profile?.market ?? null,
      positioning: profile?.positioning ?? null,
      goal: profile?.goal ?? null,
    },
    factInputs,
  );
  const completeness = computeBriefCompleteness({
    profileValues: [
      profile?.name, profile?.description, profile?.problem, profile?.valueProp,
      profile?.audience, profile?.market, profile?.positioning, profile?.goal,
    ],
    audienceInsightCount: insights.length,
    facts: factInputs,
  });
  const evidenceRows = buildEvidenceRows(factInputs, insights.map((i) => ({ id: i.id, title: i.title, source: i.source, confidence: i.confidence })));

  return (
    <>
      <PageHeader
        title="Product & Audience"
        description="A shared, evidence-backed brief that your growth agents use. Every claim shows where it came from — verified facts, observed signals, or assumptions still to validate."
        actions={
          <>
            <LinkButton href="/app/workspace" variant="secondary" size="sm">Edit profile</LinkButton>
            <LinkButton href="/app/context" variant="secondary" size="sm">Add fact</LinkButton>
          </>
        }
      />

      {/* ————— Brief health ————— */}
      <Card className="rooted">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-3">
            <span className="font-serif text-3xl text-forest-deep">{completeness.percent}%</span>
            <div>
              <p className="text-sm font-medium text-charcoal">Brief complete</p>
              <p className="text-xs text-charcoal-soft">{completeness.filledUnits} of {completeness.totalUnits} sections filled — profile form plus audience insights.</p>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:border-l sm:border-bark/10 sm:pl-4">
            <ShieldCheck size={18} className="text-forest" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-charcoal">{completeness.verifiedCount} verified fact{completeness.verifiedCount === 1 ? "" : "s"}</p>
              <p className="text-xs text-charcoal-soft">Confirmed against a source in Context.</p>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:border-l sm:border-bark/10 sm:pl-4">
            <TriangleAlert size={18} className={completeness.assumptionsToValidate > 0 ? "text-fig" : "text-bark/40"} aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-charcoal">
                {completeness.assumptionsToValidate} assumption{completeness.assumptionsToValidate === 1 ? "" : "s"} to validate
              </p>
              <p className="text-xs text-charcoal-soft">
                {completeness.assumptionsToValidate > 0 ? "Recorded as hypotheses — validate before claiming them publicly." : "Nothing is waiting on you."}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {completeness.percent === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="The brief starts empty — on purpose"
            body="Fill the product profile and record what you actually know about your audience. Agents generate from this brief, so it holds only claims you can stand behind."
            icon={<ClipboardList size={22} className="text-forest" />}
            action={<LinkButton href="/onboarding">Fill the product profile</LinkButton>}
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {/* ————— The six brief cards ————— */}
          <div className="lg:col-span-2">
            <div className="grid gap-4 sm:grid-cols-2">
              {cards.map((card) => (
                <Card key={card.key} className={card.value ? "" : "border-dashed"}>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-medium text-charcoal">{card.label}</h2>
                    <Badge variant={PROVENANCE_META[card.provenance].badge}>{PROVENANCE_META[card.provenance].label}</Badge>
                  </div>
                  <p className={`mt-2 text-sm leading-relaxed ${card.value ? "text-charcoal" : "text-charcoal-soft"}`}>
                    {card.value ?? "Not recorded yet — the brief only grows from what you actually know."}
                  </p>
                  <div className="mt-3 flex items-center justify-between border-t border-bark/10 pt-2 text-xs text-charcoal-soft">
                    <span>{card.sources > 0 ? `${card.sources} recorded source${card.sources === 1 ? "" : "s"}` : "no separate sources yet"}</span>
                    <Link href={card.editHref} className="font-medium text-forest hover:underline">Edit →</Link>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* ————— Audience segments ————— */}
          <div className="space-y-6">
            <Card>
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-medium text-charcoal">Audience insights</h2>
                <LinkButton href="/app/audience" variant="secondary" size="sm">Add</LinkButton>
              </div>
              {insights.length === 0 ? (
                <p className="mt-2 text-sm text-charcoal-soft">
                  No audience insights recorded yet. Interview notes, observed behaviour and research all belong here — with their confidence stated.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {insights.slice(0, 5).map((i) => (
                    <li key={i.id} className="rounded-[3px] border border-bark/15 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-charcoal">{i.title}</p>
                        <Badge variant={i.confidence === "high" ? "forest" : "warm"}>{i.confidence}</Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-charcoal-soft">{i.body}</p>
                      <p className="mt-1.5 text-[11px] text-charcoal-soft/75">{i.source.replace(/_/g, " ")}</p>
                    </li>
                  ))}
                  {insights.length > 5 && (
                    <li>
                      <Link href="/app/audience" className="text-xs font-medium text-forest hover:underline">
                        View all {insights.length} insights →
                      </Link>
                    </li>
                  )}
                </ul>
              )}
            </Card>

            <div className="rounded-[3px] border border-forest/20 bg-forest/[0.05] p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-forest-deep">
                <Compass size={15} className="text-forest" aria-hidden="true" /> Why provenance matters
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-charcoal-soft">
                Agents draft copy, plans and recommendations from this brief. A claim marked{" "}
                <Badge variant="clay">Assumption</Badge> is treated as unproven; a claim marked{" "}
                <Badge variant="forest">Verified</Badge> can be stated publicly. The brief never upgrades itself — you do, in Context.
              </p>
            </div>

            <Card>
              <p className="text-sm font-medium text-charcoal">Live research is not connected yet</p>
              <p className="mt-1.5 text-xs leading-relaxed text-charcoal-soft">
                Web research is an unshipped capability, so this page does not offer an &quot;ask agents to refresh&quot; button —
                it would imply evidence the system does not have. The brief grows from what you record, and from agent analysis of that.
              </p>
            </Card>
          </div>
        </div>
      )}

      {/* ————— Evidence & assumptions table ————— */}
      {evidenceRows.length > 0 && (
        <Card className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium text-charcoal">Evidence &amp; assumptions</h2>
            <Link href="/app/context" className="text-xs font-medium text-forest hover:underline">
              Manage in Context <ArrowRight size={12} className="inline" aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-bark/15 text-xs uppercase tracking-wide text-charcoal-soft">
                  <th className="pb-2 pr-3 font-medium">Statement</th>
                  <th className="pb-2 pr-3 font-medium">Type</th>
                  <th className="pb-2 pr-3 font-medium">Source</th>
                  <th className="pb-2 pr-3 font-medium">Confidence</th>
                  <th className="pb-2 pr-3 font-medium">Status</th>
                  <th className="pb-2 font-medium">Next step</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bark/10">
                {evidenceRows.map((row) => (
                  <tr key={row.key}>
                    <td className="max-w-[16rem] py-2.5 pr-3 text-charcoal">{row.statement}</td>
                    <td className="py-2.5 pr-3"><Badge variant="charcoal">{row.type}</Badge></td>
                    <td className="py-2.5 pr-3 text-xs text-charcoal-soft">{row.source}</td>
                    <td className="py-2.5 pr-3 text-xs text-charcoal">{row.confidence}</td>
                    <td className="py-2.5 pr-3">
                      <span className="inline-flex items-center gap-1">
                        {row.status === "verified" && <CheckCircle2 size={12} className="text-forest" aria-hidden="true" />}
                        <Badge variant={PROVENANCE_META[row.status as Provenance].badge}>
                          {PROVENANCE_META[row.status as Provenance].label}
                        </Badge>
                      </span>
                    </td>
                    <td className="py-2.5">
                      {row.nextStep ? (
                        <Link href={row.nextStep.href} className="text-xs font-medium text-forest hover:underline">{row.nextStep.label} →</Link>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-charcoal-soft">
                          <CheckCircle2 size={12} className="text-forest" aria-hidden="true" /> none
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
