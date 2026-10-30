"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Check, Eye, Globe2, Loader2, ShieldCheck, Sparkles,
} from "lucide-react";
import { Badge, Button, Card, ErrorNote, Field, Input, Select, Textarea } from "@/components/ui";
import type { ProductSnapshot, ProductStage } from "@/lib/product/intake";

type Channel = "x" | "linkedin" | "shortvideo";

const STAGES: [ProductStage, string][] = [
  ["idea", "Idea"],
  ["building", "Building"],
  ["private_beta", "Private beta"],
  ["public_beta", "Public beta"],
  ["launched", "Launched"],
  ["growth", "Growing"],
];

const CHANNELS: { key: Channel; label: string; hint: string; live: boolean }[] = [
  { key: "linkedin", label: "LinkedIn", hint: "Published through a verified connection. Human approval first.", live: true },
  { key: "x", label: "X", hint: "Published through a verified connection. Human approval first.", live: true },
  { key: "shortvideo", label: "Short-form video", hint: "Banyan writes the script; recording and posting are a manual handoff.", live: false },
];

const BLANK: ProductSnapshot = {
  name: "",
  description: "",
  website: "",
  stage: "launched",
  problem: "",
  valueProp: "",
  audience: "",
  audiencePain: "",
  audienceOutcome: "",
  observedFields: [],
};

function stepClass(active: boolean, done: boolean): string {
  if (done) return "border-forest/25 bg-forest text-ivory";
  if (active) return "border-forest-deep bg-forest-deep text-ivory";
  return "border-bark/15 bg-white text-charcoal-soft";
}

export default function CycleIntakeForm({
  initialProfile,
  initialUrl = "",
}: {
  initialProfile: ProductSnapshot | null;
  initialUrl?: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<"url" | "review">(initialProfile ? "review" : "url");
  const [url, setUrl] = useState(initialProfile?.website || initialUrl);
  const [snapshot, setSnapshot] = useState<ProductSnapshot>(initialProfile ?? BLANK);
  const [update, setUpdate] = useState("");
  const [objective, setObjective] = useState("Get 20 qualified signups in 14 days");
  const [metric, setMetric] = useState("signups");
  const [target, setTarget] = useState("20");
  const [days, setDays] = useState("14");
  const [channels, setChannels] = useState<Channel[]>(["linkedin", "x", "shortvideo"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(
    initialProfile
      ? "Loaded from the product profile already saved in this workspace."
      : initialUrl
        ? "URL carried from the landing page. Press Read product to inspect it before anything is saved."
        : null
  );

  const observedHint = (field: string) =>
    snapshot.observedFields.includes(field)
      ? "Read from the page — correct it if it is wrong."
      : undefined;

  function setField<K extends keyof ProductSnapshot>(key: K, value: ProductSnapshot[K]) {
    setSnapshot((prev) => ({
      ...prev,
      [key]: value,
      // Once the founder edits an observed value it is their context, not the
      // page's. Remove the label so the screen never overstates provenance.
      observedFields: prev.observedFields.filter((f) => f !== key),
    }));
  }

  function toggleChannel(channel: Channel) {
    setChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]
    );
  }

  async function readProduct() {
    setError(null);
    setNote(null);
    if (!url.trim()) {
      setError("Paste a product URL first, or enter the details manually.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/product/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        snapshot?: ProductSnapshot;
        sourceUrl?: string;
        truncated?: boolean;
        error?: string;
      };
      if (!res.ok || !body.snapshot) {
        throw new Error(body.error || "Could not read that page.");
      }
      setSnapshot({
        ...body.snapshot,
        // Keep audience work the founder already entered; the page cannot know it.
        audience: snapshot.audience,
        audiencePain: snapshot.audiencePain,
        audienceOutcome: snapshot.audienceOutcome,
      });
      setUrl(body.sourceUrl ?? url);
      setPhase("review");
      setNote(
        `Read from ${body.sourceUrl ?? url}${body.truncated ? " (the page was truncated)" : ""}. Check every field — the page's words are not automatically your positioning.`
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function useSaved() {
    if (!initialProfile) return;
    setSnapshot({ ...initialProfile, observedFields: [] });
    setUrl(initialProfile.website);
    setPhase("review");
    setError(null);
    setNote("Using the saved product profile. Nothing new was fetched — you can still correct every field.");
  }

  function startManual() {
    setSnapshot({ ...BLANK, website: url.trim() });
    setPhase("review");
    setError(null);
    setNote("Manual entry: nothing was fetched. Banyan will treat these as your context, not as observed market facts.");
  }

  async function startCycle(e: FormEvent) {
    e.preventDefault();
    if (phase !== "review") return;
    setError(null);

    const targetNum = Number(target);
    const daysNum = Number(days);
    const missing: string[] = [];
    if (!snapshot.name.trim()) missing.push("the product name");
    if (snapshot.description.trim().length < 10) missing.push("a one-paragraph product description");
    if (snapshot.problem.trim().length < 10) missing.push("the problem it solves");
    if (snapshot.valueProp.trim().length < 10) missing.push("the value proposition");
    if (snapshot.audience.trim().length < 2) missing.push("the audience");
    if (objective.trim().length < 5) missing.push("a clear objective");
    if (metric.trim().length < 2) missing.push("a metric");
    if (!Number.isFinite(targetNum) || targetNum < 0) missing.push("a numeric target");
    if (!Number.isInteger(daysNum) || daysNum < 1 || daysNum > 365) missing.push("a window between 1 and 365 days");
    if (channels.length < 2) missing.push("at least two channels");
    if (!channels.some((c) => c !== "shortvideo")) missing.push("at least one live channel (X or LinkedIn)");
    if (missing.length > 0) {
      setError(`Before this cycle can start, add ${missing.join(", ")}.`);
      return;
    }

    setBusy(true);
    try {
      const snapshotRes = await fetch("/api/product/snapshot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...snapshot,
          website: snapshot.website || url.trim(),
          sourceUrl: url.trim() || snapshot.website,
          channels,
        }),
      });
      const snapshotBody = (await snapshotRes.json().catch(() => ({}))) as { error?: string };
      if (!snapshotRes.ok) {
        throw new Error(snapshotBody.error || "Could not save the product snapshot.");
      }

      const rawInput = [
        objective.trim(),
        `This cycle distributes ${update.trim() || `the product ${snapshot.name.trim()}`}.`,
      ].join(". ");
      const goalRes = await fetch("/api/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rawInput,
          description: update.trim(),
          successMetric: metric.trim(),
          metricTarget: targetNum,
          deadlineDays: daysNum,
          channels,
        }),
      });
      const goalBody = (await goalRes.json().catch(() => ({}))) as {
        goal?: { id: string };
        error?: string;
      };
      if (!goalRes.ok || !goalBody.goal) {
        throw new Error(goalBody.error || "Could not start the cycle.");
      }
      router.push(`/app/cycles/${goalBody.goal.id}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={startCycle} className="space-y-5">
      <ol className="flex flex-wrap items-center gap-2 text-xs" aria-label="Cycle intake steps">
        {["Product", "Cycle"].map((label, i) => {
          const active = (i === 0 && phase === "url") || (i === 1 && phase === "review");
          const done = i === 0 && phase === "review";
          return (
            <li key={label} className="flex items-center gap-2">
              <span
                aria-current={active ? "step" : undefined}
                className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold ${stepClass(active, done)}`}
              >
                {done ? <Check size={13} aria-hidden="true" /> : i + 1}
              </span>
              <span className={active || done ? "font-semibold text-forest-deep" : "text-charcoal-soft"}>{label}</span>
              {i === 0 && <span className="h-px w-6 bg-bark/15" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>

      {phase === "url" ? (
        <Card>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-forest/[0.07] text-forest">
              <Globe2 size={19} aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-serif text-xl tracking-[-0.01em] text-forest-deep">Start with the page you shipped.</h2>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-charcoal-soft">
                Banyan reads one public page — title, description and headings — then shows you exactly what it read.
                You correct it before anything becomes business context. It never logs in, and private network addresses are refused.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="Product URL" hint="Public home, pricing or launch page. A bare domain gets https://.">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://yourproduct.com"
                inputMode="url"
                autoComplete="url"
              />
            </Field>
            <Button type="button" onClick={readProduct} disabled={busy}>
              {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <ArrowRight size={15} aria-hidden="true" />}
              {busy ? "Reading…" : "Read product"}
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {initialProfile && (
              <Button type="button" variant="secondary" size="sm" onClick={useSaved} disabled={busy}>
                <ShieldCheck size={13} aria-hidden="true" /> Use saved profile
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={startManual} disabled={busy}>
              Enter it manually
            </Button>
            <span className="text-[11px] text-charcoal-soft">Reading is rate-limited and refuses private network addresses.</span>
          </div>

          {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}
          {note && <p className="mt-4 text-sm text-forest" aria-live="polite">{note}</p>}
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-serif text-xl tracking-[-0.01em] text-forest-deep">What Banyan read</h2>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-charcoal-soft">
                  The page gives language, not strategy. Correct anything that is wrong; your edits become user-provided
                  context, and Banyan labels them that way.
                </p>
              </div>
              <Badge variant="moss">
                <Eye size={11} aria-hidden="true" /> {snapshot.observedFields.length} from the page
              </Badge>
            </div>

            {note && <p className="mt-3 text-xs leading-relaxed text-charcoal-soft" aria-live="polite">{note}</p>}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Product name" required hint={observedHint("name")}>
                <Input value={snapshot.name} onChange={(e) => setField("name", e.target.value)} maxLength={120} />
              </Field>
              <Field label="Website" hint="Used for tracked links once the cycle publishes.">
                <Input
                  value={snapshot.website}
                  onChange={(e) => setField("website", e.target.value)}
                  inputMode="url"
                  placeholder="https://yourproduct.com"
                />
              </Field>
              <Field label="Stage" required>
                <Select value={snapshot.stage} onChange={(e) => setField("stage", e.target.value as ProductStage)}>
                  {STAGES.map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Audience" required hint={observedHint("audience") ?? "Who specifically is this for? One sentence."}>
                <Input
                  value={snapshot.audience}
                  onChange={(e) => setField("audience", e.target.value)}
                  maxLength={300}
                  placeholder="e.g. solo B2B founders shipping their first product"
                />
              </Field>
            </div>

            <div className="mt-4 grid gap-4">
              <Field label="What it does" required hint={observedHint("description")}>
                <Textarea value={snapshot.description} onChange={(e) => setField("description", e.target.value)} rows={3} maxLength={2000} />
              </Field>
              <Field label="The problem it solves" required hint={observedHint("problem") ?? "In the audience's words. Banyan will not invent this."}>
                <Textarea value={snapshot.problem} onChange={(e) => setField("problem", e.target.value)} rows={2} maxLength={1000} />
              </Field>
              <Field label="Value proposition" required hint={observedHint("valueProp") ?? "The concrete outcome, not a slogan."}>
                <Textarea value={snapshot.valueProp} onChange={(e) => setField("valueProp", e.target.value)} rows={2} maxLength={500} />
              </Field>
            </div>

            <details className="mt-4 rounded-xl border border-bark/10 bg-ivory/40 p-3">
              <summary className="cursor-pointer text-sm font-medium text-charcoal">
                Audience detail <span className="font-normal text-charcoal-soft">— optional, but it sharpens the copy</span>
              </summary>
              <div className="mt-3 grid gap-3">
                <Field label="What is painful today?">
                  <Textarea value={snapshot.audiencePain} onChange={(e) => setField("audiencePain", e.target.value)} rows={2} maxLength={1000} />
                </Field>
                <Field label="What outcome do they want?">
                  <Textarea value={snapshot.audienceOutcome} onChange={(e) => setField("audienceOutcome", e.target.value)} rows={2} maxLength={1000} />
                </Field>
              </div>
            </details>
          </Card>

          <Card>
            <h2 className="font-serif text-xl tracking-[-0.01em] text-forest-deep">The cycle</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-charcoal-soft">
              One objective, one measurement, two or three channels. Banyan proposes the strategy; you approve before
              anything publishes.
            </p>

            <div className="mt-4 grid gap-4">
              <Field label="What changed?" hint="A launch, feature or lesson. These three assets will distribute it.">
                <Textarea
                  value={update}
                  onChange={(e) => setUpdate(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="e.g. We shipped saved research briefs so founders can reuse validated context."
                />
              </Field>
              <Field label="Objective" required hint="The outcome, not the activity.">
                <Input value={objective} onChange={(e) => setObjective(e.target.value)} maxLength={300} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Metric" required>
                  <Input value={metric} onChange={(e) => setMetric(e.target.value)} maxLength={60} placeholder="signups" />
                </Field>
                <Field label="Target" required>
                  <Input type="number" min={0} max={1_000_000} value={target} onChange={(e) => setTarget(e.target.value)} />
                </Field>
                <Field label="Window (days)" required>
                  <Input type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} />
                </Field>
              </div>

              <fieldset>
                <legend className="text-[13px] font-medium text-charcoal">
                  Channels <span className="text-clay" aria-hidden="true">*</span>
                </legend>
                <p className="mt-1 text-xs leading-relaxed text-charcoal-soft">
                  Pick at least two. At least one must be X or LinkedIn so the cycle can actually publish.
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {CHANNELS.map((opt) => {
                    const checked = channels.includes(opt.key);
                    return (
                      <label
                        key={opt.key}
                        className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors ${
                          checked ? "border-forest/35 bg-forest/[0.04]" : "border-bark/12 bg-white hover:border-forest/25"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleChannel(opt.key)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-[#1e4d3a]"
                        />
                        <span>
                          <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-charcoal">
                            {opt.label}
                            {!opt.live && <Badge variant="warm">manual</Badge>}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-relaxed text-charcoal-soft">{opt.hint}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {channels.length < 2 || !channels.some((c) => c !== "shortvideo") ? (
                  <p className="mt-2 text-xs text-clay" role="status">
                    A complete cycle needs two channels and at least one live channel. Video alone is a script, not a publish.
                  </p>
                ) : null}
              </fieldset>
            </div>

            {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Sparkles size={15} aria-hidden="true" />}
                {busy ? "Starting…" : "Start complete cycle"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => { setPhase("url"); setError(null); }}
                disabled={busy}
              >
                <ArrowLeft size={14} aria-hidden="true" /> Back
              </Button>
              <span className="text-xs text-charcoal-soft">
                Creates the goal and drafts a plan. Nothing publishes without recorded approval.
              </span>
            </div>
          </Card>
        </>
      )}

      <p className="text-xs leading-relaxed text-charcoal-soft">
        Already know what you want? <Link href="/app/goals" className="font-medium text-forest hover:underline">Start from a goal</Link>{" "}
        instead — the cycle view works for every goal.
      </p>
    </form>
  );
}
