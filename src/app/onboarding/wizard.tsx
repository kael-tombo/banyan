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
  ["x", "X — posts and threads published via Postiz once connected"],
  ["linkedin", "LinkedIn — posts published via Postiz once connected"],
  ["shortvideo", "Short-form video — scripting only; production is manual"],
];

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

export function OnboardingWizard({ workspaceName, initialSteps }: { workspaceName: string; initialSteps: StepState }) {
  const router = useRouter();
  const [stepIdx, setStepIdx] = useState(0);
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
    if (stepIdx !== 5 || plan || planError) return;
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

  const steps = ["Product", "Audience", "Goal", "Channels", "Voice", "First plan"];

  async function next() {
    setBusy(true);
    setError(null);
    try {
      if (stepIdx === 0) await saveStep("product", state.product);
      if (stepIdx === 1) await saveStep("audience", state.audience);
      if (stepIdx === 2) await saveStep("goal", { ...state.goal, goalTarget: state.goal.goalTarget ?? null });
      if (stepIdx === 3) await saveStep("channels", { channels: state.channels });
      if (stepIdx === 4) await saveStep("voice", state.voice);
      setStepIdx((i) => Math.min(i + 1, 5));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function skipStep() {
    // Optional steps are skipped legitimately: progress is saved only for
    // steps with required fields (product); audience/goal/channels keep defaults.
    setStepIdx((i) => Math.min(i + 1, 5));
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
    <div className="grain min-h-screen bg-ivory">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BanyanMark size={24} />
            <span className="font-serif text-lg text-forest-deep">
              Banyan<span className="text-moss">.ai</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="warm">{workspaceName}</Badge>
            <Link href="/app" className="text-sm text-charcoal-soft hover:text-forest-deep">
              Skip for now
            </Link>
          </div>
        </div>

        <p className="mt-4 text-sm text-charcoal-soft">
          Optional — your workspace is already created and usable. Finish these steps whenever you like to ground
          generation in your real product.
        </p>

        <ProgressTrack current={stepIdx} labels={steps} />

        <Card className="mt-6 min-h-[28rem] p-6">
          {stepIdx === 0 && <ProductStep state={state} setState={setState} />}
          {stepIdx === 1 && <AudienceStep state={state} setState={setState} />}
          {stepIdx === 2 && <GoalStep state={state} setState={setState} />}
          {stepIdx === 3 && <ChannelsStep state={state} setState={setState} />}
          {stepIdx === 4 && <VoiceStep state={state} setState={setState} />}
          {stepIdx === 5 && <PlanStep plan={plan} planError={planError} />}
        </Card>

        <ErrorNote>{error}</ErrorNote>

        <div className="mt-6 flex items-center justify-between">
          <div>
            {stepIdx > 0 && stepIdx < 5 && (
              <Button variant="ghost" onClick={() => setStepIdx((i) => i - 1)} disabled={busy}>
                <ArrowLeft size={16} /> Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {(stepIdx === 1 || stepIdx === 2) && stepIdx < 5 && (
              <Button variant="secondary" onClick={skipStep} disabled={busy}>
                <SkipForward size={16} /> Skip for now
              </Button>
            )}
            {stepIdx < 5 ? (
              <Button onClick={next} disabled={busy || (stepIdx === 0 && !state.product.name) || (stepIdx === 3 && state.channels.length === 0)}>
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
    <div className="mt-8 mb-2 flex flex-wrap items-center gap-x-2 gap-y-2" aria-label={`Step ${current + 1} of ${labels.length}: ${labels[current]}`}>
      {labels.map((l, i) => (
        <div key={l} className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${i < current ? "bg-forest" : i === current ? "bg-clay" : "bg-bark/20"}`}
            aria-hidden="true"
          />
          <span className={`text-xs ${i === current ? "font-semibold text-forest-deep" : "text-charcoal-soft"}`}>{l}</span>
          {i < labels.length - 1 && <span className="h-px w-4 bg-bark/15" aria-hidden="true" />}
        </div>
      ))}
    </div>
  );
}

function ProductStep({ state, setState }: { state: StepState; setState: (fn: (s: StepState) => StepState) => void }) {
  const p = state.product;
  const set = (k: keyof typeof p) => (e: FormEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setState((s) => ({ ...s, product: { ...s.product, [k]: (e.target as HTMLInputElement).value } }));
  return (
    <fieldset className="flex flex-col gap-4">
      <StepIntro step="1" title="Tell the system about your product" body="Everything Banyan generates is grounded in what you write here." icon={<FileText size={18} className="text-forest" />} />
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
      <StepIntro step="2" title="Who are you reaching?" body="Recorded as a low-confidence assumption until you validate it — the system will treat it that way." icon={<Users2Icon />} />
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
      <StepIntro step="3" title="What should distribution achieve?" body="This goal steers campaign recommendations on your dashboard." icon={<CompassIcon />} />
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
      <StepIntro step="4" title="Where do you want to show up?" body="Selecting a channel is not connecting it. Publishing still requires configuring a Postiz connection." icon={<MegaphoneIcon />} />
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
      <StepIntro step="5" title="How should it sound?" body="Applied to every generated draft. You review everything before publishing — approval is enforced in the backend, not just the UI." icon={<Eye size={18} className="text-forest" />} />
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
      <StepIntro step="6" title="Your first draft plan — review required" body="Everything below is a hypothesis to test, not a conclusion. Accept it, ignore it, or edit it later in the workspace." icon={<Sparkles size={18} className="text-forest" />} />
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

      <div className="rounded-lg border border-forest/20 bg-white p-4 text-sm">
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
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-forest/10 text-sm font-semibold text-forest-deep" aria-hidden="true">{step}</span>
      <div>
        <h2 className="serif flex items-center gap-2 text-xl font-semibold text-forest-deep">{title} {icon}</h2>
        <p className="mt-1 mb-2 text-sm text-charcoal-soft">{body}</p>
      </div>
    </div>
  );
}

function Users2Icon() { return <Users2 size={18} className="text-forest" />}
function CompassIcon() { return <Compass size={18} className="text-forest" />}
function MegaphoneIcon() { return <Megaphone size={18} className="text-forest" />}
