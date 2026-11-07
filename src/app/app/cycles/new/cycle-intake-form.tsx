"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Eye, FileText, Globe2, Loader2, Lock, PenLine, ShieldCheck, Sparkles } from "lucide-react";
import { Badge, Button, Card, ErrorNote, Field, Input, Textarea } from "@/components/ui";
import type { ProductAnalysisResult } from "@/lib/product/analyze";
import { BLANK_INTAKE, intakeFromAnalysis, suggestCycle, type IntakeProfile } from "@/lib/product/intake-profile";
import { ReadingProgress, type ReadingStatus } from "./intake/reading-progress";
import { Understood } from "./intake/understood";

type Channel = "x" | "linkedin" | "shortvideo";
type Phase = "url" | "reading" | "review" | "cycle";

const CHANNELS: { key: Channel; label: string; hint: string; live: boolean }[] = [
  { key: "linkedin", label: "LinkedIn", hint: "Published through your connection, after your approval.", live: true },
  { key: "x", label: "X", hint: "Published through your connection, after your approval.", live: true },
  { key: "shortvideo", label: "Short-form video", hint: "Banyan writes the script; you record and post it.", live: false },
];

const STEPS = ["Your site", "What Banyan understood", "Your first cycle"];
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

function Stepper({ phase }: { phase: Phase }) {
  const current = phase === "url" || phase === "reading" ? 0 : phase === "review" ? 1 : 2;
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-[13px]" aria-label="Steps">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              aria-current={active ? "step" : undefined}
              className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors ${
                done ? "border-forest bg-forest text-ivory" : active ? "border-forest-deep bg-forest-deep text-ivory" : "border-bark/15 bg-white text-muted"
              }`}
            >
              {done ? <Check size={13} aria-hidden="true" /> : i + 1}
            </span>
            <span className={active ? "font-medium text-forest-deep" : done ? "text-charcoal-soft" : "text-muted"}>{label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 hidden h-px w-8 bg-bark/15 sm:block" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

export default function CycleIntakeForm({
  initialProfile,
  initialUrl = "",
  firstCycle = false,
}: {
  initialProfile: IntakeProfile | null;
  initialUrl?: string;
  /** Onboarding (blocker 04): starting this cycle also finishes onboarding, with the browser's time zone. */
  firstCycle?: boolean;
}) {
  const router = useRouter();
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
    setPhase("review");
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    setPhase("reading");
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
    } catch (err) {
      if (token !== run.current) return;
      setError((err as Error).message);
      setPhase("url");
    } finally {
      if (token === run.current) setBusy(false);
    }
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
    setPhase("cycle");
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  return (
    <form onSubmit={startCycle} className="space-y-6">
      <Stepper phase={phase} />

      {phase === "url" && (
        <Card flush>
          <div className="p-6 sm:p-8">
            <h2 className="font-serif text-2xl tracking-[-0.01em] text-forest-deep sm:text-[28px]">Start with your website.</h2>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-charcoal-soft">
              Banyan reads your site and fills in your product, audience, positioning, proof and pricing for you. You check it, fix
              anything it got wrong, and the cycle starts from there.
            </p>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <label htmlFor="intake-url" className="sr-only">Your product&apos;s website</label>
              <div className="relative flex-1">
                <Globe2 size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
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
                  className="h-12 w-full rounded-xl border border-bark/15 bg-white pl-10 pr-3 text-base text-charcoal placeholder:text-muted transition-colors focus:border-forest/55 focus:outline-none focus:ring-4 focus:ring-forest/10"
                />
              </div>
              <Button type="button" onClick={readSite} disabled={busy} className="h-12 rounded-xl px-5 text-[15px]">
                Read my site <ArrowRight size={16} aria-hidden="true" />
              </Button>
            </div>

            {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
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

          <ul className="grid gap-px border-t border-bark/10 bg-bark/10 sm:grid-cols-3">
            {[
              { icon: FileText, title: "Up to 5 public pages", body: "Home, then pricing, about, features and customers when you link them." },
              { icon: Eye, title: "Nothing made up", body: "Every field shows the page it came from. What your site doesn't say, you add." },
              { icon: Lock, title: "Public pages only", body: "Banyan never logs in, and refuses private network addresses." },
            ].map(({ icon: Icon, title, body }) => (
              <li key={title} className="bg-white px-6 py-4">
                <p className="flex items-center gap-2 text-[13px] font-medium text-charcoal">
                  <Icon size={14} className="text-moss" aria-hidden="true" /> {title}
                </p>
                <p className="mt-1 text-[13px] leading-5 text-muted">{body}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {phase === "reading" && <ReadingProgress url={url} status={readingStatus} onCancel={cancelReading} />}

      {phase === "review" && (
        <Understood profile={profile} edited={edited} set={set} onContinue={toCycle} onReread={() => void readSite()} />
      )}

      {phase === "cycle" && (
        <Card className="p-6 sm:p-8">
          <h2 className="font-serif text-2xl tracking-[-0.01em] text-forest-deep">Your first cycle for {profile.name || "your product"}</h2>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-charcoal-soft">
            One objective, one number, two or three channels. Banyan drafts the strategy and the posts; nothing publishes until you approve it.
          </p>

          <div className="mt-6 grid gap-5">
            <Field label="What are you shipping or announcing?" hint="A launch, a feature, a lesson. Leave it empty to introduce the product itself.">
              <Textarea value={update} onChange={(e) => setUpdate(e.target.value)} rows={3} maxLength={1000} placeholder="e.g. We shipped offline mode, so invoices go out even on a plane." />
            </Field>

            <div className="rounded-xl border border-bark/10 bg-ivory/40 p-4">
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

            <fieldset>
              <legend className="text-[13px] font-medium text-charcoal">
                Channels <span className="text-clay" aria-hidden="true">*</span>
              </legend>
              <p className="mt-1 text-[13px] text-muted">At least two, and at least one of X or LinkedIn so the cycle can publish.</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
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
          </div>

          {error && <div className="mt-5"><ErrorNote>{error}</ErrorNote></div>}

          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-bark/10 pt-5">
            <Button type="submit" disabled={busy} className="h-11 rounded-xl px-5">
              {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Sparkles size={15} aria-hidden="true" />}
              {busy ? "Starting…" : "Start the cycle"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => { setPhase("review"); setError(null); }} disabled={busy}>
              <ArrowLeft size={14} aria-hidden="true" /> Back to your profile
            </Button>
            <span className="text-[13px] text-muted">Drafts the strategy and three posts. Nothing publishes without your approval.</span>
          </div>
        </Card>
      )}

      {phase === "url" && (
        <p className="text-[13px] leading-relaxed text-muted">
          Already know what you want? <Link href="/app/goals" className="font-medium text-forest hover:underline">Start from a goal</Link> instead.
        </p>
      )}
    </form>
  );
}
