"use client";

import { useState } from "react";
import { ArrowRight, Check, ChevronDown, ExternalLink, Globe2, Loader2, RotateCcw } from "lucide-react";
import { Button, Card, Input, Select, Textarea } from "@/components/ui";
import type { ProductStage } from "@/lib/product/intake";
import { coverage, missingRequired, type IntakeProfile } from "@/lib/product/intake-profile";
import { ListField, ReviewField, SourceTag, StepFooter, pageLabel } from "./parts";

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

/** Progress of the market half, shown while the founder confirms the product half. */
export type ScanProgress = {
  state: "idle" | "running" | "ready" | "failed";
  competitors: number;
  verified: number;
  conversations: number;
  leads: number;
  opportunities: number;
  trendsState: "idle" | "running" | "ready" | "failed";
  trending: number;
  livePlatforms: number;
  platforms: number;
};

/** The site's logo, if it loads; the first letter of the name if not. */
export function Mark({ src, name, color, size = "lg" }: { src?: string; name: string; color?: string; size?: "lg" | "sm" }) {
  const [failed, setFailed] = useState(false);
  const box = size === "lg" ? "h-14 w-14 rounded-2xl text-2xl" : "h-9 w-9 rounded-lg text-base";
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a third-party logo of unknown size; next/image would need its host allow-listed
      <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={`${box} shrink-0 border border-bark/10 bg-white object-contain p-1.5`} />
    );
  }
  return (
    <span className={`${box} flex shrink-0 items-center justify-center font-serif text-ivory`} style={{ backgroundColor: color || "var(--color-forest)" }} aria-hidden="true">
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

function ScanRow({ label, value, busy, done }: { label: string; value: string; busy: boolean; done: boolean }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${done ? "bg-forest text-ivory" : "border border-bark/20 text-muted"}`} aria-hidden="true">
        {busy ? <Loader2 size={11} className="animate-spin motion-reduce:animate-none" /> : done ? <Check size={11} /> : null}
      </span>
      <span className="min-w-0 flex-1 text-[13px] text-charcoal-soft">{label}</span>
      <span className={`text-[13px] font-medium tabular-nums ${done ? "text-forest-deep" : "text-muted"}`}>{busy ? "…" : value}</span>
    </li>
  );
}

/** While the founder checks their product, the market fills in beside it: something to look forward to. */
function ScanPanel({ scan, onOpen }: { scan: ScanProgress; onOpen: () => void }) {
  const marketBusy = scan.state === "running";
  const marketDone = scan.state === "ready";
  const trendsBusy = scan.trendsState === "running" || (marketBusy && scan.trendsState === "idle");
  const trendsDone = scan.trendsState === "ready";
  const allDone = marketDone && (trendsDone || scan.trendsState === "failed");
  return (
    <Card className="p-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Your market</p>
      <p className="mt-1 font-serif text-lg leading-snug text-forest-deep">
        {allDone ? "Your briefing is ready." : scan.state === "idle" ? "Mapped once your site is read." : "Mapping it while you check this…"}
      </p>
      <ul className="mt-2 divide-y divide-bark/10" aria-live="polite">
        <ScanRow label="Competitors, read from their sites" value={`${scan.verified}/${scan.competitors}`} busy={marketBusy} done={marketDone} />
        <ScanRow label="Public conversations" value={String(scan.conversations)} busy={marketBusy} done={marketDone} />
        <ScanRow label="People asking or switching" value={String(scan.leads)} busy={marketBusy} done={marketDone} />
        <ScanRow label="Opportunities with evidence" value={String(scan.opportunities)} busy={marketBusy} done={marketDone} />
        <ScanRow label="Platforms read live" value={scan.platforms ? `${scan.livePlatforms}/${scan.platforms}` : "0"} busy={trendsBusy} done={trendsDone} />
      </ul>
      {scan.state === "failed" && <p className="mt-2 text-[12px] text-clay">The market scan didn&apos;t finish. You can retry it on the next step.</p>}
      {allDone && (
        <button type="button" onClick={onOpen} className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-forest hover:underline">
          Open the briefing <ArrowRight size={13} aria-hidden="true" />
        </button>
      )}
    </Card>
  );
}

function DetailGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">{title}</p>
      {children}
    </div>
  );
}

export function ConfirmStep({
  profile,
  edited,
  set,
  onContinue,
  onBack,
  onReread,
  scan,
}: {
  profile: IntakeProfile;
  edited: Set<string>;
  set: Setter;
  onContinue: () => void;
  onBack: () => void;
  onReread: () => void;
  /** Absent when there is no site read (manual entry), so no market is being mapped. */
  scan?: ScanProgress;
}) {
  const p = profile;
  const missing = missingRequired(p);
  const cov = coverage(p);
  const fromSite = p.method === "model" || p.method === "basic";
  const [open, setOpen] = useState(false);
  const empty = (key: keyof IntakeProfile) => {
    const v = p[key];
    return Array.isArray(v) ? v.length === 0 : String(v ?? "").trim().length === 0;
  };
  const tag = (key: keyof IntakeProfile, required = false) => (
    <SourceTag source={p.sources[key]} empty={empty(key)} required={required} edited={edited.has(key)} siteRead={fromSite} />
  );
  const detailKeys: (keyof IntakeProfile)[] = ["category", "features", "audiencePain", "audienceOutcome", "positioning", "differentiators", "proof", "pricing", "tone", "primaryCta"];
  const detailsFilled = detailKeys.filter((k) => !empty(k)).length;

  // Never a dead button: with something missing, take the founder to the first gap.
  const continueOrFocus = () => {
    if (missing.length === 0) return onContinue();
    const el = document.getElementById(`intake-${missing[0].key}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
  };

  return (
    <div className="space-y-5">
      <header>
        <h2 className="font-serif text-[28px] leading-tight tracking-[-0.015em] text-forest-deep sm:text-[32px]">
          {fromSite ? "Is this you?" : "Tell Banyan about your product."}
        </h2>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-charcoal-soft">
          {fromSite
            ? "Here's what Banyan understood from your site. Fix anything that's off; every field shows where it came from."
            : "Four things, in your own words. The rest is optional."}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="min-w-0 space-y-5">
          {/* Identity */}
          <Card flush>
            <div className="flex flex-wrap items-start gap-4 p-6">
              <Mark src={p.site?.logo} name={p.name} color={p.site?.themeColor} />
              <div className="min-w-0 flex-1 basis-56">
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
                      {(() => {
                        try {
                          return new URL(p.website).hostname;
                        } catch {
                          return p.website;
                        }
                      })()}
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
              <div className="w-40">
                <ReviewField label="Stage" tag={tag("stage")}>
                  {(id) => (
                    <Select id={id} value={p.stage} onChange={(e) => set("stage", e.target.value as ProductStage)}>
                      {STAGES.map(([k, l]) => (
                        <option key={k} value={k}>{l}</option>
                      ))}
                    </Select>
                  )}
                </ReviewField>
              </div>
            </div>
            {fromSite && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-bark/10 bg-ivory/50 px-6 py-2.5">
                <p className="min-w-0 text-[12px] text-muted">
                  <span className="font-medium text-charcoal-soft">{cov.read} of {cov.total}</span> fields read from {p.pages.map(pageLabel).join(", ")}
                  {p.method === "basic" && " · read without an AI model, so only what your pages state"}
                </p>
                <button type="button" onClick={onReread} className="inline-flex items-center gap-1 text-[12px] text-charcoal-soft hover:text-charcoal">
                  <RotateCcw size={12} aria-hidden="true" /> Read again
                </button>
              </div>
            )}
          </Card>

          {/* The four essentials */}
          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-serif text-lg text-forest-deep">The essentials</h3>
              {missing.length > 0 ? (
                <p className="text-[12px] font-medium text-clay" role="status">
                  {missing.length === 1 ? "1 needs you" : `${missing.length} need you`}
                </p>
              ) : (
                <p className="inline-flex items-center gap-1 text-[12px] font-medium text-forest">
                  <Check size={12} aria-hidden="true" /> All set
                </p>
              )}
            </div>
            <p className="mt-0.5 text-[13px] text-muted">What every post will rest on. Short and specific beats complete.</p>
            <div className="mt-5 grid grid-cols-1 gap-5">
              <ReviewField label="What it does" tag={tag("description", true)} id="intake-description">
                {(id) => <Textarea id={id} value={p.description} onChange={(e) => set("description", e.target.value)} rows={3} maxLength={2000} placeholder="Two or three plain sentences." />}
              </ReviewField>
              <ReviewField label="Who it's for" tag={tag("audience", true)} id="intake-audience" hint="Specific people, e.g. “solo B2B founders shipping their first product”.">
                {(id) => <Input id={id} value={p.audience} onChange={(e) => set("audience", e.target.value)} maxLength={300} />}
              </ReviewField>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <ReviewField label="The problem it solves" tag={tag("problem", true)} id="intake-problem" hint="In their words.">
                  {(id) => <Textarea id={id} value={p.problem} onChange={(e) => set("problem", e.target.value)} rows={3} maxLength={1000} />}
                </ReviewField>
                <ReviewField label="Why it's worth it" tag={tag("valueProp", true)} id="intake-valueProp" hint="The concrete outcome, not a slogan.">
                  {(id) => <Textarea id={id} value={p.valueProp} onChange={(e) => set("valueProp", e.target.value)} rows={3} maxLength={500} />}
                </ReviewField>
              </div>
            </div>
          </Card>

          {/* Everything else: collapsed, so the essentials stay the job. */}
          <Card flush>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls="intake-details"
              className="flex w-full items-center gap-3 px-6 py-4 text-left transition hover:bg-ivory/40"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-serif text-lg text-forest-deep">Everything else</span>
                <span className="block text-[13px] text-muted">
                  {fromSite ? `${detailsFilled} of ${detailKeys.length} details found` : "Optional"} · category, features, pain and outcome, positioning, proof, pricing, voice
                </span>
              </span>
              <ChevronDown size={18} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {open && (
              <div id="intake-details" className="space-y-8 border-t border-bark/10 px-6 py-6">
                <DetailGroup title="Product">
                  <ReviewField label="Category" tag={tag("category")}>
                    {(id) => <Input id={id} value={p.category} onChange={(e) => set("category", e.target.value)} maxLength={120} placeholder="e.g. invoicing software for freelancers" />}
                  </ReviewField>
                  <ReviewField label="Features" tag={tag("features")}>
                    {() => <ListField label="Features" items={p.features} onChange={(v) => set("features", v)} placeholder="Add a feature" />}
                  </ReviewField>
                </DetailGroup>
                <DetailGroup title="Audience">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <ReviewField label="What's painful for them today" tag={tag("audiencePain")}>
                      {(id) => <Textarea id={id} value={p.audiencePain} onChange={(e) => set("audiencePain", e.target.value)} rows={3} maxLength={1000} />}
                    </ReviewField>
                    <ReviewField label="What they get once it works" tag={tag("audienceOutcome")}>
                      {(id) => <Textarea id={id} value={p.audienceOutcome} onChange={(e) => set("audienceOutcome", e.target.value)} rows={3} maxLength={1000} />}
                    </ReviewField>
                  </div>
                </DetailGroup>
                <DetailGroup title="Positioning">
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
                </DetailGroup>
                <DetailGroup title="Proof and pricing">
                  <ReviewField label="Proof" tag={tag("proof")} hint="Customers, counts, ratings and quotes, exactly as your site states them. Posts may only cite what is here.">
                    {() => <ListField label="Proof" items={p.proof} onChange={(v) => set("proof", v)} placeholder="Add a customer, number or quote" max={8} quote />}
                  </ReviewField>
                  <ReviewField label="Pricing" tag={tag("pricing")}>
                    {(id) => <Textarea id={id} value={p.pricing} onChange={(e) => set("pricing", e.target.value)} rows={3} maxLength={600} placeholder="e.g. Free for one client · Pro $9/month" />}
                  </ReviewField>
                </DetailGroup>
                <DetailGroup title="Voice and the ask">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <ReviewField label="Tone" tag={tag("tone")}>
                      {(id) => <Input id={id} value={p.tone} onChange={(e) => set("tone", e.target.value)} maxLength={80} placeholder="e.g. warm, direct, lightly playful" />}
                    </ReviewField>
                    <ReviewField label="Call to action" tag={tag("primaryCta")}>
                      {(id) => <Input id={id} value={p.primaryCta} onChange={(e) => set("primaryCta", e.target.value)} maxLength={100} placeholder="e.g. Start free trial" />}
                    </ReviewField>
                  </div>
                </DetailGroup>
              </div>
            )}
          </Card>
        </div>

        {scan && (
          <aside className="lg:sticky lg:top-6" aria-label="Market scan">
            <ScanPanel scan={scan} onOpen={continueOrFocus} />
          </aside>
        )}
      </div>

      <StepFooter
        onBack={onBack}
        hint={missing.length > 0 ? `Add ${missing.map((m) => m.label.toLowerCase()).join(", ")} to continue.` : "Looks right? You can change any of this later."}
        primary={
          <Button type="button" onClick={continueOrFocus} className="h-10 rounded-xl px-4">
            {scan ? "See your market" : "Plan the first cycle"} <ArrowRight size={15} aria-hidden="true" />
          </Button>
        }
      />
    </div>
  );
}
