"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight, Check, ExternalLink, Loader2, MessageSquare, Plus, RefreshCw, Search, X } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";
import type { Competitor, Conversation, LeadSignal, MarketResearch, Opportunity } from "@/lib/research/types";
import { ListField, Section } from "./parts";

export type ResearchState = "idle" | "running" | "ready" | "failed";

const SOURCE_LABEL: Record<Conversation["source"], string> = { hacker_news: "Hacker News", stack_overflow: "Stack Overflow" };

const INTENT: Record<LeadSignal["intent"], { label: string; tone: string }> = {
  alternative_to: { label: "Looking for an alternative", tone: "bg-fig/[0.12] text-fig-deep" },
  frustrated: { label: "Frustrated with a tool", tone: "bg-clay/[0.08] text-clay" },
  looking_for_tool: { label: "Asking for a recommendation", tone: "bg-moss/[0.1] text-forest" },
  comparing: { label: "Comparing tools", tone: "bg-bark/[0.07] text-charcoal-soft" },
  asking_how: { label: "Stuck on the problem", tone: "bg-moss/[0.1] text-forest" },
};

const KIND_LABEL: Record<Opportunity["kind"], string> = {
  conversation: "Join a conversation",
  competitor_gap: "Competitor gap",
  positioning: "Positioning",
  proof: "Proof",
  channel: "Channel",
  content: "Content",
};

function when(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Shimmer rows while the scan runs, so each chapter has a shape. */
function Pending({ rows = 3, label }: { rows?: number; label: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-xl border border-bark/10 p-3">
          <div className="h-2.5 w-2/5 animate-pulse rounded bg-bark/10 motion-reduce:animate-none" />
          <div className="mt-2 h-2.5 w-4/5 animate-pulse rounded bg-bark/10 motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-bark/15 px-4 py-3 text-[13px] leading-5 text-muted">{children}</p>;
}

function CompetitorCard({ c, onRemove }: { c: Competitor; onRemove: () => void }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const badge =
    c.source === "added"
      ? { text: "Added by you", cls: "bg-forest/[0.08] text-forest" }
      : c.verified
        ? { text: c.source === "named_on_site" ? "On your site · read theirs" : "Read from their site", cls: "bg-moss/[0.09] text-forest" }
        : c.source === "named_on_site"
          ? { text: "On your site · couldn't read theirs", cls: "bg-bark/[0.07] text-charcoal-soft" }
          : { text: "Suggested · couldn't confirm", cls: "bg-fig/[0.12] text-fig-deep" };
  return (
    <li className="group relative flex flex-col gap-2 rounded-xl border border-bark/12 bg-white p-4">
      <div className="flex items-start gap-3">
        {c.logo && !logoFailed ? (
          // eslint-disable-next-line @next/next/no-img-element -- third-party logo of unknown size
          <img src={c.logo} alt="" referrerPolicy="no-referrer" onError={() => setLogoFailed(true)} className="h-9 w-9 shrink-0 rounded-lg border border-bark/10 bg-white object-contain p-1" />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bark/[0.07] font-serif text-base text-charcoal-soft" aria-hidden="true">
            {(c.name[0] ?? "?").toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-charcoal">{c.name}</p>
          {c.url && (
            <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-forest">
              {host(c.url)} <ExternalLink size={10} aria-hidden="true" />
            </a>
          )}
        </div>
        <button type="button" onClick={onRemove} aria-label={`Remove ${c.name}`} className="rounded-md p-1 text-muted opacity-70 transition hover:bg-bark/10 hover:text-charcoal hover:opacity-100">
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <span className={`self-start whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium ${badge.cls}`}>{badge.text}</span>
      {(c.tagline || c.description) && <p className="text-[13px] leading-5 text-charcoal-soft">“{c.tagline || c.description}”</p>}
      {!c.verified && c.reason && <p className="text-[12px] leading-5 text-muted">{c.reason}</p>}
      {(c.pricing || c.cta) && (
        <dl className="mt-auto grid gap-1 border-t border-bark/10 pt-2 text-[12px]">
          {c.pricing && (
            <div className="flex gap-2"><dt className="shrink-0 text-muted">Pricing</dt><dd className="min-w-0 truncate text-charcoal-soft" title={c.pricing}>{c.pricing}</dd></div>
          )}
          {c.cta && (
            <div className="flex gap-2"><dt className="shrink-0 text-muted">Their ask</dt><dd className="text-charcoal-soft">{c.cta}</dd></div>
          )}
        </dl>
      )}
    </li>
  );
}

function AddCompetitor({ onAdd }: { onAdd: (name: string, url: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex h-full min-h-[120px] w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-bark/20 text-[13px] text-charcoal-soft transition hover:border-forest/40 hover:text-forest">
        <Plus size={14} aria-hidden="true" /> Add a competitor
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-forest/25 bg-forest/[0.02] p-3">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Competitor name" maxLength={80} autoFocus />
      <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="their-site.com" aria-label="Competitor website" inputMode="url" maxLength={200} />
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={!name.trim()} onClick={() => { onAdd(name.trim(), url.trim()); setName(""); setUrl(""); setOpen(false); }}>Add</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

function OpportunityCard({ o, kept, onToggle, onUse }: { o: Opportunity; kept: boolean; onToggle: () => void; onUse: () => void }) {
  return (
    <li className={`flex flex-col gap-3 rounded-xl border p-4 transition-colors ${kept ? "border-forest/25 bg-white" : "border-bark/10 bg-ivory/40 opacity-70"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-sage/50 px-1.5 py-0.5 text-[11px] font-medium text-forest-deep">{KIND_LABEL[o.kind]}</span>
        <span className="text-[11px] text-muted">{o.confidence} confidence</span>
        <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 text-[12px] text-charcoal-soft">
          <input type="checkbox" checked={kept} onChange={onToggle} className="h-3.5 w-3.5 accent-[#23523f]" /> Keep
        </label>
      </div>
      <p className="font-serif text-[17px] leading-snug text-forest-deep">{o.title}</p>
      <p className="text-[13px] leading-5 text-charcoal-soft">{o.rationale}</p>
      {o.firstStep && (
        <p className="rounded-lg bg-ivory/70 px-3 py-2 text-[13px] leading-5 text-charcoal">
          <span className="font-medium">First step: </span>
          {o.firstStep}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted">Based on</span>
        {o.evidence.slice(0, 4).map((e, i) =>
          e.url ? (
            <a key={i} href={e.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-[220px] items-center gap-1 truncate rounded-md bg-bark/[0.06] px-1.5 py-0.5 text-[11px] text-charcoal-soft hover:text-forest" title={e.label}>
              <span className="truncate">{e.label}</span> <ExternalLink size={9} className="shrink-0" aria-hidden="true" />
            </a>
          ) : (
            <span key={i} className="max-w-[220px] truncate rounded-md bg-bark/[0.06] px-1.5 py-0.5 text-[11px] text-charcoal-soft" title={e.label}>{e.label}</span>
          ),
        )}
      </div>
      <button type="button" onClick={onUse} className="inline-flex items-center gap-1 self-start text-[13px] font-medium text-forest hover:underline">
        Make this my first cycle <ArrowRight size={13} aria-hidden="true" />
      </button>
    </li>
  );
}

export function MarketSections({
  startIndex,
  state,
  research,
  canScan,
  competitors,
  onCompetitorsChange,
  queries,
  onQueriesChange,
  kept,
  onToggleKept,
  onScan,
  onUseOpportunity,
  dirty,
  only,
}: {
  startIndex: number;
  state: ResearchState;
  research: MarketResearch | null;
  canScan: boolean;
  competitors: Competitor[];
  onCompetitorsChange: (c: Competitor[]) => void;
  queries: string[];
  onQueriesChange: (q: string[]) => void;
  kept: Set<string>;
  onToggleKept: (id: string) => void;
  onScan: () => void;
  onUseOpportunity: (o: Opportunity) => void;
  /** The founder changed competitors or search terms since the last scan. */
  dirty: boolean;
  /** Render one chapter only (the onboarding market step shows each in its own tab). */
  only?: "competitors" | "conversations" | "signals" | "opportunities";
}) {
  const show = (k: "competitors" | "conversations" | "signals" | "opportunities") => !only || only === k;
  const running = state === "running";
  const failedSources = research?.sources.filter((s) => !s.ok).map((s) => s.name) ?? [];

  if (!canScan && !research) {
    return (
      <Card>
        <Section index={startIndex} id="sec-market" title="Your market" lede="Competitors, conversations, people looking for this, and where to start.">
          <Empty>Banyan maps your market from your website. Go back and read your site to see competitors, conversations and opportunities here.</Empty>
        </Section>
      </Card>
    );
  }

  const rescan = (
    <Button type="button" size="sm" variant={dirty ? "primary" : "secondary"} onClick={onScan} disabled={running}>
      {running ? <Loader2 size={13} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <RefreshCw size={13} aria-hidden="true" />}
      {running ? "Scanning…" : dirty ? "Rescan with my changes" : "Rescan"}
    </Button>
  );

  return (
    <Card>
      {running && (
        <div className="-mx-6 -mt-6 mb-6 flex items-center gap-3 rounded-t-2xl border-b border-bark/10 bg-mist/70 px-6 py-3" role="status">
          <Loader2 size={15} className="shrink-0 animate-spin text-forest motion-reduce:animate-none" aria-hidden="true" />
          <p className="text-[13px] text-charcoal-soft">
            <span className="font-medium text-charcoal">Scanning your market:</span> reading competitors&apos; sites, searching Hacker News and Stack Overflow. Usually 20–45 seconds; keep editing above meanwhile.
          </p>
        </div>
      )}
      {state === "failed" && (
        <div className="-mx-6 -mt-6 mb-6 flex flex-wrap items-center justify-between gap-3 rounded-t-2xl border-b border-clay/15 bg-clay/[0.04] px-6 py-3" role="alert">
          <p className="text-[13px] text-clay">The market scan couldn&apos;t finish. Your product profile is safe.</p>
          <Button type="button" size="sm" variant="secondary" onClick={onScan}>Try again</Button>
        </div>
      )}

      <div className="space-y-8">
        {show("competitors") && (
        <Section
          index={only ? undefined : startIndex}
          id="sec-competitors"
          title="Competitors"
          lede="Who a buyer compares you with. Banyan reads each one's own website; nothing here is written from memory."
          action={rescan}
        >
          {running && !research ? (
            <Pending rows={2} label="Reading competitors' websites" />
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {competitors.map((c) => (
                <CompetitorCard key={c.id} c={c} onRemove={() => onCompetitorsChange(competitors.filter((x) => x.id !== c.id))} />
              ))}
              <li className="list-none">
                <AddCompetitor
                  onAdd={(name, url) =>
                    onCompetitorsChange([
                      ...competitors,
                      { id: `c:added:${name.toLowerCase()}`, name, url: url ? (/^https?:\/\//i.test(url) ? url : `https://${url}`) : "", source: "added", reason: "", verified: false, tagline: "", description: "", pricing: "", cta: "", logo: "" },
                    ])
                  }
                />
              </li>
            </ul>
          )}
        </Section>
        )}

        {show("conversations") && (
        <Section
          index={only ? undefined : startIndex + 1}
          id="sec-conversations"
          title="Where your market talks"
          lede="Recent, well-discussed public threads about your category and competitors. Good places to listen, and to answer."
        >
          <div className="flex flex-col gap-2 rounded-xl bg-ivory/50 p-3">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-charcoal-soft">
              <Search size={12} aria-hidden="true" /> Search terms
            </p>
            <ListField label="Search terms" items={queries} onChange={onQueriesChange} placeholder="Add a term people would search, e.g. invoice reminders" max={5} />
          </div>
          {running && !research ? (
            <Pending rows={3} label="Searching public conversations" />
          ) : research && research.conversations.length > 0 ? (
            <ul className="divide-y divide-bark/10 rounded-xl border border-bark/10">
              {research.conversations.map((c) => (
                <li key={c.id}>
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-3 px-4 py-3 transition hover:bg-ivory/60">
                    <MessageSquare size={15} className="mt-0.5 shrink-0 text-moss" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-charcoal group-hover:text-forest">{c.title}</span>
                      <span className="mt-0.5 block text-[12px] text-muted">
                        {SOURCE_LABEL[c.source]} · {c.points} {c.source === "hacker_news" ? "points" : "votes"} · {c.comments} {c.source === "hacker_news" ? "comments" : "answers"}
                        {when(c.createdAt) && ` · ${when(c.createdAt)}`} · found by “{c.query}”
                      </span>
                    </span>
                    <ExternalLink size={12} className="mt-1 shrink-0 text-muted" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          ) : research ? (
            <Empty>
              No recent, relevant threads for these terms
              {failedSources.length ? ` (${failedSources.join(", ")} didn't answer)` : ""}. Try the words your buyers use, then rescan.
            </Empty>
          ) : null}
        </Section>
        )}

        {show("signals") && (
        <Section
          index={only ? undefined : startIndex + 2}
          id="sec-signals"
          title="People in the market"
          lede="Public posts where someone wants an alternative, complains about a competitor, or asks for a tool like yours."
        >
          {running && !research ? (
            <Pending rows={2} label="Finding people asking for this" />
          ) : research && research.leads.length > 0 ? (
            <>
              <ul className="grid grid-cols-1 gap-3">
                {research.leads.map((l) => (
                  <li key={l.id} className="rounded-xl border border-bark/12 bg-white p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${INTENT[l.intent].tone}`}>{INTENT[l.intent].label}</span>
                      <span className="text-[11px] text-muted">about {l.about}</span>
                    </div>
                    <blockquote className="mt-2 border-l-2 border-sage pl-3 text-[14px] leading-relaxed text-charcoal">{l.excerpt}</blockquote>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
                      <span>
                        {l.author || "Someone"} on {SOURCE_LABEL[l.source]}
                        {when(l.createdAt) && ` · ${when(l.createdAt)}`}
                      </span>
                      <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-forest hover:underline">
                        Open the post <ExternalLink size={11} aria-hidden="true" />
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-[12px] leading-5 text-muted">
                Reply where you can genuinely help, in your own words. Banyan never contacts anyone for you, and keeps no data about these people.
              </p>
            </>
          ) : research ? (
            <Empty>No public posts asking for this turned up on Hacker News{research.sources.some((s) => s.name === "Stack Overflow") ? " or Stack Overflow" : ""} in the last two years. Normal for a new or niche category; add a competitor or a search term and rescan.</Empty>
          ) : null}
        </Section>
        )}

        {show("opportunities") && (
        <Section
          index={only ? undefined : startIndex + 3}
          id="sec-opportunities"
          title="Opportunities"
          lede="Where to start, each one resting on something above. Keep the ones you like; they're saved to your Opportunities."
        >
          {running && !research ? (
            <Pending rows={3} label="Drafting opportunities" />
          ) : research && research.opportunities.length > 0 ? (
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {research.opportunities.map((o) => (
                <OpportunityCard key={o.id} o={o} kept={kept.has(o.id)} onToggle={() => onToggleKept(o.id)} onUse={() => onUseOpportunity(o)} />
              ))}
            </ul>
          ) : research ? (
            <Empty>Not enough evidence yet for a recommendation. Add competitors or search terms and rescan.</Empty>
          ) : null}
          {research && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
              <span>{research.method === "model" ? "Opportunities written by Banyan's model from the evidence it cites." : "Opportunities from fixed rules (no model configured)."}</span>
              {research.sources.map((s) => (
                <span key={s.name} className="inline-flex items-center gap-1">
                  {s.ok ? <Check size={11} className="text-forest" aria-hidden="true" /> : <X size={11} className="text-clay" aria-hidden="true" />}
                  {s.name}
                </span>
              ))}
            </p>
          )}
        </Section>
        )}
      </div>
    </Card>
  );
}
