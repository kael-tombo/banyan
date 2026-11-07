"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Check, Globe2, Loader2, MessageSquare, PenLine, ShieldCheck, Sparkles, Swords, TrendingUp, UserRound } from "lucide-react";
import { Badge, Button, Card, ErrorNote, Field, Input, Textarea } from "@/components/ui";
import type { ProductAnalysisResult } from "@/lib/product/analyze";
import { BLANK_INTAKE, intakeFromAnalysis, suggestCycle, type IntakeProfile } from "@/lib/product/intake-profile";
import { ReadingProgress, type ReadingStatus } from "./intake/reading-progress";
import { ConfirmStep } from "./intake/confirm-step";
import { MarketStep, type Angle, type MarketTab } from "./intake/market-step";
import { StepFooter } from "./intake/parts";
import { MarketSections, type ResearchState } from "./intake/market-sections";
import { TrendRadar, type TrendsState } from "./intake/trend-radar";
import { googleTrendsLink } from "@/lib/research/trends/links";
import { PLATFORM_LABEL, type ContentIdea, type TrendsReport } from "@/lib/research/trends/types";
import type { Competitor, MarketResearch, Opportunity } from "@/lib/research/types";

type Channel = "x" | "linkedin" | "shortvideo";
type Phase = "url" | "reading" | "confirm" | "market" | "cycle";

const CHANNELS: { key: Channel; label: string; hint: string; live: boolean }[] = [
  { key: "linkedin", label: "LinkedIn", hint: "Published through your connection, after your approval.", live: true },
  { key: "x", label: "X", hint: "Published through your connection, after your approval.", live: true },
  { key: "shortvideo", label: "Short-form video", hint: "Banyan writes the script; you record and post it.", live: false },
];

const STEPS: { label: string; phases: Phase[] }[] = [
  { label: "Your site", phases: ["url", "reading"] },
  { label: "Confirm", phases: ["confirm"] },
  { label: "Your market", phases: ["market"] },
  { label: "First cycle", phases: ["cycle"] },
];
const stepOf = (p: Phase) => STEPS.findIndex((s) => s.phases.includes(p));
const POLL_MS = 1500;
const POLL_LIMIT_MS = 120_000;

type AnalysisPayload = {
  id: string;
  status: "queued" | "reading" | "analysing" | "ready" | "failed";
  method: "model" | "basic" | null;
  error: { code: string; message: string | null } | null;
  pages: string[];
  result: Partial<ProductAnalysisResult> | null;
};

/** Older stored results lack the v2 fields; give every field a value before mapping. */
function normalizeResult(r: Partial<ProductAnalysisResult>): ProductAnalysisResult {
  return {
    product_name: r.product_name ?? "",
    description: r.description ?? "",
    value_proposition: r.value_proposition ?? "",
    features: r.features ?? [],
    target_audience: r.target_audience ?? [],
    problems_solved: r.problems_solved ?? [],
    differentiators: r.differentiators ?? [],
    missing_information: r.missing_information ?? [],
    provenance: r.provenance ?? {},
    tagline: r.tagline ?? "",
    category: r.category ?? "",
    stage: r.stage ?? "",
    audience_pain: r.audience_pain ?? "",
    audience_outcome: r.audience_outcome ?? "",
    positioning: r.positioning ?? "",
    pricing: r.pricing ?? "",
    proof: r.proof ?? [],
    primary_cta: r.primary_cta ?? "",
    tone: r.tone ?? "",
    alternatives: r.alternatives ?? [],
    site: r.site,
  };
}

/** Four segments; a step already reached can be revisited, the next ones can't be skipped to. */
function Progress({ phase, reached, onGo, skipMarket }: { phase: Phase; reached: number; onGo: (step: number) => void; skipMarket: boolean }) {
  const current = stepOf(phase);
  return (
    <nav aria-label="Onboarding steps">
      <ol className="grid grid-cols-4 gap-2">
        {STEPS.map((step, i) => {
          const done = i < current;
          const active = i === current;
          const skipped = skipMarket && i === 2;
          const reachable = i <= reached && !active && !skipped && phase !== "reading";
          const bar = active ? "bg-forest-deep" : done ? "bg-forest/70" : "bg-bark/12";
          const body = (
            <>
              <span className={`block h-1 rounded-full transition-colors duration-300 ${bar}`} aria-hidden="true" />
              <span className={`mt-2 flex items-center gap-1 text-[12px] sm:text-[13px] ${active ? "font-medium text-forest-deep" : done ? "text-charcoal-soft" : "text-muted"}`}>
                {done && !skipped && <Check size={12} className="shrink-0 text-forest" aria-hidden="true" />}
                <span className="truncate">{step.label}</span>
              </span>
            </>
          );
          return (
            <li key={step.label} aria-current={active ? "step" : undefined}>
              {reachable ? (
                <button type="button" onClick={() => onGo(i)} className="block w-full text-left hover:opacity-80">
                  {body}
                </button>
              ) : (
                <div>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default function CycleIntakeForm({
  initialProfile,
  initialUrl = "",
  firstCycle = false,
  initialAnalysisId = null,
  initialResearch = null,
}: {
  initialProfile: IntakeProfile | null;
  initialUrl?: string;
  /** Onboarding (blocker 04): starting this cycle also finishes onboarding, with the browser's time zone. */
  firstCycle?: boolean;
  /** The saved profile's last site read and its market scan, so a returning founder keeps their 360. */
  initialAnalysisId?: string | null;
  initialResearch?: MarketResearch | null;
}) {
  const router = useRouter();
  // The 360's market half: scan state, the founder's edits, and what they keep.
  const [analysisId, setAnalysisId] = useState<string | null>(initialAnalysisId);
  const [research, setResearch] = useState<MarketResearch | null>(initialResearch);
  const [researchState, setResearchState] = useState<ResearchState>(initialResearch ? "ready" : "idle");
  const [competitors, setCompetitors] = useState<Competitor[]>(initialResearch?.competitors ?? []);
  const [queries, setQueries] = useState<string[]>(initialResearch?.queries ?? []);
  const [kept, setKept] = useState<Set<string>>(new Set(initialResearch?.opportunities.map((o) => o.id) ?? []));
  const [researchDirty, setResearchDirty] = useState(false);
  const scanRun = useRef(0);
  // The trend radar: runs after each market scan, kept with it.
  const [trends, setTrends] = useState<TrendsReport | null>(initialResearch?.trends ?? null);
  const [trendsState, setTrendsState] = useState<TrendsState>(initialResearch?.trends ? "ready" : "idle");
  const trendsRun = useRef(0);
  const [phase, setPhase] = useState<Phase>("url");
  const [url, setUrl] = useState(initialUrl || initialProfile?.website || "");
  const [profile, setProfile] = useState<IntakeProfile>(initialProfile ?? BLANK_INTAKE);
  const [edited, setEdited] = useState<Set<string>>(new Set());
  const [readingStatus, setReadingStatus] = useState<ReadingStatus>("queued");
  const [update, setUpdate] = useState("");
  const [objective, setObjective] = useState("");
  const [metric, setMetric] = useState("");
  const [target, setTarget] = useState("");
  const [days, setDays] = useState("14");
  const [goalReason, setGoalReason] = useState("");
  const [goalTouched, setGoalTouched] = useState(false);
  const [channels, setChannels] = useState<Channel[]>(["linkedin", "x", "shortvideo"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useRef(0);
  // The furthest step reached (for the progress bar) and the angle picked on the market step.
  const [reached, setReached] = useState(0);
  const [angle, setAngle] = useState<Angle | null>(null);

  function go(next: Phase) {
    setPhase(next);
    setReached((r) => Math.max(r, stepOf(next)));
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function set<K extends keyof IntakeProfile>(key: K, value: IntakeProfile[K]) {
    setProfile((prev) => {
      // Once the founder edits a value it is theirs, not the page's.
      const sources = { ...prev.sources };
      delete sources[key as string];
      return { ...prev, [key]: value, sources, observedFields: prev.observedFields.filter((f) => f !== key) };
    });
    setEdited((prev) => new Set(prev).add(key as string));
  }

  function enterReview(next: IntakeProfile) {
    setProfile(next);
    setEdited(new Set());
    go("confirm");
  }

  async function readSite() {
    setError(null);
    if (!url.trim()) {
      setError("Paste your product's address first, or start from scratch.");
      return;
    }
    const token = ++run.current;
    setBusy(true);
    setReadingStatus("queued");
    go("reading");
    try {
      const res = await fetch("/api/product/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = (await res.json().catch(() => ({}))) as { analysis?: AnalysisPayload; error?: string };
      if (!res.ok || !body.analysis) throw new Error(body.error || "Banyan could not read that site. Check the address, or start from scratch.");
      let analysis = body.analysis;
      const started = Date.now();
      while (analysis.status !== "ready" && analysis.status !== "failed") {
        if (token !== run.current) return; // cancelled
        if (Date.now() - started > POLL_LIMIT_MS) throw new Error("Reading is taking too long. Try again, or start from scratch.");
        setReadingStatus(analysis.status);
        await new Promise((r) => setTimeout(r, POLL_MS));
        const poll = await fetch(`/api/product/analyze/${analysis.id}`);
        const pollBody = (await poll.json().catch(() => ({}))) as { analysis?: AnalysisPayload; error?: string };
        if (!poll.ok || !pollBody.analysis) throw new Error(pollBody.error || "Lost track of the reading. Try again.");
        analysis = pollBody.analysis;
      }
      if (token !== run.current) return;
      if (analysis.status === "failed" || !analysis.result) {
        throw new Error(analysis.error?.message || "Banyan could not read that site. Check the address, or start from scratch.");
      }
      const next = intakeFromAnalysis(normalizeResult(analysis.result), {
        url,
        method: analysis.method === "model" ? "model" : "basic",
        pages: analysis.pages,
      });
      setUrl(next.website || url);
      enterReview(next);
      // The market half starts as soon as the product half is on screen.
      setAnalysisId(analysis.id);
      void scanMarket(analysis.id);
    } catch (err) {
      if (token !== run.current) return;
      setError((err as Error).message);
      setPhase("url");
    } finally {
      if (token === run.current) setBusy(false);
    }
  }

  /**
   * Run (or rerun) the market scan. A rerun sends the founder's competitor
   * list and search terms, so their edits steer it.
   */
  async function scanMarket(id: string | null = analysisId, withEdits = false) {
    if (!id) return;
    const token = ++scanRun.current;
    setResearchState("running");
    try {
      const body = withEdits
        ? {
            queries: queries.slice(0, 5),
            competitors: competitors.slice(0, 6).map((c) => ({
              name: c.name,
              domain: c.url || undefined,
              source: c.source,
              reason: c.reason || undefined,
            })),
          }
        : {};
      const res = await fetch(`/api/product/analyze/${id}/research`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const out = (await res.json().catch(() => ({}))) as { research?: MarketResearch; error?: string };
      if (token !== scanRun.current) return;
      if (!res.ok || !out.research) throw new Error(out.error || "The market scan couldn't finish.");
      setResearch(out.research);
      setCompetitors(out.research.competitors);
      setQueries(out.research.queries);
      setKept(new Set(out.research.opportunities.map((o) => o.id)));
      setResearchDirty(false);
      setResearchState("ready");
      // Fresh terms and competitors: the radar follows the scan.
      setTrends(null);
      void runTrends(id);
    } catch {
      if (token === scanRun.current) setResearchState("failed");
    }
  }

  /** Run (or refresh) the trend radar for the analysed product. */
  async function runTrends(id: string | null = analysisId) {
    if (!id) return;
    const token = ++trendsRun.current;
    setTrendsState("running");
    try {
      const res = await fetch(`/api/product/analyze/${id}/trends`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const out = (await res.json().catch(() => ({}))) as { trends?: TrendsReport; error?: string };
      if (token !== trendsRun.current) return;
      if (!res.ok || !out.trends) throw new Error(out.error || "The trend radar couldn't finish.");
      setTrends(out.trends);
      setTrendsState("ready");
    } catch {
      if (token === trendsRun.current) setTrendsState("failed");
    }
  }

  /** "Make this my first cycle" on a content idea: the post becomes what this cycle distributes. */
  function useIdea(idea: ContentIdea) {
    const detail = `${PLATFORM_LABEL[idea.platform]} ${idea.format.toLowerCase()}: “${idea.hook}” ${idea.angle}`.slice(0, 1000);
    setAngle({ source: "idea", title: `${PLATFORM_LABEL[idea.platform]}: ${idea.hook}`, detail });
    setUpdate(detail);
    toCycle();
  }

  /** "Make this my first cycle": the opportunity becomes what this cycle distributes. */
  function useOpportunity(o: Opportunity) {
    const detail = `${o.title}. ${o.firstStep}`.slice(0, 1000);
    setAngle({ source: "opportunity", title: o.title, detail });
    setUpdate(detail);
    setKept((prev) => new Set(prev).add(o.id));
    toCycle();
  }

  function cancelReading() {
    run.current++;
    setBusy(false);
    setPhase("url");
  }

  function startScratch() {
    enterReview({ ...BLANK_INTAKE, website: url.trim() ? (/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`) : "" });
    setError(null);
  }

  function useSaved() {
    if (!initialProfile) return;
    enterReview({ ...initialProfile });
    setError(null);
  }

  function toCycle() {
    if (!goalTouched) {
      const s = suggestCycle(profile);
      setObjective(s.objective);
      setMetric(s.metric);
      setTarget(String(s.target));
      setDays(String(s.days));
      setGoalReason(s.reason);
    }
    go("cycle");
  }

  function touchGoal<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setGoalTouched(true);
      setGoalReason("");
    };
  }

  function toggleChannel(channel: Channel) {
    setChannels((prev) => (prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]));
  }

  async function startCycle(e: FormEvent) {
    e.preventDefault();
    if (phase !== "cycle") return;
    setError(null);

    const targetNum = Number(target);
    const daysNum = Number(days);
    const missing: string[] = [];
    if (objective.trim().length < 5) missing.push("a clear objective");
    if (metric.trim().length < 2) missing.push("a metric");
    if (!Number.isFinite(targetNum) || targetNum < 0 || target.trim() === "") missing.push("a numeric target");
    if (!Number.isInteger(daysNum) || daysNum < 1 || daysNum > 365) missing.push("a window between 1 and 365 days");
    if (channels.length < 2) missing.push("at least two channels");
    if (!channels.some((c) => c !== "shortvideo")) missing.push("at least one live channel (X or LinkedIn)");
    if (missing.length > 0) {
      setError(`Before this cycle can start, add ${missing.join(", ")}.`);
      return;
    }

    setBusy(true);
    const cap = (list: string[], n: number, len: number) => list.map((s) => s.trim().slice(0, len)).filter(Boolean).slice(0, n);
    try {
      const snapshotRes = await fetch("/api/product/snapshot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: profile.name,
          description: profile.description,
          website: profile.website || "",
          stage: profile.stage,
          problem: profile.problem,
          valueProp: profile.valueProp,
          audience: profile.audience,
          audiencePain: profile.audiencePain,
          audienceOutcome: profile.audienceOutcome,
          sourceUrl: profile.method === "model" || profile.method === "basic" ? profile.website || "" : "",
          channels,
          positioning: profile.positioning,
          category: profile.category,
          pricing: profile.pricing,
          tone: profile.tone,
          primaryCta: profile.primaryCta,
          features: cap(profile.features, 12, 200),
          differentiators: cap(profile.differentiators, 6, 300),
          problemsSolved: cap(profile.problemsSolved, 6, 300),
          proof: cap(profile.proof, 8, 300),
          // The market half: only what the founder kept, and only once a scan has run.
          ...(analysisId ? { analysisId } : {}),
          ...(research
            ? {
                competitors: competitors.slice(0, 8).map((c) => ({
                  name: c.name.slice(0, 80),
                  url: c.url.slice(0, 300),
                  tagline: (c.tagline || c.description).slice(0, 300),
                  verified: c.verified,
                  source: c.source,
                })),
                opportunities: research.opportunities
                  .filter((o) => kept.has(o.id))
                  .slice(0, 6)
                  .map((o) => ({
                    title: o.title.slice(0, 140),
                    rationale: o.rationale.slice(0, 600),
                    firstStep: o.firstStep.slice(0, 300),
                    confidence: o.confidence,
                    evidence: o.evidence.slice(0, 8).map((e) => ({ label: e.label.slice(0, 300), url: e.url?.slice(0, 500) })),
                  })),
              }
            : {}),
        }),
      });
      const snapshotBody = (await snapshotRes.json().catch(() => ({}))) as { error?: string };
      if (!snapshotRes.ok) throw new Error(snapshotBody.error || "Could not save the product profile.");

      const rawInput = [objective.trim(), `This cycle distributes ${update.trim() || `the product ${profile.name.trim()}`}.`].join(". ");
      const goalRes = await fetch("/api/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rawInput, description: update.trim(), successMetric: metric.trim(), metricTarget: targetNum, deadlineDays: daysNum, channels }),
      });
      const goalBody = (await goalRes.json().catch(() => ({}))) as { goal?: { id: string }; error?: string };
      if (!goalRes.ok || !goalBody.goal) throw new Error(goalBody.error || "Could not start the cycle.");
      if (firstCycle) {
        let timeZone: string | undefined;
        try {
          timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch {
          timeZone = undefined;
        }
        // Best effort: the cycle exists either way; onboarding can be finished later from Settings.
        await fetch("/api/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ timeZone }) }).catch(() => null);
      }
      router.push(`/app/cycles/${goalBody.goal.id}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const siteRead = profile.method === "model" || profile.method === "basic";
  const scanProgress = {
    state: researchState,
    competitors: competitors.length,
    verified: competitors.filter((c) => c.verified).length,
    conversations: research?.conversations.length ?? 0,
    leads: research?.leads.length ?? 0,
    opportunities: research?.opportunities.length ?? 0,
    trendsState,
    trending: trends ? trends.platforms.reduce((n, p) => n + p.items.length, 0) : 0,
    livePlatforms: trends ? trends.platforms.filter((p) => p.status === "live").length : 0,
    platforms: trends?.platforms.length ?? 0,
  };
  const marketCounts: Record<MarketTab, number> = {
    opportunities: scanProgress.opportunities,
    competitors: scanProgress.competitors,
    conversations: scanProgress.conversations,
    signals: scanProgress.leads,
    trending: scanProgress.trending,
  };
  const marketProps = {
    startIndex: 1,
    state: researchState,
    research,
    canScan: Boolean(analysisId),
    competitors,
    onCompetitorsChange: (c: Competitor[]) => {
      setCompetitors(c);
      setResearchDirty(true);
    },
    queries,
    onQueriesChange: (q: string[]) => {
      setQueries(q);
      setResearchDirty(true);
    },
    kept,
    onToggleKept: (id: string) =>
      setKept((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    onScan: () => void scanMarket(analysisId, Boolean(research)),
    onUseOpportunity: useOpportunity,
    dirty: researchDirty,
  };
  // Without a site read there is no market to map: the market step is skipped.
  const skipMarket = !analysisId && !research;

  return (
    <form onSubmit={startCycle} className="space-y-8">
      {phase !== "url" && (
        <Progress
          phase={phase}
          reached={reached}
          skipMarket={skipMarket}
          onGo={(i) => go(i === 0 ? "url" : i === 1 ? "confirm" : i === 2 ? "market" : "cycle")}
        />
      )}

      {phase === "url" && (
        <div className="mx-auto max-w-3xl">
          <div className="text-center">
            <h1 className="font-serif text-[34px] leading-[1.1] tracking-[-0.02em] text-forest-deep sm:text-[44px]">
              {firstCycle ? "Your product and its market, in one read." : "Start with your website."}
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-charcoal-soft">
              Paste your site. Banyan reads it, maps the market around it, and turns what it finds into your first distribution cycle.
              You check everything; nothing is made up.
            </p>
          </div>

          <div className="mx-auto mt-8 max-w-xl">
            <label htmlFor="intake-url" className="sr-only">Your product&apos;s website</label>
            <div className="flex flex-col gap-2 rounded-2xl border border-bark/12 bg-white p-2 shadow-[0_12px_32px_-16px_rgba(14,42,33,0.25)] sm:flex-row">
              <div className="relative flex-1">
                <Globe2 size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
                <input
                  id="intake-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void readSite();
                    }
                  }}
                  placeholder="yourproduct.com"
                  inputMode="url"
                  autoComplete="url"
                  autoFocus
                  className="h-12 w-full rounded-xl bg-transparent pl-11 pr-3 text-[17px] text-charcoal placeholder:text-muted focus:outline-none"
                />
              </div>
              <Button type="button" onClick={readSite} disabled={busy} className="h-12 rounded-xl px-6 text-[15px]">
                Read my site <ArrowRight size={16} aria-hidden="true" />
              </Button>
            </div>
            {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px]">
              {initialProfile && (
                <button type="button" onClick={useSaved} className="inline-flex items-center gap-1.5 font-medium text-forest hover:underline">
                  <ShieldCheck size={14} aria-hidden="true" /> Use my saved profile ({initialProfile.name})
                </button>
              )}
              <button type="button" onClick={startScratch} className="inline-flex items-center gap-1.5 text-charcoal-soft hover:text-charcoal">
                <PenLine size={14} aria-hidden="true" /> No website yet? Start from scratch
              </button>
            </div>
          </div>

          {/* What you'll get: the promise, before the wait. */}
          <ul className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              { icon: UserRound, title: "Your product, understood", body: "What it does, who it's for, positioning, proof and pricing, each with the page it came from." },
              { icon: Swords, title: "Your competitors", body: "Read from their own websites: what they promise, what they charge, what they ask for." },
              { icon: MessageSquare, title: "Where buyers talk", body: "Public threads about your category, and people already asking for a tool like yours." },
              { icon: TrendingUp, title: "What's trending, and what to post", body: "Platform by platform, from YouTube and Reddit to TikTok and LinkedIn." },
            ].map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3 rounded-2xl border border-bark/10 bg-white/70 p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sage/50 text-forest-deep" aria-hidden="true">
                  <Icon size={17} />
                </span>
                <span>
                  <span className="block text-[14px] font-medium text-charcoal">{title}</span>
                  <span className="mt-0.5 block text-[13px] leading-5 text-muted">{body}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-center text-[12px] leading-5 text-muted">
            Read-only: Banyan never logs in, posts or contacts anyone. Only search terms leave Banyan.{" "}
            {!firstCycle && (
              <>
                Already know what you want? <Link href="/app/goals" className="font-medium text-forest hover:underline">Start from a goal</Link>.
              </>
            )}
          </p>
        </div>
      )}

      {phase === "reading" && (
        <div className="mx-auto max-w-3xl">
          <ReadingProgress url={url} status={readingStatus} onCancel={cancelReading} />
        </div>
      )}

      {phase === "confirm" && (
        <ConfirmStep
          profile={profile}
          edited={edited}
          set={set}
          onBack={() => go("url")}
          onReread={() => void readSite()}
          onContinue={() => (skipMarket ? toCycle() : go("market"))}
          scan={skipMarket ? undefined : scanProgress}
        />
      )}

      {phase === "market" && (
        <MarketStep
          research={research}
          researchState={researchState}
          trends={trends}
          trendsState={trendsState}
          canScan={Boolean(analysisId)}
          angle={angle}
          counts={marketCounts}
          onScan={() => void scanMarket(analysisId, Boolean(research))}
          onBack={() => go("confirm")}
          onContinue={toCycle}
          renderTab={(tab) =>
            tab === "trending" ? (
              <TrendRadar
                state={trendsState}
                trends={trends}
                canRun={Boolean(analysisId) && researchState === "ready"}
                googleTrends={googleTrendsLink([...competitors.filter((c) => c.verified).slice(0, 3).map((c) => c.name), ...(trends?.terms ?? queries).slice(0, 2)])}
                onRun={() => void runTrends()}
                onUseIdea={useIdea}
              />
            ) : (
              <MarketSections {...marketProps} only={tab} />
            )
          }
        />
      )}

      {phase === "cycle" && (
        <div className="mx-auto max-w-3xl space-y-5">
          <header>
            <h2 className="font-serif text-[28px] leading-tight tracking-[-0.015em] text-forest-deep sm:text-[32px]">
              Your first cycle for {profile.name || "your product"}.
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-charcoal-soft">
              One angle, one number, two or three channels. Banyan drafts the strategy and three posts; nothing publishes until you approve it.
            </p>
          </header>

          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-serif text-lg text-forest-deep">The angle</h3>
              {!skipMarket && (
                <button type="button" onClick={() => go("market")} className="text-[13px] font-medium text-forest hover:underline">
                  {angle ? "Change" : "Pick one from your market"}
                </button>
              )}
            </div>
            {angle && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-sage/50 px-2 py-0.5 text-[12px] font-medium text-forest-deep">
                <Sparkles size={12} aria-hidden="true" /> From {angle.source === "opportunity" ? "an opportunity" : "a content idea"}
              </p>
            )}
            <div className="mt-3">
              <Field label="What will this cycle say?" hint="A launch, a feature, a lesson, or the angle you picked. Leave it empty to introduce the product itself.">
                <Textarea value={update} onChange={(e) => setUpdate(e.target.value)} rows={3} maxLength={1000} placeholder="e.g. We shipped offline mode, so invoices go out even on a plane." />
              </Field>
            </div>
            {research && research.opportunities.some((o) => kept.has(o.id)) && (
              <div className="mt-3">
                <p className="text-[12px] font-medium text-charcoal-soft">Or one of the opportunities you kept</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {research.opportunities
                    .filter((o) => kept.has(o.id))
                    .map((o) => {
                      const chosen = update.startsWith(o.title);
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => {
                            const detail = `${o.title}. ${o.firstStep}`.slice(0, 1000);
                            setAngle({ source: "opportunity", title: o.title, detail });
                            setUpdate(detail);
                          }}
                          aria-pressed={chosen}
                          className={`max-w-full truncate rounded-lg border px-2.5 py-1.5 text-left text-[13px] transition ${chosen ? "border-forest bg-forest/[0.06] text-forest-deep" : "border-bark/15 bg-white text-charcoal-soft hover:border-forest/30"}`}
                        >
                          {o.title}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </Card>

          <Card>
            <h3 className="font-serif text-lg text-forest-deep">The goal</h3>
            <div className="mt-3">
              <Field label="Objective" required hint={goalReason ? `Suggested. ${goalReason}` : "The outcome, not the activity."}>
                <Input value={objective} onChange={(e) => touchGoal(setObjective)(e.target.value)} maxLength={300} />
              </Field>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="Metric" required>
                  <Input value={metric} onChange={(e) => touchGoal(setMetric)(e.target.value)} maxLength={60} placeholder="signups" />
                </Field>
                <Field label="Target" required>
                  <Input type="number" min={0} max={1_000_000} value={target} onChange={(e) => touchGoal(setTarget)(e.target.value)} />
                </Field>
                <Field label="Window (days)" required>
                  <Input type="number" min={1} max={365} value={days} onChange={(e) => touchGoal(setDays)(e.target.value)} />
                </Field>
              </div>
            </div>
          </Card>

          <Card>
            <fieldset>
              <legend className="font-serif text-lg text-forest-deep">Channels</legend>
              <p className="mt-0.5 text-[13px] text-muted">At least two, and at least one of X or LinkedIn so the cycle can publish.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {CHANNELS.map((opt) => {
                  const checked = channels.includes(opt.key);
                  return (
                    <label
                      key={opt.key}
                      className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors ${checked ? "border-forest/35 bg-forest/[0.04]" : "border-bark/12 bg-white hover:border-forest/25"}`}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleChannel(opt.key)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#23523f]" />
                      <span>
                        <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-charcoal">
                          {opt.label}
                          {!opt.live && <Badge variant="warm">manual</Badge>}
                        </span>
                        <span className="mt-0.5 block text-[12px] leading-relaxed text-muted">{opt.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {channels.length < 2 || !channels.some((c) => c !== "shortvideo") ? (
                <p className="mt-2 text-xs text-clay" role="status">A complete cycle needs two channels and at least one live channel.</p>
              ) : null}
            </fieldset>
          </Card>

          {error && <ErrorNote>{error}</ErrorNote>}

          <StepFooter
            onBack={() => go(skipMarket ? "confirm" : "market")}
            hint="Drafts the strategy and three posts. Nothing publishes without your approval."
            primary={
              <Button type="submit" disabled={busy} className="h-10 rounded-xl px-4">
                {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Sparkles size={15} aria-hidden="true" />}
                {busy ? "Starting…" : "Start the cycle"}
              </Button>
            }
          />
        </div>
      )}
    </form>
  );
}
