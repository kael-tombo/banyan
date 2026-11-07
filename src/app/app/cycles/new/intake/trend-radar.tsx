"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check, Copy, ExternalLink, KeyRound, Link2, Loader2, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { PLATFORM_LABEL, type ContentIdea, type InterestSeries, type PlatformId, type PlatformReport, type TrendItem, type TrendsReport } from "@/lib/research/trends/types";
import { Section } from "./parts";

export type TrendsState = "idle" | "running" | "ready" | "failed";

const KEY_HINT: Partial<Record<PlatformId, string>> = {
  youtube: "YOUTUBE_API_KEY",
  reddit: "REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET",
  bluesky: "BLUESKY_HANDLE and BLUESKY_APP_PASSWORD",
};

const compact = (n?: number) =>
  n === undefined ? "" : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function metrics(i: TrendItem): string {
  return [
    i.views !== undefined && `${compact(i.views)} views`,
    i.score !== undefined && (i.platform === "reddit" ? `${compact(i.score)} upvotes` : i.platform === "bluesky" ? `${compact(i.score)} reposts` : `${compact(i.score)} points`),
    i.likes !== undefined && `${compact(i.likes)} likes`,
    i.comments !== undefined && `${compact(i.comments)} comment${i.comments === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** A 12-month line, scaled to its own range; colour follows the direction of the change. */
function Sparkline({ s }: { s: InterestSeries }) {
  const w = 120;
  const h = 32;
  const values = s.months.map((m) => m.views);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${((i / Math.max(values.length - 1, 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`).join(" ");
  const up = (s.change ?? 0) >= 0;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`${s.label}: Wikipedia page views over ${values.length} months`} className="h-8 w-16 shrink-0 sm:w-[120px]">
      <polyline points={pts} fill="none" stroke={up ? "var(--color-forest)" : "var(--color-clay)"} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function StatusDot({ r }: { r: PlatformReport }) {
  if (r.status === "live" && r.items.length) return <span className="rounded-full bg-forest px-1.5 text-[10px] font-semibold leading-4 text-ivory">{r.items.length}</span>;
  if (r.status === "needs_key") return <KeyRound size={11} className="text-fig-deep" aria-label="needs a key" />;
  if (r.status === "failed") return <span className="h-1.5 w-1.5 rounded-full bg-clay" aria-label="failed" />;
  if (r.status === "no_api") return <Link2 size={11} className="text-muted" aria-label="research links" />;
  return <span className="h-1.5 w-1.5 rounded-full bg-bark/30" aria-label="nothing found" />;
}

function ItemList({ items }: { items: TrendItem[] }) {
  const video = items[0]?.platform === "youtube";
  if (video) {
    return (
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((i) => (
          <li key={i.id}>
            <a href={i.url} target="_blank" rel="noopener noreferrer" className="group flex gap-3 rounded-xl border border-bark/10 p-2 transition hover:border-forest/30 hover:bg-ivory/50">
              {i.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail, fixed 16:9 box
                <img src={i.thumbnail} alt="" referrerPolicy="no-referrer" className="aspect-video w-32 shrink-0 rounded-lg object-cover" />
              ) : null}
              <span className="min-w-0">
                <span className="line-clamp-2 text-[13px] font-medium leading-snug text-charcoal group-hover:text-forest">{i.title}</span>
                <span className="mt-1 block text-[11px] text-muted">{i.author}</span>
                <span className="block text-[11px] text-muted">{[metrics(i), when(i.publishedAt)].filter(Boolean).join(" · ")}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="divide-y divide-bark/10 rounded-xl border border-bark/10">
      {items.map((i) => (
        <li key={i.id}>
          <a href={i.url} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-3 px-4 py-3 transition hover:bg-ivory/60">
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-charcoal group-hover:text-forest">{i.title}</span>
              <span className="mt-0.5 block text-[12px] text-muted">{[i.author, metrics(i), when(i.publishedAt)].filter(Boolean).join(" · ")}</span>
            </span>
            <ExternalLink size={12} className="mt-1 shrink-0 text-muted" aria-hidden="true" />
          </a>
        </li>
      ))}
    </ul>
  );
}

function IdeaCard({ idea, onUse }: { idea: ContentIdea; onUse: () => void }) {
  const suggestion = !idea.basis[0]?.url;
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-bark/12 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-sage/50 px-1.5 py-0.5 text-[11px] font-medium text-forest-deep">{idea.format}</span>
        {suggestion ? (
          <span className="text-[11px] text-fig-deep">Suggestion: nothing found here to build on</span>
        ) : (
          <a href={idea.basis[0].url} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 text-[11px] text-muted hover:text-forest" title={idea.basis[0].label}>
            <span className="shrink-0">Builds on</span> <span className="truncate">“{idea.basis[0].label}”</span> <ExternalLink size={9} className="shrink-0" aria-hidden="true" />
          </a>
        )}
      </div>
      <p className="font-serif text-[16px] leading-snug text-forest-deep">“{idea.hook}”</p>
      <p className="text-[13px] leading-5 text-charcoal-soft">{idea.angle}</p>
      <button type="button" onClick={onUse} className="mt-auto inline-flex items-center gap-1 self-start text-[13px] font-medium text-forest hover:underline">
        Make this my first cycle <ArrowRight size={13} aria-hidden="true" />
      </button>
    </li>
  );
}

function Hashtags({ tags }: { tags: string[] }) {
  const [copied, setCopied] = useState(false);
  if (tags.length === 0) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tags.join(" "));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the tags stay selectable */
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span key={t} className="rounded-md bg-bark/[0.06] px-1.5 py-0.5 text-[12px] text-charcoal-soft">{t}</span>
      ))}
      <button type="button" onClick={copy} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-forest hover:bg-forest/[0.06]">
        {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />} {copied ? "Copied" : "Copy all"}
      </button>
    </div>
  );
}

export function TrendRadar({
  index,
  state,
  trends,
  canRun,
  googleTrends,
  onRun,
  onUseIdea,
}: {
  index?: number;
  state: TrendsState;
  trends: TrendsReport | null;
  /** The market scan has finished, so the radar has terms and competitors. */
  canRun: boolean;
  googleTrends: { label: string; url: string } | null;
  onRun: () => void;
  onUseIdea: (idea: ContentIdea) => void;
}) {
  // Platforms with live posts first, then those a key would unlock, then research-only.
  const RANK = { live: 0, failed: 1, needs_key: 2, no_api: 3 } as const;
  const platforms = [...(trends?.platforms ?? [])].sort((a, b) => (a.items.length ? 0 : 1) - (b.items.length ? 0 : 1) || RANK[a.status] - RANK[b.status]);
  const firstWithItems = platforms.find((p) => p.items.length)?.platform;
  const [picked, setPicked] = useState<PlatformId | null>(null);
  const active = picked ?? firstWithItems ?? platforms[0]?.platform ?? "youtube";
  const report = platforms.find((p) => p.platform === active);
  const ideas = useMemo(() => trends?.ideas.filter((i) => i.platform === active) ?? [], [trends, active]);
  const liveCount = platforms.filter((p) => p.status === "live").length;
  const running = state === "running";

  return (
    <Card>
      <Section
        index={index}
        id="sec-trending"
        title="What's trending"
        lede="Platform by platform: what gets attention around your product now, and what to post there. Read live where an official API allows it; one-click research where none exists."
        action={
          canRun ? (
            <Button type="button" size="sm" variant="secondary" onClick={onRun} disabled={running}>
              {running ? <Loader2 size={13} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <RefreshCw size={13} aria-hidden="true" />}
              {running ? "Scanning…" : trends ? "Refresh" : "Scan platforms"}
            </Button>
          ) : undefined
        }
      >
        {!canRun && !trends ? (
          <p className="rounded-xl border border-dashed border-bark/15 px-4 py-3 text-[13px] text-muted">The trend radar runs once your market scan has finished.</p>
        ) : running && !trends ? (
          <div aria-busy="true" aria-label="Scanning platforms" className="space-y-2">
            <div className="flex gap-2 overflow-hidden">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="h-8 w-24 shrink-0 animate-pulse rounded-full bg-bark/10 motion-reduce:animate-none" />
              ))}
            </div>
            <div className="h-24 animate-pulse rounded-xl bg-bark/[0.06] motion-reduce:animate-none" />
            <p className="text-[12px] text-muted">Reading YouTube, Reddit, Bluesky and Hacker News where connected, measuring interest, and drafting ideas per platform. Usually 15–30 seconds.</p>
          </div>
        ) : state === "failed" && !trends ? (
          <p className="rounded-xl border border-clay/20 bg-clay/[0.04] px-4 py-3 text-[13px] text-clay">The trend radar couldn&apos;t finish. Try again in a minute.</p>
        ) : trends ? (
          <>
            {/* Interest over time: a real, citable measure. */}
            {(trends.interest.length > 0 || googleTrends) && (
              <div className="rounded-xl bg-ivory/50 p-3">
                <p className="text-[12px] font-medium text-charcoal-soft">Interest over 12 months</p>
                {trends.interest.length > 0 && (
                  <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {trends.interest.map((s) => (
                      <li key={s.article} className="flex items-center gap-3 rounded-lg border border-bark/10 bg-white px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-charcoal">{s.label}</p>
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap text-[11px] text-muted hover:text-forest">
                            Wikipedia views
                          </a>
                        </div>
                        <Sparkline s={s} />
                        {s.change !== null && (
                          <span className={`inline-flex w-14 shrink-0 items-center justify-end gap-0.5 text-[12px] font-medium ${s.change >= 0 ? "text-forest" : "text-clay"}`}>
                            {s.change >= 0 ? <TrendingUp size={12} aria-hidden="true" /> : <TrendingDown size={12} aria-hidden="true" />}
                            {s.change > 0 ? "+" : ""}
                            {s.change}%
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-[11px] leading-4 text-muted">
                  Change: the last three months against the three before.{" "}
                  {googleTrends && (
                    <a href={googleTrends.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium text-forest hover:underline">
                      {googleTrends.label} <ExternalLink size={10} aria-hidden="true" />
                    </a>
                  )}
                </p>
              </div>
            )}

            {/* Platform tabs. */}
            <div role="tablist" aria-label="Platforms" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
              {platforms.map((p) => {
                const selected = p.platform === active;
                return (
                  <button
                    key={p.platform}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls="trend-panel"
                    onClick={() => setPicked(p.platform)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition ${
                      selected ? "border-forest-deep bg-forest-deep text-ivory" : "border-bark/15 bg-white text-charcoal-soft hover:border-forest/30"
                    }`}
                  >
                    {PLATFORM_LABEL[p.platform]}
                    {!selected && <StatusDot r={p} />}
                  </button>
                );
              })}
            </div>

            {report && (
              <div id="trend-panel" role="tabpanel" className="space-y-4">
                {report.note && (
                  <p className={`rounded-lg px-3 py-2 text-[12px] leading-5 ${report.status === "failed" ? "bg-clay/[0.05] text-clay" : report.status === "needs_key" ? "bg-fig/[0.08] text-fig-deep" : "bg-bark/[0.05] text-charcoal-soft"}`}>
                    {report.note}
                    {report.status === "needs_key" && KEY_HINT[report.platform] && (
                      <span className="block text-[11px] opacity-80">Server setting: {KEY_HINT[report.platform]} (see docs/ONBOARDING_360.md).</span>
                    )}
                  </p>
                )}

                {report.items.length > 0 && (
                  <div>
                    <p className="mb-2 text-[12px] font-medium text-charcoal-soft">Getting attention on {PLATFORM_LABEL[report.platform]}</p>
                    <ItemList items={report.items} />
                  </div>
                )}

                {ideas.length > 0 && (
                  <div>
                    <p className="mb-2 text-[12px] font-medium text-charcoal-soft">What to post on {PLATFORM_LABEL[report.platform]}</p>
                    <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      {ideas.map((idea) => (
                        <IdeaCard key={idea.id} idea={idea} onUse={() => onUseIdea(idea)} />
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <p className="mb-2 text-[12px] font-medium text-charcoal-soft">Research it yourself on {PLATFORM_LABEL[report.platform]}</p>
                  <ul className="flex flex-wrap gap-2">
                    {report.links.map((l) => (
                      <li key={l.url}>
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={l.hint}
                          className="inline-flex max-w-full items-center gap-1 rounded-lg border border-bark/15 bg-white px-2.5 py-1.5 text-[12px] text-charcoal-soft transition hover:border-forest/30 hover:text-forest"
                        >
                          <span className="truncate">{l.label}</span> <ExternalLink size={10} className="shrink-0" aria-hidden="true" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="mb-1.5 text-[12px] font-medium text-charcoal-soft">Hashtags</p>
                  <Hashtags tags={report.hashtags} />
                </div>
              </div>
            )}

            <p className="text-[11px] leading-4 text-muted">
              {liveCount} of {platforms.length} platforms read live. Banyan never scrapes or posts; research links open the platform in your own browser.
              {trends.method === "model" ? " Ideas written by Banyan's model." : " Ideas from fixed templates (no model configured)."}
            </p>
          </>
        ) : null}
      </Section>
    </Card>
  );
}
