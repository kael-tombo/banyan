"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Link2, RotateCcw } from "lucide-react";
import { Badge, Button, Card, ErrorNote, Field, Input, Textarea } from "@/components/ui";

type Analysis = {
  id: string;
  url: string;
  status: "queued" | "reading" | "analysing" | "ready" | "failed";
  method: string | null;
  error: { code: string; message: string } | null;
  flags: { label: string; excerpt: string; page: string }[];
};

export type ProfileView = {
  exists: boolean;
  name: string;
  description: string;
  valueProp: string;
  problem: string;
  audience: string;
  website: string;
  stage: string;
  features: string[];
  problemsSolved: string[];
  differentiators: string[];
  missingInformation: string[];
  sources: Record<string, "user" | "analysis">;
  version: number;
  approvedAt: string | null;
  needsApproval: boolean;
};

const PHASE: Record<string, string> = { queued: "Waiting for a worker…", reading: "Reading your website…", analysing: "Analysing what it says…" };

function SourceTag({ source }: { source?: "user" | "analysis" }) {
  if (!source) return null;
  return <Badge variant={source === "user" ? "forest" : "warm"}>{source === "user" ? "written by you" : "from your website"}</Badge>;
}

export function ProductReview({ initial, lastAnalysis }: { initial: ProfileView; lastAnalysis: Analysis | null }) {
  const router = useRouter();
  const [url, setUrl] = useState(initial.website || lastAnalysis?.url || "");
  const [analysis, setAnalysis] = useState<Analysis | null>(lastAnalysis);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ name: initial.name, description: initial.description, valueProp: initial.valueProp, problem: initial.problem, audience: initial.audience });
  const poll = useRef<number | null>(null);

  useEffect(() => () => { if (poll.current) window.clearTimeout(poll.current); }, []);

  async function track(id: string) {
    const res = await fetch(`/api/product/analyze/${id}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error || "Could not read the analysis.");
    setAnalysis(data.analysis);
    if (!["ready", "failed"].includes(data.analysis.status)) poll.current = window.setTimeout(() => void track(id), 1500);
  }

  async function analyse(e?: FormEvent) {
    e?.preventDefault();
    setBusy("analyse"); setError(null); setNotice(null);
    try {
      const res = await fetch("/api/product/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not start the analysis.");
      setAnalysis(data.analysis);
      if (!["ready", "failed"].includes(data.analysis.status)) void track(data.analysis.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function post(path: string, body: unknown, label: string, ok: string) {
    setBusy(label); setError(null); setNotice(null);
    try {
      const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setNotice(ok);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy("save"); setError(null); setNotice(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, stage: initial.stage || "building", website: initial.website || "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save.");
      setNotice(initial.approvedAt ? "Saved as a new version. Approve it again when it reads right." : "Saved.");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const running = analysis && !["ready", "failed"].includes(analysis.status);
  const set = (k: keyof typeof form) => (e: FormEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: (e.target as HTMLInputElement).value }));

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className="text-base font-medium text-charcoal">Read your website</h2>
        <p className="mt-1 text-[13px] text-charcoal-soft">Banyan reads up to three public pages and drafts the profile below. You review it before anything uses it.</p>
        <form onSubmit={analyse} className="mt-4 flex flex-wrap items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-bark/15 bg-white px-3">
            <Link2 size={16} className="shrink-0 text-muted" aria-hidden="true" />
            <span className="sr-only">Product URL</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourproduct.com" className="h-10 min-w-0 flex-1 bg-transparent text-sm focus:outline-none" inputMode="url" />
          </label>
          <Button type="submit" disabled={!!busy || !!running || !url.trim()}>{analysis ? "Analyse again" : "Analyse"}</Button>
        </form>

        {analysis && (
          <div className="mt-4 text-[13px]" aria-live="polite">
            {running && <p className="text-charcoal-soft">{PHASE[analysis.status]}</p>}
            {analysis.status === "ready" && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-1.5 text-forest"><CheckCircle2 size={16} aria-hidden="true" /> Read {analysis.url}</span>
                <span className="text-muted">{analysis.method === "model" ? "Analysed by the model" : "Basic extraction: only what the pages state"}</span>
                <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => post("/api/product/profile/apply-analysis", { analysisId: analysis.id }, "apply", "Draft applied. Fields you wrote yourself were kept.")}>
                  Use this as a draft
                </Button>
              </div>
            )}
            {analysis.status === "failed" && (
              <div className="rounded-lg bg-clay/[0.06] p-3">
                <p className="text-clay">{analysis.error?.message}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => analyse()} disabled={!!busy}><RotateCcw size={14} aria-hidden="true" /> Try again</Button>
                  <Button size="sm" variant="ghost" onClick={() => document.getElementById("profile-name")?.focus()}>Describe it yourself</Button>
                </div>
              </div>
            )}
            {analysis.flags.length > 0 && (
              <div className="mt-3 rounded-lg border border-fig/30 bg-fig/[0.06] p-3 text-charcoal">
                <p className="flex items-center gap-1.5 font-medium"><AlertTriangle size={16} className="text-fig-deep" aria-hidden="true" /> The site contains text that looks like instructions</p>
                <p className="mt-1 text-charcoal-soft">Banyan treated it as ordinary page text and did not act on it. Check it is meant to be there:</p>
                <ul className="mt-2 space-y-1">
                  {analysis.flags.map((f, i) => (
                    <li key={i} className="font-mono text-xs text-charcoal-soft">{f.label}: “{f.excerpt}”</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-medium text-charcoal">Your product profile</h2>
          <span className="flex items-center gap-2 text-[13px]">
            <span className="num font-mono text-xs text-muted">version {initial.version}</span>
            {initial.approvedAt ? (
              <span className="flex items-center gap-1.5 text-forest"><CheckCircle2 size={16} aria-hidden="true" /> Approved {new Date(initial.approvedAt).toLocaleDateString()}</span>
            ) : initial.needsApproval ? (
              <span className="flex items-center gap-1.5 text-fig-deep"><span className="h-1.5 w-1.5 rounded-full bg-fig" aria-hidden="true" /> Waiting on your approval</span>
            ) : (
              <span className="text-muted">Written by you</span>
            )}
          </span>
        </div>

        <form onSubmit={save} className="mt-4 flex flex-col gap-4">
          <Field label="Product name" required htmlFor="profile-name">
            <div className="flex items-center gap-2"><Input id="profile-name" value={form.name} onInput={set("name")} maxLength={120} /><SourceTag source={initial.sources.name} /></div>
          </Field>
          <Field label="What it does" required>
            <Textarea value={form.description} onInput={set("description")} rows={3} maxLength={2000} />
          </Field>
          <p className="-mt-2"><SourceTag source={initial.sources.description} /></p>
          <Field label="Value proposition" required>
            <Textarea value={form.valueProp} onInput={set("valueProp")} rows={2} maxLength={500} />
          </Field>
          <Field label="Problem it solves" required>
            <Textarea value={form.problem} onInput={set("problem")} rows={2} maxLength={1000} />
          </Field>
          <Field label="Target audience">
            <Input value={form.audience} onInput={set("audience")} maxLength={300} />
          </Field>
          <p className="-mt-2"><SourceTag source={initial.sources.audience} /></p>

          {(initial.features.length > 0 || initial.problemsSolved.length > 0 || initial.differentiators.length > 0) && (
            <dl className="grid gap-4 rounded-lg bg-ivory p-4 text-[13px] md:grid-cols-3">
              {([["Features", initial.features], ["Problems solved", initial.problemsSolved], ["Differentiators", initial.differentiators]] as const).map(([label, items]) => (
                <div key={label}>
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="mt-1 text-charcoal">{items.length ? <ul className="list-disc space-y-0.5 pl-4">{items.map((x) => <li key={x}>{x}</li>)}</ul> : <span className="text-muted">Not found</span>}</dd>
                </div>
              ))}
            </dl>
          )}

          {initial.missingInformation.length > 0 && (
            <p className="text-[13px] text-charcoal-soft">
              <span className="font-medium text-charcoal">Your website does not say:</span> {initial.missingInformation.join(", ")}. Add what matters above; Banyan will not guess it.
            </p>
          )}

          <ErrorNote>{error}</ErrorNote>
          {notice && <p className="text-[13px] text-forest">{notice}</p>}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary" disabled={!!busy}>{busy === "save" ? "Saving…" : "Save changes"}</Button>
            {initial.exists && !initial.approvedAt && (
              <Button type="button" disabled={!!busy} onClick={() => post("/api/product/profile/approve", {}, "approve", "Approved. Strategy work can start from this version.")}>
                Approve this profile
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
