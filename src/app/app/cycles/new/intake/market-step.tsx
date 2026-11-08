"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight, Loader2, MessageSquare, Sparkles, TrendingDown, TrendingUp, Users, Swords } from "lucide-react";
import { Button, Card } from "@/components/ui";
import type { MarketResearch } from "@/lib/research/types";
import type { TrendsReport } from "@/lib/research/trends/types";
import { StepFooter } from "./parts";

export type MarketTab = "opportunities" | "competitors" | "conversations" | "signals" | "trending";

/** The angle the founder picked for the first cycle, from an opportunity or a content idea. */
export type Angle = { source: "opportunity" | "idea"; title: string; detail: string };

type Highlight = { tab: MarketTab; icon: ReactNode; label: string; headline: string; detail: string };

/** Four headline findings, each one a door into its tab. Built only from what was found. */
export function briefing(research: MarketResearch | null, trends: TrendsReport | null): Highlight[] {
  if (!research) return [];
  const out: Highlight[] = [];
  const top = research.opportunities[0];
  if (top) out.push({ tab: "opportunities", icon: <Sparkles size={15} />, label: "Best place to start", headline: top.title, detail: top.firstStep || top.rationale });
  const rival = research.competitors.find((c) => c.verified) ?? research.competitors[0];
  if (rival) {
    out.push({
      tab: "competitors",
      icon: <Swords size={15} />,
      label: research.competitors.length > 1 ? `${research.competitors.length} competitors` : "Your competitor",
      headline: rival.name,
      detail: rival.tagline ? `“${rival.tagline}”` : rival.reason || (rival.verified ? "Read from their site" : "Couldn't read their site"),
    });
  }
  const thread = research.conversations[0];
  if (thread) {
    out.push({
      tab: "conversations",
      icon: <MessageSquare size={15} />,
      label: "Most discussed",
      headline: thread.title,
      detail: `${thread.points} ${thread.source === "hacker_news" ? "points" : "votes"} · ${thread.comments} ${thread.source === "hacker_news" ? "comments" : "answers"}`,
    });
  }
  if (research.leads.length) {
    out.push({ tab: "signals", icon: <Users size={15} />, label: `${research.leads.length} ${research.leads.length === 1 ? "person" : "people"} in the market`, headline: `“${research.leads[0].excerpt}”`, detail: `${research.leads[0].author || "Someone"}, about ${research.leads[0].about}` });
  }
  const interest = trends?.interest.find((s) => s.change !== null);
  if (interest && out.length < 4) {
    const up = (interest.change ?? 0) >= 0;
    out.push({
      tab: "trending",
      icon: up ? <TrendingUp size={15} /> : <TrendingDown size={15} />,
      label: "Interest, last 3 months",
      headline: `${interest.label} ${up ? "+" : ""}${interest.change}%`,
      detail: "Wikipedia page views against the 3 months before",
    });
  }
  return out.slice(0, 4);
}

export function MarketStep({
  research,
  researchState,
  trends,
  trendsState,
  canScan,
  angle,
  onScan,
  onBack,
  onContinue,
  renderTab,
  counts,
}: {
  research: MarketResearch | null;
  researchState: "idle" | "running" | "ready" | "failed";
  trends: TrendsReport | null;
  trendsState: "idle" | "running" | "ready" | "failed";
  canScan: boolean;
  angle: Angle | null;
  onScan: () => void;
  onBack: () => void;
  onContinue: () => void;
  /** The chapter for a tab (competitors, conversations, people, opportunities, trending). */
  renderTab: (tab: MarketTab) => ReactNode;
  counts: Record<MarketTab, number>;
}) {
  const [tab, setTab] = useState<MarketTab>("opportunities");
  const highlights = briefing(research, trends);
  const running = researchState === "running";
  const TABS: { key: MarketTab; label: string }[] = [
    { key: "opportunities", label: "Opportunities" },
    { key: "competitors", label: "Competitors" },
    { key: "conversations", label: "Conversations" },
    { key: "signals", label: "People" },
    { key: "trending", label: "Trending" },
  ];
  const open = (t: MarketTab) => {
    setTab(t);
    document.getElementById("market-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-serif text-[28px] leading-tight tracking-[-0.015em] text-forest-deep sm:text-[32px]">Your market, in brief.</h2>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-charcoal-soft">
          Who you compete with, where your buyers talk, who&apos;s already asking, and where to start. Every finding links to its source.
          Pick one opportunity or idea as the angle for your first cycle.
        </p>
      </header>

      {!canScan && !research ? (
        <Card>
          <p className="text-[14px] leading-relaxed text-charcoal-soft">
            Banyan maps your market from your website, and this profile was written by hand. You can start the cycle now, or go back and read your site
            to get competitors, conversations and opportunities.
          </p>
        </Card>
      ) : running && !research ? (
        <Card className="p-5">
          <div className="flex items-center gap-3" role="status">
            <Loader2 size={16} className="animate-spin text-forest motion-reduce:animate-none" aria-hidden="true" />
            <p className="text-[14px] text-charcoal-soft">
              <span className="font-medium text-charcoal">Still mapping your market.</span> Reading competitors&apos; sites and public conversations; usually under a minute.
            </p>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-bark/[0.06] motion-reduce:animate-none" />
            ))}
          </div>
        </Card>
      ) : researchState === "failed" && !research ? (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[14px] text-clay">The market scan couldn&apos;t finish. Your product profile is safe.</p>
          <Button type="button" variant="secondary" size="sm" onClick={onScan}>Try again</Button>
        </Card>
      ) : (
        <>
          {highlights.length > 0 && (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {highlights.map((h) => (
                <li key={h.tab}>
                  <button
                    type="button"
                    onClick={() => open(h.tab)}
                    className="group flex h-full w-full flex-col gap-1.5 rounded-2xl border border-bark/10 bg-white p-4 text-left transition hover:border-forest/30 hover:shadow-[0_6px_20px_-12px_rgba(14,42,33,0.25)]"
                  >
                    <span className="flex items-center gap-1.5 text-[12px] font-medium text-moss">
                      <span aria-hidden="true">{h.icon}</span> {h.label}
                    </span>
                    <span className="line-clamp-2 font-serif text-[17px] leading-snug text-forest-deep">{h.headline}</span>
                    <span className="line-clamp-2 text-[13px] leading-5 text-muted">{h.detail}</span>
                    <span className="mt-auto inline-flex items-center gap-1 pt-1 text-[12px] font-medium text-forest opacity-80 group-hover:opacity-100">
                      See all <ArrowRight size={12} aria-hidden="true" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div id="market-tabs" className="scroll-mt-6 space-y-4">
            <div role="tablist" aria-label="Market" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {TABS.map((t) => {
                const selected = t.key === tab;
                const busy = t.key === "trending" ? trendsState === "running" : running;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls="market-panel"
                    onClick={() => setTab(t.key)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${
                      selected ? "border-forest-deep bg-forest-deep text-ivory" : "border-bark/15 bg-white text-charcoal-soft hover:border-forest/30"
                    }`}
                  >
                    {t.label}
                    {busy ? (
                      <Loader2 size={11} className="animate-spin motion-reduce:animate-none" aria-label="loading" />
                    ) : (
                      <span className={`rounded-full px-1.5 text-[11px] leading-4 tabular-nums ${selected ? "bg-ivory/20" : "bg-bark/[0.07]"}`}>{counts[t.key]}</span>
                    )}
                  </button>
                );
              })}
            </div>
            <div id="market-panel" role="tabpanel">
              {renderTab(tab)}
            </div>
          </div>
        </>
      )}

      <StepFooter
        onBack={onBack}
        hint={
          angle ? (
            <span>
              Angle: <span className="font-medium text-charcoal">{angle.title}</span>
            </span>
          ) : (
            "Pick an opportunity or idea as your angle, or continue and write your own."
          )
        }
        primary={
          <Button type="button" onClick={onContinue} className="h-10 rounded-xl px-4">
            Plan the first cycle <ArrowRight size={15} aria-hidden="true" />
          </Button>
        }
      />
    </div>
  );
}
