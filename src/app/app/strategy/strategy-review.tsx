"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronDown, PenLine, RefreshCw, X } from "lucide-react";
import { Badge, Button, Card, ErrorNote, Input, Textarea } from "@/components/ui";
import { CHANNEL_FORMATS, CHANNEL_META, type Channel } from "@/lib/formats";
import type { StrategyView } from "@/lib/strategy/service";
import type { KpiMetric, PublishingMode } from "@/lib/strategy/generate";

const KPI_LABEL: Record<KpiMetric, string> = {
  tracked_visits: "Tracked visits",
  signups: "Signups",
  activations: "Activated accounts",
  publications: "Publications",
};

const PUBLISHING: Record<PublishingMode, string> = {
  socialflow: "Publishes through SocialFlow.ai",
  export: "You publish from the export",
  manual: "Produced and published by hand",
};

const STATUS_LABEL: Record<string, string> = {
  proposed: "Waiting on your approval",
  approved: "Approved",
  rejected: "Rejected",
  superseded: "Superseded",
};

type Version = { id: string; version: number; status: string; method: string; createdAt: string };

function formatLabel(channel: Channel, key: string) {
  return CHANNEL_FORMATS[channel].find((f) => f.key === key)?.label ?? key;
}

export function StrategyReview({
  initial,
  versions,
  changes,
  profile,
  canApprove,
}: {
  initial: StrategyView | null;
  versions: Version[];
  changes: string[];
  profile: { exists: boolean; needsApproval: boolean };
  canApprove: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const s = initial;

  async function call(label: string, url: string, method: string, body?: unknown) {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
      setEditing(false);
      setRejecting(false);
      setReason("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const generate = () => call("generate", "/api/strategies", "POST", {});

  // ————— Empty / gated states —————
  if (!s) {
    const blocked = !profile.exists || profile.needsApproval;
    return (
      <Card className="mb-6">
        <h2 className="text-base font-medium text-charcoal">Distribution strategy</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-charcoal-soft">
          {!profile.exists
            ? "The strategy is built from your product profile. Add it first."
            : profile.needsApproval
              ? "Your product profile has fields drafted from your website. Approve it first, so the strategy starts from facts you agreed with."
              : "Channels, formats, messaging angles, cadence and KPIs, each grounded in your approved product profile. Nothing is written until you approve it."}
        </p>
        <ErrorNote>{error}</ErrorNote>
        <div className="mt-4">
          {blocked ? (
            <Link href="/app/product" className="text-sm font-medium text-forest underline-offset-4 hover:underline">Open product profile</Link>
          ) : (
            <Button onClick={generate} disabled={!!busy}>{busy ? "Drafting the strategy…" : "Generate strategy"}</Button>
          )}
        </div>
      </Card>
    );
  }

  const body = s.body;
  const factById = new Map(s.facts.map((f) => [f.id, f]));
  const isProposed = s.status === "proposed";

  return (
    <section className="mb-6 flex flex-col gap-4" aria-label="Distribution strategy">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-[13px] text-charcoal-soft">
              <span className={`h-1.5 w-1.5 rounded-full ${isProposed ? "bg-fig" : s.status === "approved" ? "bg-forest" : "bg-bark/30"}`} aria-hidden="true" />
              {STATUS_LABEL[s.status] ?? s.status}
              <span className="num font-mono text-xs text-muted">version {s.version}</span>
            </p>
            <h2 className="mt-2 text-lg font-medium text-charcoal">Distribution strategy</h2>
            {s.objective && <p className="mt-1 text-sm text-charcoal-soft">{s.objective}</p>}
            <p className="mt-2 text-xs text-muted">
              {s.method === "model" && s.prompt && s.model
                ? `Drafted with prompt ${s.prompt} on ${s.model.provider} / ${s.model.model}`
                : s.method === "edited"
                  ? `Edited by you${s.prompt ? ` from a draft made with ${s.prompt}` : ""}`
                  : `Template strategy built from your profile facts${s.fallbackReason ? `. ${s.fallbackReason}` : ""}`}
              {" · "}from profile version {s.profileVersion}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isProposed && canApprove && !editing && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setRejecting((v) => !v)} disabled={!!busy}>
                  <X size={14} aria-hidden="true" /> Reject
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)} disabled={!!busy}>
                  <PenLine size={14} aria-hidden="true" /> Edit
                </Button>
                <Button size="sm" onClick={() => call("approve", `/api/strategies/${s.id}/approve`, "POST")} disabled={!!busy || s.stale}>
                  <CheckCircle2 size={14} aria-hidden="true" /> {busy === "approve" ? "Approving…" : "Approve strategy"}
                </Button>
              </>
            )}
            {!isProposed && !editing && (
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)} disabled={!!busy}>
                <PenLine size={14} aria-hidden="true" /> Edit as new version
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={generate} disabled={!!busy || profile.needsApproval}>
              <RefreshCw size={14} aria-hidden="true" /> {busy === "generate" ? "Regenerating…" : "Regenerate"}
            </Button>
          </div>
        </div>

        {s.stale && (
          <p className="mt-4 flex items-start gap-2 rounded-lg border border-fig/30 bg-fig/[0.06] px-3 py-2.5 text-[13px] leading-5 text-charcoal">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-fig-deep" aria-hidden="true" />
            Your product profile changed after this strategy was generated (it used version {s.profileVersion}). Regenerate it so it starts from the current profile.
          </p>
        )}
        {s.status === "rejected" && s.rejectedReason && <p className="mt-4 text-[13px] text-charcoal-soft">Rejected: {s.rejectedReason}</p>}
        {s.status === "approved" && s.approvedAt && (
          <p className="mt-4 flex items-center gap-1.5 text-[13px] text-forest">
            <CheckCircle2 size={14} aria-hidden="true" /> Approved {new Date(s.approvedAt).toLocaleDateString()}. Content is written from this version.
          </p>
        )}

        {rejecting && (
          <form
            className="mt-4 flex flex-col gap-2 rounded-xl border border-bark/10 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void call("reject", `/api/strategies/${s.id}/reject`, "POST", { reason });
            }}
          >
            <label htmlFor="reject-reason" className="text-[13px] font-medium text-charcoal">What should change?</label>
            <Textarea id="reject-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="LinkedIn is wrong for us; our buyers are on Reddit" />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={!!busy || reason.trim().length < 3}>{busy === "reject" ? "Rejecting…" : "Reject strategy"}</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setRejecting(false)}>Cancel</Button>
            </div>
          </form>
        )}
        <div className="mt-2"><ErrorNote>{error}</ErrorNote></div>
      </Card>

      {editing ? (
        <StrategyEditor
          view={s}
          busy={busy === "save"}
          onCancel={() => setEditing(false)}
          onSave={(edited) => call("save", `/api/strategies/${s.id}`, "PATCH", { body: edited })}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {body.channels.map((c) => {
              const freq = body.frequency.find((f) => f.channel === c.channel);
              return (
                <Card key={c.channel} className="flex flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="num font-mono text-xs text-muted">Priority {c.priority}</p>
                      <h3 className="mt-1 text-base font-medium text-charcoal">{CHANNEL_META[c.channel].label}</h3>
                    </div>
                    {freq && <p className="num shrink-0 text-right text-sm text-charcoal"><span className="text-lg font-medium text-forest-deep">{freq.posts_per_week}</span> a week</p>}
                  </div>
                  <p className="mt-1 text-xs text-muted">{PUBLISHING[c.publishing]}{c.scheduling ? " · scheduled automatically" : " · you choose when"}</p>
                  <p className="mt-3 text-[13px] leading-5 text-charcoal-soft">{c.rationale}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {c.formats.map((f) => <Badge key={f} variant="sage">{formatLabel(c.channel, f)}</Badge>)}
                  </div>
                  <details className="group mt-auto pt-4 text-[13px]">
                    <summary className="flex cursor-pointer list-none items-center gap-1 text-charcoal-soft hover:text-charcoal">
                      <ChevronDown size={14} className="transition-transform group-open:rotate-180" aria-hidden="true" />
                      Based on {c.cites.length} profile {c.cites.length === 1 ? "fact" : "facts"}
                    </summary>
                    <ul className="mt-2 space-y-1.5">
                      {c.cites.map((id) => {
                        const f = factById.get(id);
                        return (
                          <li key={id} className="rounded-lg bg-canvas px-2.5 py-1.5 text-xs leading-5 text-charcoal-soft">
                            <span className="font-medium text-charcoal">{f?.label ?? id}:</span> {f?.text ?? "Fact not found in the snapshot"}
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                </Card>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <h3 className="text-sm font-medium text-charcoal">Messaging angles</h3>
              <ul className="mt-3 space-y-3">
                {body.messaging_angles.map((a) => (
                  <li key={a.angle} className="text-[13px] leading-5">
                    <p className="text-charcoal">{a.angle}</p>
                    {a.example_hook && <p className="mt-0.5 text-charcoal-soft">“{a.example_hook}”</p>}
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <h3 className="text-sm font-medium text-charcoal">Objectives</h3>
              <ul className="mt-3 list-disc space-y-1.5 pl-4 text-[13px] leading-5 text-charcoal-soft">
                {body.objectives.map((o) => <li key={o}>{o}</li>)}
              </ul>
              {body.assumptions.length > 0 && (
                <>
                  <h3 className="mt-5 text-sm font-medium text-charcoal">Assumptions</h3>
                  <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[13px] leading-5 text-charcoal-soft">
                    {body.assumptions.map((a) => <li key={a}>{a}</li>)}
                  </ul>
                </>
              )}
            </Card>
            <Card>
              <h3 className="text-sm font-medium text-charcoal">KPIs</h3>
              <p className="mt-1 text-xs text-muted">Measured by Banyan from tracked links and signups. No reach or impression estimates.</p>
              <dl className="mt-3 divide-y divide-bark/[0.08]">
                {body.kpis.map((k) => (
                  <div key={k.metric} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
                    <dt className="text-charcoal">{KPI_LABEL[k.metric]}</dt>
                    <dd className="num text-charcoal-soft">{k.target != null ? `target ${k.target.toLocaleString()}` : "no target yet"}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>

          {(versions.length > 1 || changes.length > 0) && (
            <Card>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <h3 className="text-sm font-medium text-charcoal">Changes from the previous version</h3>
                  {changes.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-[13px] leading-5 text-charcoal-soft">
                      {changes.map((c) => <li key={c}>{c}</li>)}
                    </ul>
                  ) : (
                    <p className="mt-2 text-[13px] text-muted">{versions.length > 1 ? "Same channels, cadence and KPIs as the previous version." : "This is the first version."}</p>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-medium text-charcoal">Versions</h3>
                  <ul className="mt-2 divide-y divide-bark/[0.06] text-[13px]">
                    {versions.map((v) => (
                      <li key={v.id} className="flex items-center justify-between gap-3 py-1.5">
                        <span className="num font-mono text-xs text-charcoal">v{v.version}</span>
                        <span className="flex-1 text-charcoal-soft">{STATUS_LABEL[v.status] ?? v.status} · {v.method === "model" ? "model" : v.method === "edited" ? "edited" : "template"}</span>
                        <span className="text-xs text-muted">{new Date(v.createdAt).toLocaleDateString()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </section>
  );
}

/** Edit rationale, cadence, angles, objectives and KPI targets; saved as a new version. */
function StrategyEditor({ view, busy, onCancel, onSave }: { view: StrategyView; busy: boolean; onCancel: () => void; onSave: (body: unknown) => void }) {
  const b = view.body;
  const [rationale, setRationale] = useState<Record<string, string>>(Object.fromEntries(b.channels.map((c) => [c.channel, c.rationale])));
  const [freq, setFreq] = useState<Record<string, number>>(Object.fromEntries(b.frequency.map((f) => [f.channel, f.posts_per_week])));
  const [angles, setAngles] = useState(b.messaging_angles.map((a) => a.angle).join("\n"));
  const [objectives, setObjectives] = useState(b.objectives.join("\n"));
  const [targets, setTargets] = useState<Record<string, string>>(Object.fromEntries(b.kpis.map((k) => [k.metric, k.target != null ? String(k.target) : ""])));

  const lines = (v: string) => v.split("\n").map((x) => x.trim()).filter(Boolean);

  function save() {
    const previousAngles = new Map(b.messaging_angles.map((a) => [a.angle, a.example_hook]));
    onSave({
      channels: b.channels.map((c) => ({ channel: c.channel, priority: c.priority, rationale: rationale[c.channel] ?? c.rationale, formats: c.formats, cites: c.cites })),
      messaging_angles: lines(angles).map((angle) => ({ angle, ...(previousAngles.get(angle) ? { example_hook: previousAngles.get(angle) } : {}) })),
      objectives: lines(objectives),
      frequency: b.channels.map((c) => ({ channel: c.channel, posts_per_week: freq[c.channel] ?? 1 })),
      kpis: b.kpis.map((k) => ({ metric: k.metric, target: targets[k.metric] ? Number(targets[k.metric]) : null, ...(k.why ? { why: k.why } : {}) })),
      assumptions: b.assumptions,
    });
  }

  return (
    <Card>
      <h3 className="text-base font-medium text-charcoal">Edit strategy</h3>
      <p className="mt-1 text-[13px] text-charcoal-soft">Saving creates version {view.version + 1}. Version {view.version} stays exactly as it is.</p>
      <div className="mt-5 flex flex-col gap-5">
        {b.channels.map((c) => (
          <div key={c.channel} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`r-${c.channel}`} className="text-[13px] font-medium text-charcoal">{CHANNEL_META[c.channel].label}: why this channel</label>
              <Textarea id={`r-${c.channel}`} rows={2} value={rationale[c.channel]} maxLength={600} onChange={(e) => setRationale((r) => ({ ...r, [c.channel]: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`f-${c.channel}`} className="text-[13px] font-medium text-charcoal">Posts a week</label>
              <Input id={`f-${c.channel}`} type="number" min={1} max={7} value={freq[c.channel] ?? 1} onChange={(e) => setFreq((f) => ({ ...f, [c.channel]: Math.max(1, Math.min(7, Number(e.target.value) || 1)) }))} />
            </div>
          </div>
        ))}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="angles" className="text-[13px] font-medium text-charcoal">Messaging angles, one per line</label>
          <Textarea id="angles" rows={3} value={angles} onChange={(e) => setAngles(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="objectives" className="text-[13px] font-medium text-charcoal">Objectives, one per line</label>
          <Textarea id="objectives" rows={2} value={objectives} onChange={(e) => setObjectives(e.target.value)} />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-[13px] font-medium text-charcoal">KPI targets (leave empty for none)</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {b.kpis.map((k) => (
              <label key={k.metric} className="flex items-center justify-between gap-3 text-[13px] text-charcoal-soft">
                {KPI_LABEL[k.metric]}
                <Input type="number" min={1} className="w-32" value={targets[k.metric]} onChange={(e) => setTargets((t) => ({ ...t, [k.metric]: e.target.value }))} />
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex gap-2">
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : `Save as version ${view.version + 1}`}</Button>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        </div>
      </div>
    </Card>
  );
}
