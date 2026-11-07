"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight, ExternalLink, Globe2, RotateCcw } from "lucide-react";
import { Button, Card, Input, Select, Textarea } from "@/components/ui";
import type { ProductStage } from "@/lib/product/intake";
import { coverage, missingRequired, type IntakeProfile } from "@/lib/product/intake-profile";
import { ListField, ReviewField, Section, SourceTag, pageLabel } from "./parts";

const STAGES: [ProductStage, string][] = [
  ["idea", "Idea"],
  ["building", "Building"],
  ["private_beta", "Private beta"],
  ["public_beta", "Public beta"],
  ["launched", "Launched"],
  ["growth", "Growing"],
];

const SOCIAL_LABEL: Record<string, string> = {
  x: "X", linkedin: "LinkedIn", youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", github: "GitHub", producthunt: "Product Hunt", discord: "Discord",
};

type Setter = <K extends keyof IntakeProfile>(key: K, value: IntakeProfile[K]) => void;

/** The site's logo, if it loads; the first letter of the name if not. */
function Mark({ src, name, color }: { src?: string; name: string; color?: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a third-party logo of unknown size; next/image would need its host allow-listed
      <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-12 w-12 shrink-0 rounded-xl border border-bark/10 bg-white object-contain p-1.5" />
    );
  }
  return (
    <span
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-serif text-xl text-ivory"
      style={{ backgroundColor: color || "var(--color-forest)" }}
      aria-hidden="true"
    >
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

export type MarketSnapshot = {
  state: "idle" | "running" | "ready" | "failed";
  competitors: number;
  verified: number;
  conversations: number;
  leads: number;
  opportunities: number;
  trendsState?: "idle" | "running" | "ready" | "failed";
  trending?: number;
  livePlatforms?: number;
  platforms?: number;
};

/** One number of the 360 at a glance; a link to its chapter. */
function Tile({ href, label, value, sub, busy, className = "" }: { href: string; label: string; value: string; sub?: string; busy?: boolean; className?: string }) {
  return (
    <a href={href} className={`group flex min-w-0 flex-col rounded-xl border border-bark/10 bg-white px-3 py-2.5 transition hover:border-forest/30 hover:bg-mist/40 ${className}`}>
      <span className="text-[11px] font-medium text-muted group-hover:text-forest">{label}</span>
      {busy ? (
        <span className="mt-1.5 h-5 w-10 animate-pulse rounded bg-bark/10 motion-reduce:animate-none" aria-label="Scanning" />
      ) : (
        <span className="font-serif text-xl leading-tight text-forest-deep">{value}</span>
      )}
      {sub && !busy && <span className="truncate text-[11px] text-muted">{sub}</span>}
    </a>
  );
}

const NAV: { href: string; label: string; group: "product" | "market" }[] = [
  { href: "#sec-product", label: "Product", group: "product" },
  { href: "#sec-audience", label: "Audience", group: "product" },
  { href: "#sec-position", label: "Positioning", group: "product" },
  { href: "#sec-proof", label: "Proof & pricing", group: "product" },
  { href: "#sec-voice", label: "Voice", group: "product" },
  { href: "#sec-competitors", label: "Competitors", group: "market" },
  { href: "#sec-conversations", label: "Conversations", group: "market" },
  { href: "#sec-signals", label: "People in the market", group: "market" },
  { href: "#sec-opportunities", label: "Opportunities", group: "market" },
  { href: "#sec-trending", label: "What's trending", group: "market" },
];

export function Understood({
  profile,
  edited,
  set,
  onContinue,
  onReread,
  market,
  trending,
  snapshot,
}: {
  profile: IntakeProfile;
  edited: Set<string>;
  set: Setter;
  onContinue: () => void;
  onReread: () => void;
  /** The market chapters (competitors, conversations, people, opportunities). */
  market?: ReactNode;
  /** The trend radar chapter. */
  trending?: ReactNode;
  snapshot?: MarketSnapshot;
}) {
  const p = profile;
  const missing = missingRequired(p);
  const cov = coverage(p);
  const scanning = snapshot?.state === "running";
  const tag = (key: keyof IntakeProfile, required = false) => {
    const v = p[key];
    const empty = Array.isArray(v) ? v.length === 0 : String(v ?? "").trim().length === 0;
    return <SourceTag source={p.sources[key]} empty={empty} required={required} edited={edited.has(key)} siteRead={fromSite} />;
  };
  const fromSite = p.method === "model" || p.method === "basic";
  // Never a dead button: with something missing, take the founder to the first gap.
  const continueOrFocus = () => {
    if (missing.length === 0) return onContinue();
    const el = document.getElementById(`intake-${missing[0].key}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
  };

  return (
    <div className="lg:grid lg:grid-cols-[176px_minmax(0,1fr)] lg:gap-8">
      {/* Chapter nav: the report is long; this keeps every part one click away. */}
      <nav aria-label="Report sections" className="hidden lg:block">
        <div className="sticky top-6 space-y-4 text-[13px]">
          {(["product", "market"] as const).map((group) => (
            <div key={group}>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">{group === "product" ? "Your product" : "Your market"}</p>
              <ul className="space-y-0.5 border-l border-bark/10">
                {NAV.filter((n) => n.group === group).map((n) => (
                  <li key={n.href}>
                    <a href={n.href} className="-ml-px block border-l border-transparent py-1 pl-3 text-charcoal-soft transition hover:border-forest hover:text-forest">
                      {n.label}
                      {group === "market" && scanning && <span className="ml-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-fig motion-reduce:animate-none" aria-hidden="true" />}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {missing.length > 0 && (
            <p className="rounded-lg bg-clay/[0.06] px-2.5 py-2 text-[12px] leading-5 text-clay">{missing.length} field{missing.length === 1 ? "" : "s"} still need you</p>
          )}
        </div>
      </nav>

    <div className="min-w-0 space-y-5">
      {/* Identity: who Banyan thinks you are, at a glance. */}
      <Card flush>
        <div className="flex flex-wrap items-start gap-4 p-6">
          <Mark src={p.site?.logo} name={p.name} color={p.site?.themeColor} />
          <div className="min-w-0 flex-1">
            <label htmlFor="intake-name" className="sr-only">Product name</label>
            <input
              id="intake-name"
              value={p.name}
              onChange={(e) => set("name", e.target.value)}
              maxLength={120}
              placeholder="Product name"
              className="w-full rounded-md bg-transparent font-serif text-2xl tracking-[-0.01em] text-forest-deep placeholder:text-muted focus:bg-ivory/60 focus:outline-none focus:ring-4 focus:ring-forest/10 sm:text-[28px]"
            />
            <label htmlFor="intake-tagline" className="sr-only">Tagline</label>
            <input
              id="intake-tagline"
              value={p.tagline}
              onChange={(e) => set("tagline", e.target.value)}
              maxLength={200}
              placeholder="Your one-line promise"
              className="mt-0.5 w-full rounded-md bg-transparent text-[15px] text-charcoal-soft placeholder:text-muted focus:bg-ivory/60 focus:outline-none focus:ring-4 focus:ring-forest/10"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
              {p.website && (
                <a href={p.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-forest hover:underline">
                  <Globe2 size={13} aria-hidden="true" />
                  {(() => { try { return new URL(p.website).hostname; } catch { return p.website; } })()}
                </a>
              )}
              {p.site?.socials.map((s) => (
                <a key={s.network} href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md bg-bark/[0.06] px-1.5 py-0.5 text-charcoal-soft hover:text-charcoal">
                  {SOCIAL_LABEL[s.network] ?? s.network}
                  <ExternalLink size={11} aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>
          <div className="flex w-full flex-wrap gap-3 sm:w-auto sm:flex-col sm:items-end">
            <div className="w-40">
              <ReviewField label="Stage" tag={tag("stage")}>
                {(id) => (
                  <Select id={id} value={p.stage} onChange={(e) => set("stage", e.target.value as ProductStage)}>
                    {STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </Select>
                )}
              </ReviewField>
            </div>
          </div>
        </div>

        {/* The 360 at a glance: each tile jumps to its chapter. */}
        <div className="grid grid-cols-2 gap-2 border-t border-bark/10 bg-ivory/50 px-6 py-4 sm:grid-cols-3 lg:grid-cols-6">
          <Tile href="#sec-product" label="Profile" value={`${cov.read}/${cov.total}`} sub={fromSite ? `from ${p.pages.length === 1 ? "1 page" : `${p.pages.length} pages`}` : "your words"} />
          <Tile href="#sec-competitors" label="Competitors" value={String(snapshot?.competitors ?? 0)} sub={snapshot ? `${snapshot.verified} read from their sites` : undefined} busy={scanning} />
          <Tile href="#sec-conversations" label="Conversations" value={String(snapshot?.conversations ?? 0)} sub="public threads" busy={scanning} />
          <Tile href="#sec-signals" label="People in market" value={String(snapshot?.leads ?? 0)} sub="asking or switching" busy={scanning} />
          <Tile href="#sec-opportunities" label="Opportunities" value={String(snapshot?.opportunities ?? 0)} sub="with evidence" busy={scanning} />
          <Tile href="#sec-trending" label="Trending" value={String(snapshot?.trending ?? 0)} sub={snapshot?.platforms ? `${snapshot.livePlatforms} of ${snapshot.platforms} platforms live` : "posts across platforms"} busy={scanning || snapshot?.trendsState === "running"} />
        </div>
        {fromSite && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-bark/10 px-6 py-2.5">
            <p className="min-w-0 truncate text-[12px] text-muted">
              Read {p.pages.map(pageLabel).join(", ")}
            </p>
            <button type="button" onClick={onReread} className="inline-flex items-center gap-1 text-[12px] text-charcoal-soft hover:text-charcoal">
              <RotateCcw size={12} aria-hidden="true" /> Read again
            </button>
          </div>
        )}
        {p.method === "basic" && (
          <p className="border-t border-bark/10 px-6 py-3 text-[13px] leading-5 text-muted">
            Read without an AI model: Banyan copied what your pages state and left the rest for you. Nothing here was made up.
          </p>
        )}
      </Card>

      {missing.length > 0 && (
        <div className="rounded-xl border border-clay/20 bg-clay/[0.04] px-4 py-3" role="status">
          <p className="text-sm font-medium text-clay">
            {missing.length === 1 ? "One thing" : `${missing.length} things`} {fromSite ? "your site doesn't say, and " : ""}the cycle needs:
          </p>
          <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
            {missing.map((m) => (
              <li key={m.key}>
                <a href={`#intake-${m.key}`} className="text-charcoal underline decoration-clay/40 underline-offset-2 hover:decoration-clay">{m.label}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="pt-2 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Your product</p>
      <Card>
        <div className="space-y-8">
          <Section index={1} id="sec-product" title="The product" lede="What it is and what it does for people, in your own terms.">
            <ReviewField label="What it does" tag={tag("description", true)} id="intake-description">
              {(id) => <Textarea id={id} value={p.description} onChange={(e) => set("description", e.target.value)} rows={3} maxLength={2000} placeholder="Two or three plain sentences." />}
            </ReviewField>
            <ReviewField label="Value proposition" tag={tag("valueProp", true)} id="intake-valueProp" hint="The concrete outcome, not a slogan.">
              {(id) => <Textarea id={id} value={p.valueProp} onChange={(e) => set("valueProp", e.target.value)} rows={2} maxLength={500} />}
            </ReviewField>
            <ReviewField label="Category" tag={tag("category")}>
              {(id) => <Input id={id} value={p.category} onChange={(e) => set("category", e.target.value)} maxLength={120} placeholder="e.g. invoicing software for freelancers" />}
            </ReviewField>
            <ReviewField label="Features" tag={tag("features")}>
              {() => <ListField label="Features" items={p.features} onChange={(v) => set("features", v)} placeholder="Add a feature" />}
            </ReviewField>
          </Section>

          <Section index={2} id="sec-audience" title="Who it's for" lede="The sharper the audience, the better the posts land.">
            <ReviewField label="Audience" tag={tag("audience", true)} id="intake-audience" hint="Specific people, e.g. “solo B2B founders shipping their first product”.">
              {(id) => <Input id={id} value={p.audience} onChange={(e) => set("audience", e.target.value)} maxLength={300} />}
            </ReviewField>
            <div className="grid gap-4 sm:grid-cols-2">
              <ReviewField label="What's painful for them today" tag={tag("audiencePain")}>
                {(id) => <Textarea id={id} value={p.audiencePain} onChange={(e) => set("audiencePain", e.target.value)} rows={3} maxLength={1000} />}
              </ReviewField>
              <ReviewField label="What they get once it works" tag={tag("audienceOutcome")}>
                {(id) => <Textarea id={id} value={p.audienceOutcome} onChange={(e) => set("audienceOutcome", e.target.value)} rows={3} maxLength={1000} />}
              </ReviewField>
            </div>
          </Section>

          <Section index={3} id="sec-position" title="Problem and positioning" lede="Why it exists, and why someone picks it over the alternative.">
            <ReviewField label="The problem it solves" tag={tag("problem", true)} id="intake-problem" hint="In the audience's words.">
              {(id) => <Textarea id={id} value={p.problem} onChange={(e) => set("problem", e.target.value)} rows={2} maxLength={1000} />}
            </ReviewField>
            <ReviewField label="Positioning" tag={tag("positioning")} hint="For <audience> who <need>, <product> is a <category> that <benefit>.">
              {(id) => <Textarea id={id} value={p.positioning} onChange={(e) => set("positioning", e.target.value)} rows={4} maxLength={500} />}
            </ReviewField>
            <ReviewField label="What makes it different" tag={tag("differentiators")}>
              {() => <ListField label="Differentiators" items={p.differentiators} onChange={(v) => set("differentiators", v)} placeholder="Add a difference" max={6} />}
            </ReviewField>
            {p.alternatives.length > 0 && (
              <p className="text-[13px] text-muted">
                Your site compares itself to: <span className="text-charcoal-soft">{p.alternatives.join(", ")}</span>
              </p>
            )}
          </Section>

          <Section index={4} id="sec-proof" title="Proof and pricing" lede="Posts may only cite what is here. Banyan never invents a number.">
            <ReviewField label="Proof" tag={tag("proof")} hint="Customers, counts, ratings and quotes, exactly as your site states them.">
              {() => <ListField label="Proof" items={p.proof} onChange={(v) => set("proof", v)} placeholder="Add a customer, number or quote" max={8} quote />}
            </ReviewField>
            <ReviewField label="Pricing" tag={tag("pricing")}>
              {(id) => <Textarea id={id} value={p.pricing} onChange={(e) => set("pricing", e.target.value)} rows={3} maxLength={600} placeholder="e.g. Free for one client · Pro $9/month" />}
            </ReviewField>
          </Section>

          <Section index={5} id="sec-voice" title="Voice and the ask" lede="How your posts should sound, and what they ask readers to do.">
            <div className="grid gap-4 sm:grid-cols-2">
              <ReviewField label="Tone" tag={tag("tone")}>
                {(id) => <Input id={id} value={p.tone} onChange={(e) => set("tone", e.target.value)} maxLength={80} placeholder="e.g. warm, direct, lightly playful" />}
              </ReviewField>
              <ReviewField label="Call to action" tag={tag("primaryCta")}>
                {(id) => <Input id={id} value={p.primaryCta} onChange={(e) => set("primaryCta", e.target.value)} maxLength={100} placeholder="e.g. Start free trial" />}
              </ReviewField>
            </div>
          </Section>
        </div>
      </Card>

      {market && (
        <>
          <p className="pt-2 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Your market</p>
          {market}
          {trending}
        </>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-bark/10 bg-canvas/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:bg-white/90">
        <p className="text-[13px] text-charcoal-soft">
          {missing.length > 0 ? `Add ${missing.map((m) => m.label.toLowerCase()).join(", ")} to continue.` : "Looks right? Everything here becomes your context, and you can edit it later."}
        </p>
        <Button type="button" onClick={continueOrFocus}>
          Plan the cycle <ArrowRight size={15} aria-hidden="true" />
        </Button>
      </div>
    </div>
    </div>
  );
}
