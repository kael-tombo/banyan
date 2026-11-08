"use client";

import { useState, FormEvent, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, ErrorNote, Field, Input, Select, Textarea, EmptyState } from "@/components/ui";
import { BanyanMark } from "@/components/BanyanMark";
import {
  CheckCircle2, AlertTriangle, Eye, FileText, Sparkles, ArrowRight, ArrowLeft, SkipForward, Users2, Compass, Megaphone,
} from "lucide-react";

type StepState = {
  workspace: { workspaceName: string; businessName: string; industry: string; businessModel: string; timeZone: string };
  product: { name: string; description: string; website: string; stage: string; problem: string; valueProp: string };
  audience: { audience: string; pain: string; outcome: string; geography: string };
  goal: { goal: string; goalTarget: number | null; goalMetric: string };
  channels: string[];
  voice: {
    tone: string; language: string; themes: string; avoid: string; cta: string; approvalPreference: string;
  };
};

const STAGES = [
  ["idea", "Idea"], ["building", "Building"], ["private_beta", "Private beta"],
  ["public_beta", "Public beta"], ["launched", "Launched"], ["growth", "Growing"],
];
const GOALS = [
  ["first_users", "Find first users"], ["launch", "Launch a product"], ["audience", "Grow an audience"],
  ["leads", "Generate qualified leads"], ["activation", "Improve activation"], ["conversions", "Increase conversions"],
];
const CHANNEL_OPTIONS = [
  ["x", "X — posts and threads"],
  ["linkedin", "LinkedIn — posts"],
  ["shortvideo", "Short-form video — scripting only; production is manual"],
];

const BUSINESS_MODELS = [
  ["saas", "Software (SaaS)"], ["app", "Mobile or desktop app"], ["marketplace", "Marketplace"],
  ["ecommerce", "E-commerce"], ["services", "Services or agency"], ["other", "Other"],
];

export type StageView = { key: string; label: string; required: boolean; status: "done" | "skipped" | "not_started" };

/** Wizard step to resume at, from the nine-stage progress (US-018). */
export function resumeStep(stages: StageView[]): number {
  const st = (k: string) => stages.find((x) => x.key === k)?.status ?? "not_started";
  if (st("workspace") !== "done") return 0;
  if (st("business") !== "done") return 1;
  if (st("preferences") !== "done") return 4;
  if (st("brand") === "not_started") return 5;
  return 6;
}

async function skipStage(stage: string) {
  const res = await fetch("/api/onboarding/progress", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ stage, action: "skip" }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not skip this stage.");
  }
  return (await res.json()) as { stages: StageView[] };
}

async function saveStep(step: string, data: unknown) {
  const res = await fetch("/api/onboarding", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ step, data }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Could not save ${step}.`);
  }
}

export function OnboardingWizard({
  workspaceName,
  initialSteps,
  initialStages,
}: {
  workspaceName: string;
  initialSteps: StepState;
  initialStages: StageView[];
}) {
  const router = useRouter();
  // Resume where the founder left off (US-018).
  const [stepIdx, setStepIdx] = useState(() => resumeStep(initialStages));
  const [stages, setStages] = useState<StageView[]>(initialStages);

  // Until the workspace stage is saved, default the time zone to the browser's (US-019).
  useEffect(() => {
    if (initialStages.find((x) => x.key === "workspace")?.status === "done") return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) setState((s) => (s.workspace.timeZone === "UTC" ? { ...s, workspace: { ...s.workspace, timeZone: tz } } : s));
  }, [initialStages]);
  const [state, setState] = useState<StepState>(initialSteps);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 6 (plan) is loaded on arrival.
  const [plan, setPlan] = useState<{
    plan: { positioning: string; contentThemes: string[]; channelFocus: string[]; initialCampaign: { name: string; keyMessage: string; cta: string }; experiments: { title: string; hypothesis: string; variable: string }[] };
    isFallback: boolean; label: string;
  } | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  useEffect(() => {
    if (stepIdx !== 6 || plan || planError) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const res = await fetch("/api/onboarding");
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Plan generation failed.");
        }
        const data = await res.json();
        if (!cancelled) setPlan(data);
      } catch (err) {
        if (!cancelled) setPlanError((err as Error).message);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [stepIdx, plan, planError]);

  const steps = ["Workspace", "Product", "Audience", "Goal", "Channels", "Voice", "First plan"];

  async function refreshStages() {
    const res = await fetch("/api/onboarding/progress");
    if (res.ok) setStages(((await res.json()) as { stages: StageView[] }).stages);
  }

  async function next() {
    setBusy(true);
    setError(null);
    try {
      if (stepIdx === 0) await saveStep("workspace", state.workspace);
      if (stepIdx === 1) await saveStep("product", state.product);
      if (stepIdx === 2) await saveStep("audience", state.audience);
      if (stepIdx === 3) await saveStep("goal", { ...state.goal, goalTarget: state.goal.goalTarget ?? null });
      if (stepIdx === 4) await saveStep("channels", { channels: state.channels });
      if (stepIdx === 5) await saveStep("voice", state.voice);
      await refreshStages();
      setStepIdx((i) => Math.min(i + 1, 6));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function skipStep() {
    setError(null);
    try {
      // Voice is the optional brand stage: record the skip so resume passes it.
      // Audience and goal belong to the required business stage, so skipping
      // them here only moves on; onboarding comes back to them.
      if (stepIdx === 5) setStages((await skipStage("brand")).stages);
      setStepIdx((i) => Math.min(i + 1, 6));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function complete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", { method: "POST", body: JSON.stringify({}) });
      if (!res.ok) throw new Error("Could not finish onboarding.");
      router.push("/app");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="app-canvas min-h-screen">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Banyan.ai home">
            <BanyanMark size={24} />
            <span className="font-serif text-[17px] text-forest-deep">
              Banyan<span className="text-fig-deep">.ai</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Badge variant="warm">{workspaceName}</Badge>
            <Link href="/app" className="text-[12.5px] font-medium text-charcoal-soft underline-offset-4 hover:text-forest-deep hover:underline">
              Skip for now
            </Link>
          </div>
        </div>

        <div className="mt-9">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-charcoal-soft/70">
            Workspace setup · optional
          </p>
          <h1 className="mt-2 font-serif text-[32px] leading-[1.1] tracking-[-0.02em] text-forest-deep">
            Ground the system in your product.
          </h1>
          <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-charcoal-soft">
            Your workspace is already created and usable. Finish these steps whenever you like so generation is
            grounded in your real product, audience and voice.
          </p>
        </div>

        <StageRail stages={stages} />
        <ProgressTrack current={stepIdx} labels={steps} />

        <Card className="mt-6 min-h-[28rem] p-6">
          {stepIdx === 0 && <WorkspaceStep state={state} setState={setState} />}
          {stepIdx === 1 && <ProductStep state={state} setState={setState} />}
          {stepIdx === 2 && <AudienceStep state={state} setState={setState} />}
          {stepIdx === 3 && <GoalStep state={state} setState={setState} />}
          {stepIdx === 4 && <ChannelsStep state={state} setState={setState} />}
          {stepIdx === 5 && <VoiceStep state={state} setState={setState} />}
          {stepIdx === 6 && <PlanStep plan={plan} planError={planError} />}
        </Card>

        <ErrorNote>{error}</ErrorNote>

        <div className="mt-6 flex items-center justify-between">
          <div>
            {stepIdx > 0 && stepIdx < 6 && (
              <Button variant="ghost" onClick={() => setStepIdx((i) => i - 1)} disabled={busy}>
                <ArrowLeft size={16} /> Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {(stepIdx === 2 || stepIdx === 3 || stepIdx === 5) && (
              <Button variant="secondary" onClick={skipStep} disabled={busy}>
                <SkipForward size={16} /> Skip for now
              </Button>
            )}
            {stepIdx < 6 ? (
              <Button
                onClick={next}
                disabled={
                  busy ||
                  (stepIdx === 0 && (!state.workspace.workspaceName || !state.workspace.businessName || !state.workspace.industry)) ||
                  (stepIdx === 1 && !state.product.name) ||
                  (stepIdx === 4 && state.channels.length === 0)
                }
              >
                {busy ? "Saving…" : "Continue"} <ArrowRight size={16} />
              </Button>
            ) : (
              <Button onClick={complete} disabled={busy || !plan}>
                {busy ? "Setting up…" : "Finish and open workspace"} <CheckCircle2 size={16} />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgressTrack({ current, labels }: { current: number; labels: string[] }) {
  return (
    <div className="mt-6" aria-label={`Step ${current + 1} of ${labels.length}: ${labels[current]}`}>
      <ol className="grid grid-cols-4 gap-x-3 gap-y-3 sm:grid-cols-7">
        {labels.map((l, i) => (
          <li key={l} aria-current={i === current ? "step" : undefined} className="min-w-0">
            <span
              className={`block h-1 rounded-full ${
                i < current ? "bg-forest" : i === current ? "bg-fig" : "bg-bark/15"
              }`}
              aria-hidden="true"
            />
            <span
              className={`mt-2 flex items-baseline gap-1.5 text-[11px] ${
                i === current ? "font-semibold text-forest-deep" : "text-charcoal-soft/75"
              }`}
            >
              <span className="num text-[10px] opacity-60" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="truncate">{l}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The nine onboarding stages and their status (US-018). */
function StageRail({ stages }: { stages: StageView[] }) {
  const settled = stages.filter((s) => s.status !== "not_started").length;
  return (
    <section className="mt-8 rounded-xl border border-bark/10 bg-white/70 p-4" aria-label="Onboarding stages">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-medium text-charcoal">Setup progress</p>
        <p className="num text-xs text-muted">{settled} of {stages.length} stages</p>
      </div>
      <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        {stages.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 text-xs">
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${s.status === "done" ? "bg-forest" : s.status === "skipped" ? "bg-bark/40" : "border border-bark/30"}`}
            />
            <span className={s.status === "done" ? "text-charcoal" : "text-muted"}>
              {s.label}
              <span className="sr-only">: {s.status === "done" ? "done" : s.status === "skipped" ? "skipped" : "not started"}</span>
              {s.status === "skipped" && <span aria-hidden="true"> · skipped</span>}
              {!s.required && s.status === "not_started" && <span aria-hidden="true"> · optional</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function WorkspaceStep({ state, setState }: { state: StepState; setState: (fn: (s: StepState) => StepState) => void }) {
  const w = state.workspace;
  const set = (k: keyof typeof w) => (e: FormEvent<HTMLInputElement | HTMLSelectElement>) =>
    setState((s) => ({ ...s, workspace: { ...s.workspace, [k]: (e.target as HTMLInputElement).value } }));
  return (
    <fieldset className="flex flex-col gap-4">
      <StepIntro step="1" title="Your workspace and business" body="Used to plan and schedule in your own time zone." icon={<Compass size={18} className="text-forest" />} />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Workspace name" required htmlFor="onb-ws-name">
          <Input id="onb-ws-name" value={w.workspaceName} onInput={set("workspaceName")} maxLength={80} />
        </Field>
        <Field label="Business name" required htmlFor="onb-biz-name">
          <Input id="onb-biz-name" value={w.businessName} onInput={set("businessName")} maxLength={120} placeholder="The company or project" />
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Industry" required htmlFor="onb-industry" hint="For example: developer tools, fintech, education.">
          <Input id="onb-industry" value={w.industry} onInput={set("industry")} maxLength={80} />
        </Field>
        <Field label="Business model" required htmlFor="onb-model">
          <Select id="onb-model" value={w.businessModel} onChange={set("businessModel")}>
            {BUSINESS_MODELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Time zone" required htmlFor="onb-tz" hint="Detected from your browser. Schedules are shown in this zone and stored in UTC.">
        <Input id="onb-tz" value={w.timeZone} onInput={set("timeZone")} maxLength={60} />
      </Field>
    </fieldset>
  );
}

function ProductStep({ state, setState }: { state: StepState; setState: (fn: (s: StepState) => StepState) => void }) {
  const p = state.product;
  const set = (k: keyof typeof p) => (e: FormEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setState((s) => ({ ...s, product: { ...s.product, [k]: (e.target as HTMLInputElement).value } }));
  return (
    <fieldset className="flex flex-col gap-4">
      <StepIntro step="2" title="Tell the system about your product" body="Everything Banyan generates is grounded in what you write here." icon={<FileText size={18} className="text-forest" />} />
      <Field label="Product name" required htmlFor="onb-name">
        <Input id="onb-name" value={p.name} onInput={set("name")} maxLength={120} placeholder="Your product" />
      </Field>
      <Field label="Description" required hint="What it is and what it does — 1–3 sentences.">
        <Textarea value={p.description} onInput={set("description")} rows={3} maxLength={2000} placeholder="Describe your product plainly." />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Website (optional)" htmlFor="onb-website">
          <Input id="onb-website" value={p.website} onInput={set("website")} placeholder="https://…" inputMode="url" />
        </Field>
        <Field label="Product stage" required htmlFor="onb-stage">
          <Select id="onb-stage" value={p.stage} onChange={set("stage")}>
            {STAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Problem it solves" required hint="The bottleneck it removes, in one clear paragraph.">
        <Textarea value={p.problem} onInput={set("problem")} rows={3} maxLength={1000} />
      </Field>
      <Field label="Main value proposition" required hint="The single outcome people come for.">
        <Textarea value={p.valueProp} onInput={set("valueProp")} rows={2} maxLength={500} />
      </Field>
    </fieldset>
  );
}

function AudienceStep({ state, setState }: { state: StepState; setState: (fn: (s: StepState) => StepState) => void }) {
  const a = state.audience;
  const set = (k: keyof typeof a) => (e: FormEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setState((s) => ({ ...s, audience: { ...s.audience, [k]: (e.target as HTMLInputElement).value } }));
  return (
    <fieldset className="flex flex-col gap-4">
      <StepIntro step="3" title="Who are you reaching?" body="Recorded as a low-confidence assumption until you validate it — the system will treat it that way." icon={<Users2Icon />} />
      <Field label="Target audience" required htmlFor="onb-aud">
        <Input id="onb-aud" value={a.audience} onInput={set("audience")} placeholder="e.g. early-stage B2B SaaS founders" maxLength={300} />
      </Field>
      <Field label="Main pain point" required>
        <Textarea id="onb-pain" value={a.pain} onInput={set("pain")} rows={2} maxLength={500} />
      </Field>
      <Field label="Desired customer outcome" required>
        <Textarea id="onb-out" value={a.outcome} onInput={set("outcome")} rows={2} maxLength={500} />
      </Field>
      <Field label="Geography or market (optional)">
        <Input id="onb-geo" value={a.geography} onInput={set("geography")} maxLength={200} placeholder="e.g. EU SaaS founders" />
      </Field>
    </fieldset>
  );
}

function GoalStep({ state, setState }: { state: StepState; setState: (fn: (s: StepState) => StepState) => void }) {
  const g = state.goal;
  return (
    <fieldset className="flex flex-col gap-4">
      <StepIntro step="4" title="What should distribution achieve?" body="This goal steers campaign recommendations on your dashboard." icon={<CompassIcon />} />
      <Field label="Distribution goal" required>
        <Select value={g.goal} onChange={(e) => setState((s) => ({ ...s, goal: { ...s.goal, goal: e.target.value } }))}>
          {GOALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Numerical target (optional)" hint="A number keeps the goal honest.">
          <Input
            type="number" min={0} inputMode="numeric"
            value={g.goalTarget ?? ""}
            onChange={(e) => setState((s) => ({ ...s, goal: { ...s.goal, goalTarget: e.target.value ? Number(e.target.value) : null } }))}
            placeholder="e.g. 25"
          />
        </Field>
        <Field label="Target metric (optional)" htmlFor="onb-goalMetric">
          <Input
            value={g.goalMetric}
            onChange={(e) => setState((s) => ({ ...s, goal: { ...s.goal, goalMetric: e.target.value } }))}
            placeholder="e.g. signups from campaign links"
            maxLength={120}
          />
        </Field>
      </div>
    </fieldset>
  );
}

function ChannelsStep({ state, setState }: { state: StepState; setState: (fn: (s: StepState) => StepState) => void }) {
  function toggle(key: string) {
    setState((s) => ({
      ...s,
      channels: s.channels.includes(key) ? s.channels.filter((c) => c !== key) : [...s.channels, key],
    }));
  }
  return (
    <fieldset className="flex flex-col gap-4">
      <StepIntro step="5" title="Where do you want to show up?" body="Selecting a channel is not connecting it. Until SocialFlow.ai is available, you publish approved posts yourself and record the live URL." icon={<MegaphoneIcon />} />
      <div className="flex flex-col gap-2">
        {CHANNEL_OPTIONS.map(([key, label]) => (
          <label key={key} className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 text-sm ${state.channels.includes(key) ? "border-forest/40 bg-forest/5" : "border-bark/15 bg-white"}`}>
            <input
              type="checkbox"
              name={`channel-${key}`}
              checked={state.channels.includes(key)}
              onChange={() => toggle(key)}
              className="mt-1 accent-[#1e4d3a]"
              role="checkbox"
            />
            <span className="text-charcoal">{label}</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-charcoal-soft">
        Integration status for X/LinkedIn publishing: <strong>not connected</strong>. Content generation is available immediately.
      </p>
    </fieldset>
  );
}

function VoiceStep({ state, setState }: { state: StepState; setState: (fn: (s: StepState) => StepState) => void }) {
  const v = state.voice;
  const set = (k: keyof typeof v) => (e: FormEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setState((s) => ({ ...s, voice: { ...s.voice, [k]: (e.target as HTMLInputElement).value } }));
  return (
    <fieldset className="flex flex-col gap-4">
      <StepIntro step="6" title="How should it sound?" body="Applied to every generated draft. You review everything before publishing — approval is enforced in the backend, not just the UI." icon={<Eye size={18} className="text-forest" />} />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Tone" required htmlFor="onb-tone">
          <Input id="onb-tone" value={v.tone} onInput={set("tone")} placeholder="direct, plain-spoken" maxLength={200} />
        </Field>
        <Field label="Language" required htmlFor="onb-lang">
          <Input id="onb-lang" value={v.language} onInput={set("language")} maxLength={60} />
        </Field>
      </div>
      <Field label="Content themes" hint="Comma-separated topics to rotate.">
        <Textarea id="onb-themes" value={v.themes} onInput={set("themes")} rows={2} maxLength={500} />
      </Field>
      <Field label="Topics to avoid">
        <Textarea id="onb-avoid" value={v.avoid} onInput={set("avoid")} rows={2} maxLength={500} placeholder="e.g. competitor bashing, politics, hype claims" />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Preferred call to action" htmlFor="onb-cta">
          <Input id="onb-cta" value={v.cta} onInput={set("cta")} placeholder="Try it and tell us what's missing" maxLength={200} />
        </Field>
        <Field label="Approval preference" required>
          <Select value={v.approvalPreference} onChange={set("approvalPreference")}>
            <option value="manual_everything">Manual — every item approved by me</option>
            <option value="manual_external_only">Manual — required for anything external</option>
          </Select>
        </Field>
      </div>
    </fieldset>
  );
}

type PlanShape = {
  positioning: string;
  contentThemes: string[];
  channelFocus: string[];
  initialCampaign: { name: string; keyMessage: string; cta: string };
  experiments: { title: string; hypothesis: string; variable: string }[];
};

function PlanStep({ plan, planError }: { plan: { plan: PlanShape; isFallback: boolean; label: string } | null; planError: string | null }) {
  if (planError) {
    return <EmptyState title="Couldn't generate a plan" body={planError + " You can still finish onboarding and generate a plan later from the workspace."} icon={<AlertTriangle size={24} />} />;
  }
  if (!plan) {
    return <EmptyState title="Drafting your first plan…" body="Banyan is assembling an initial hypothesis-driven distribution plan from your inputs. This stays available even if no model credentials are configured (a template plan will be drafted instead)." icon={<Sparkles size={24} className="animate-pulse" />} />;
  }
  const p = plan.plan;
  return (
    <div className="flex flex-col gap-5" aria-live="polite">
      <StepIntro step="7" title="Your first draft plan — review required" body="Everything below is a hypothesis to test, not a conclusion. Accept it, ignore it, or edit it later in the workspace." icon={<Sparkles size={18} className="text-forest" />} />
      <Badge variant={plan.isFallback ? "warm" : "forest"} className="w-fit">
        {plan.label}
      </Badge>

      <div className="rounded-lg border border-bark/15 bg-ivory-deep/50 p-4 text-sm">
        <h3 className="font-semibold text-forest-deep">Proposed positioning</h3>
        <p className="mt-1 text-charcoal-soft">{p.positioning}</p>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-forest-deep">Three content themes</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-charcoal-soft">
          {p.contentThemes.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-forest-deep">Suggested channel focus</h3>
        <p className="mt-2 flex flex-wrap gap-2">
          {p.channelFocus.map((c) => (
            <Badge key={c} variant="moss">{c === "shortvideo" ? "Short-form video" : c === "x" ? "X" : "LinkedIn"}</Badge>
          ))}
        </p>
      </div>

      <div className="rounded-lg rooted-fig border border-forest/20 bg-white p-4 text-sm">
        <h3 className="font-semibold text-forest-deep">Starter campaign</h3>
        <p className="mt-1 font-medium text-charcoal">{p.initialCampaign.name}</p>
        <p className="mt-1 text-charcoal-soft">{p.initialCampaign.keyMessage}</p>
        <p className="mt-1 text-charcoal-soft">CTA: {p.initialCampaign.cta}</p>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-forest-deep">Initial experiments</h3>
        <ul className="mt-2 space-y-2 text-sm text-charcoal-soft">
          {p.experiments.map((x, i) => (
            <li key={i} className="rounded-md border border-bark/10 bg-ivory px-3 py-2">
              <strong className="text-charcoal">{x.title}</strong> — {x.hypothesis} <em>(variable: {x.variable})</em>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-charcoal-soft">
        Nothing has been executed yet. Finishing onboarding creates the workspace and checks whether this plan ran — it never reports invented results.
      </p>
    </div>
  );
}

function StepIntro({ step, title, body, icon }: { step: string; title: string; body: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3.5">
      <span
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-forest/15 bg-forest/[0.06] text-[12px] font-semibold text-forest num"
        aria-hidden="true"
      >
        {String(step).padStart(2, "0")}
      </span>
      <div>
        <h2 className="flex items-center gap-2 font-serif text-[22px] leading-tight tracking-[-0.01em] text-forest-deep">
          {title} <span className="text-forest" aria-hidden="true">{icon}</span>
        </h2>
        <p className="mb-2 mt-1 text-[13px] leading-relaxed text-charcoal-soft">{body}</p>
      </div>
    </div>
  );
}

function Users2Icon() { return <Users2 size={18} className="text-forest" />}
function CompassIcon() { return <Compass size={18} className="text-forest" />}
function MegaphoneIcon() { return <Megaphone size={18} className="text-forest" />}
