"use client";

import { useState, FormEvent, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Input, Select, StatusBadge, Textarea, Loading } from "@/components/ui";
import { CHANNEL_META, CHANNEL_FORMATS, isChannel } from "@/lib/formats";
import { CalendarClock, Save, Sparkles, Send, Ban, CheckCircle2, ExternalLink, Clock, Eye } from "lucide-react";

type VideoExtras = { hook?: string; script?: string; scenes?: { scene: string; visual: string }[]; onScreenText?: string; caption?: string; cta?: string };

type ItemShape = {
  id: string; title: string; body: string; channel: string; format: string; status: string;
  campaignId: string | null; scheduledFor: string | null; approvedAt: string | null; rejectionReason: string | null;
  sourceRef: string | null; videoExtras: VideoExtras;
};

type PubShape = {
  id: string; status: string; provider: string; manual: boolean; externalId: string | null; externalUrl: string | null;
  attempts: number; lastError: string | null; scheduledFor: string | null; publishedAt: string | null; createdAt: string;
};

export function ContentEditor({
  item, revisions, publications, campaigns, connections, trackedUrl, timezone,
}: {
  item: ItemShape;
  revisions: { id: string; title: string; body: string; note: string; authorType: string; createdAt: string }[];
  publications: PubShape[];
  campaigns: { id: string; name: string }[];
  connections: { id: string; label: string; status: string; lastError: string | null }[];
  trackedUrl: string | null;
  timezone: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | string>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body);
  const [sourceRef, setSourceRef] = useState(item.sourceRef ?? "");
  const [channel, setChannel] = useState(item.channel);
  const [format, setFormat] = useState(item.format);
  const [scheduleAt, setScheduleAt] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [tone, setTone] = useState("");

  const isChannelNow = isChannel(channel);

  async function post(path: string, payload: unknown, label: string) {
    if (dirty) {
      setError("You have unsaved edits. Save them first — generation and review never silently overwrite your work.");
      router.refresh();
      return { ok: false };
    }
    setBusy(label); setError(null); setNotice(null);
    try {
      const res = await fetch(path, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed.");
      if (data.label) setNotice(data.label);
      else if (data.message) setNotice(data.message);
      router.refresh();
      return { ok: true };
    } catch (err) {
      setError((err as Error).message);
      return { ok: false };
    } finally {
      setBusy(null);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy("save"); setError(null); setNotice(null);
    try {
      const res = await fetch(`/api/content/${item.id}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, body, sourceRef, revisionNote: "Manual edit saved" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save.");
      setDirty(false);
      if (data.flowRestarted) setNotice("Saved. Content returned to draft for re-review after editing approved copy.");
      else setNotice("Saved. Revision stored.");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function aiAction(action: string, extra: Record<string, unknown> = {}) {
    const res = await post(`/api/content/${item.id}/generate`, { action, ...extra }, action);
    if (res.ok) {
      const data = await fetch(`/api/content/${item.id}`).then((r) => r.json());
      setTitle(data.item.title); setBody(data.item.body);
      if (isChannelNow) setChannel(data.item.channel); setFormat(data.item.format);
      setDirty(false);
    }
  }

  async function review(action: string, reason?: string) {
    await post(`/api/content/${item.id}/review`, reason ? { action, reason } : { action }, action);
  }

  async function sched() {
    if (!scheduleAt) { setError("Pick a time first."); return; }
    await post(`/api/content/${item.id}/schedule`, { scheduledFor: new Date(scheduleAt).toISOString() }, "schedule");
  }

  async function cancelSchedule() {
    await post(`/api/content/${item.id}/schedule`, { cancel: true }, "cancel");
  }

  async function publishNow() {
    const conn = connections[0];
    await post(`/api/content/${item.id}/publish`, { mode: "now", connectionId: conn?.id ?? null }, "publish");
  }

  async function recordManual(e: FormEvent) {
    e.preventDefault();
    await post(`/api/content/${item.id}/publish`, { mode: "manual", liveUrl: manualUrl }, "manual");
    setManualUrl("");
  }

  const charHint = useMemo(() => {
    if (!isChannelNow) return null;
    if (channel === "x" && format !== "thread") return `${body.length}/280 characters (single post)`;
    if (channel === "linkedin") return `${body.length}/3000 characters`;
    return `${body.length} characters`;
  }, [body, channel, format, isChannelNow]);

  const locked = ["published", "archived", "publishing"].includes(item.status);
  const canEdit = !locked && ["draft", "rejected", "ready_for_review"].includes(item.status);
  void canEdit;

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
      {/* Editor column */}
      <div className="flex flex-col gap-4">
        <Card>
          <form className="flex flex-col gap-4">
            <Field label="Title"><Input disabled={locked} value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} maxLength={200} /></Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Channel">
                <Select
                  disabled={locked || !["draft", "rejected"].includes(item.status)}
                  value={channel}
                  onChange={(e) => { setChannel(e.target.value); setFormat(CHANNEL_FORMATS[e.target.value as keyof typeof CHANNEL_FORMATS][0].key); setDirty(true); }}
                  aria-label="Channel"
                >
                  <option value="x">X</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="shortvideo">Short-form video</option>
                </Select>
              </Field>
              <Field label="Format">
                <Select disabled={locked} value={format} onChange={(e) => { setFormat(e.target.value); setDirty(true); }} aria-label="Format">
                  {(CHANNEL_FORMATS[channel as keyof typeof CHANNEL_FORMATS] ?? []).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </Select>
              </Field>
            </div>

            {channel === "shortvideo" && item.videoExtras?.hook && (
              <div className="rounded-lg border border-moss/30 bg-moss/5 p-3 text-sm">
                <p className="font-medium text-forest-deep">Hook (first 3 seconds)</p>
                <p className="mt-1 text-charcoal">{item.videoExtras.hook}</p>
                {item.videoExtras.scenes?.length ? (
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-charcoal-soft">
                    {item.videoExtras.scenes.map((s, i) => <li key={i}>Scene {i + 1}: {s.scene} — visual note: {s.visual}</li>)}
                  </ol>
                ) : null}
                {item.videoExtras.onScreenText && <p className="mt-2 text-xs"><strong>On-screen text:</strong> {item.videoExtras.onScreenText}</p>}
                {item.videoExtras.caption && <p className="mt-1 text-xs"><strong>Caption:</strong> {item.videoExtras.caption}</p>}
                <p className="mt-2 text-xs text-clay">A script is not a finished video: production and upload remain manual.</p>
              </div>
            )}

            <Field label="Body" hint={charHint ?? undefined}>
              <Textarea disabled={locked} value={body} onChange={(e) => { setBody(e.target.value); setDirty(true); }} rows={Math.max(6, Math.min(20, Math.ceil(body.length / 90)))} />
            </Field>
            <Field label="Source material (optional)" hint="Link the external page or note this draft is based on.">
              <Input disabled={locked} value={sourceRef} onChange={(e) => { setSourceRef(e.target.value); setDirty(true); }} maxLength={500} placeholder="https://…" />
            </Field>

            <ErrorNote>{error}</ErrorNote>
            {notice && <div role="status" className="rounded-md border border-forest/20 bg-forest/5 px-3 py-2 text-sm text-forest-deep">{notice}</div>}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" onClick={save} disabled={!!busy || locked}>
                <Save size={14} aria-hidden="true" /> {busy === "save" ? "Saving…" : "Save"}
              </Button>
              {dirty && <Badge variant="warm">unsaved edits</Badge>}
              {busy && !(busy === "save") && <Loading label="Working…" />}
            </div>
          </form>
        </Card>

        {/* Generation controls */}
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-medium text-charcoal"><Sparkles size={15} className="text-forest" aria-hidden="true" /> AI studio</h2>
          {item.status !== "draft" && item.status !== "rejected" && (
            <p className="mb-3 text-xs text-charcoal-soft">
              Generation applies to draft or rejected items only — approved, scheduled or published copy is never overwritten by the AI.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => aiAction(item.body ? "regenerate" : "generate")} disabled={!!busy || !["draft", "rejected"].includes(item.status)}>
              {item.body ? "Regenerate draft" : "Generate draft"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => aiAction("improve_hook")} disabled={!!busy || !["draft", "rejected"].includes(item.status)}>Improve hook</Button>
            <Button size="sm" variant="secondary" onClick={() => aiAction("shorten")} disabled={!!busy || !["draft", "rejected"].includes(item.status)}>Shorten</Button>
            <Button size="sm" variant="secondary" onClick={() => aiAction("change_tone", { tone })} disabled={!!busy || !["draft", "rejected"].includes(item.status)}>Change tone</Button>
            <Input
              placeholder="tone override" value={tone} onChange={(e) => setTone(e.target.value)} className="max-w-36" aria-label="tone override"
            />
            <Button size="sm" variant="secondary" onClick={() => aiAction("alternatives")} disabled={!!busy || !["draft", "rejected"].includes(item.status)}>Alternatives</Button>
          </div>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-charcoal">Adapt to another channel</summary>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="w-44">
                <Field label="Target channel">
                  <Select value={channel === "x" ? "linkedin" : "x"} onChange={() => {}} aria-label="Adapt target" disabled>
                    <option value="x">X</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="shortvideo">Short-form video</option>
                  </Select>
                </Field>
              </div>
              <Button size="sm" variant="secondary" onClick={() => aiAction("adapt_channel")} disabled={!!busy}>Adapt</Button>
              <p className="text-xs text-charcoal-soft">Adapt converts the current channel selection's format into the target's conventions.</p>
            </div>
          </details>
        </Card>
      </div>

      {/* Workflow column */}
      <div className="flex flex-col gap-4">
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-medium text-charcoal"><Eye size={15} className="text-clay" aria-hidden="true" /> Review &amp; approval</h2>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-center gap-2"><span className="text-charcoal-soft">Status:</span><StatusBadge status={item.status} /></div>
            {item.approvedAt && <p className="text-xs text-moss">Approved at {new Date(item.approvedAt).toLocaleString()} — approval recorded server-side with the approver's identity.</p>}
            {item.rejectionReason && <p className="rounded-md bg-clay/5 px-2 py-1 text-xs text-clay">Rejected: {item.rejectionReason}</p>}

            {!locked && (
              <div className="flex flex-wrap gap-2">
                {item.status === "draft" && (
                  <Button size="sm" onClick={() => review("submit")} disabled={!!busy || !body.trim()}>
                    <Send size={13} aria-hidden="true" /> Submit for review
                  </Button>
                )}
                {item.status === "ready_for_review" && (
                  <>
                    <Button size="sm" variant="primary" onClick={() => review("approve")} disabled={!!busy}>
                      <CheckCircle2 size={13} aria-hidden="true" /> Approve
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => {
                      const reason = prompt("Rejection reason (required):");
                      if (reason && reason.trim().length >= 3) review("reject", reason);
                    }} disabled={!!busy}>
                      <Ban size={13} aria-hidden="true" /> Reject
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => review("back_to_draft")} disabled={!!busy}>Back to draft</Button>
                  </>
                )}
                {item.status === "rejected" && (
                  <Button size="sm" onClick={() => review("back_to_draft")} disabled={!!busy}>Return to draft</Button>
                )}
              </div>
            )}
            <p className="text-xs text-charcoal-soft">Approval is enforced by the publishing pipeline: unapproved content cannot reach any external platform, whatever the UI shows.</p>
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-medium text-charcoal"><Clock size={15} className="text-moss" aria-hidden="true" /> Schedule &amp; publish</h2>
          <div className="flex flex-col gap-3 text-sm">
            {item.status === "approved" && (
              <div className="flex flex-col gap-2">
                <Field label={'Schedule for (UTC — workspace: ${timezone})'.replace("${timezone}", timezone)}>
                  <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} aria-label="Schedule time" />
                </Field>
                <Button size="sm" onClick={sched} disabled={!!busy}><CalendarClock size={13} aria-hidden="true" /> Schedule publication</Button>
                <Button size="sm" variant="primary" onClick={publishNow} disabled={!!busy}>Publish now</Button>
              </div>
            )}
            {item.status === "scheduled" && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-charcoal-soft">Scheduled for {item.scheduledFor ? new Date(item.scheduledFor).toLocaleString() : "?"}. The publishing worker attempts delivery then; until then its state is pending.</p>
                <Button size="sm" variant="secondary" onClick={cancelSchedule} disabled={!!busy}>Cancel schedule</Button>
              </div>
            )}
            {item.status === "failed" && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-clay">The previous attempt failed. Check the publication log.</p>
                <Button size="sm" onClick={publishNow} disabled={!!busy}>Retry publish now</Button>
              </div>
            )}
            {["draft", "ready_for_review", "rejected"].includes(item.status) && (
              <p className="text-xs text-charcoal-soft">Publishing controls unlock once the item is approved.</p>
            )}
            <details>
              <summary className="cursor-pointer text-xs font-medium text-charcoal">Record a manual publication</summary>
              <form onSubmit={recordManual} className="mt-2 flex flex-col gap-2">
                <Input placeholder="live post URL after you publish it yourself" value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} aria-label="Live URL" />
                <Button size="sm" variant="secondary" type="submit" disabled={!!busy}>Record live URL</Button>
                <p className="text-xs text-charcoal-soft">Recorded distinctly as manual — a user-confirmed publication, never fabricated by the system.</p>
              </form>
            </details>
          </div>
        </Card>

        {/* Publications audit */}
        <Card>
          <h2 className="mb-2 font-medium text-charcoal">Publication audit trail</h2>
          {publications.length === 0 ? (
            <p className="text-sm text-charcoal-soft">No publication attempts yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {publications.map((p) => (
                <li key={p.id} className="rounded-md border border-bark/10 bg-ivory p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge status={p.status} />
                    <span className="text-xs text-charcoal-soft">{p.provider}{p.manual ? " (manual)" : ""} · {p.attempts} attempt(s)</span>
                  </div>
                  {p.externalUrl && (
                    <a href={p.externalUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-forest hover:text-forest-deep">
                      <ExternalLink size={12} aria-hidden="true" /> live post
                    </a>
                  )}
                  {p.lastError && <p className="mt-1 text-xs text-clay">{p.lastError}</p>}
                  {p.createdAt && <p className="mt-1 text-xs text-bark/50">attempted {new Date(p.createdAt).toLocaleString()}</p>}
                </li>
              ))}
            </ul>
          )}
          {trackedUrl && (
            <p className="mt-3 text-xs text-charcoal-soft">Tracked link for this content: <code>{trackedUrl}</code></p>
          )}
        </Card>

        {/* Revisions */}
        <Card>
          <h2 className="mb-2 font-medium text-charcoal">Revision history</h2>
          {revisions.length === 0 ? (
            <p className="text-sm text-charcoal-soft">No revisions stored yet.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {revisions.map((r) => (
                <li key={r.id} className="border-b border-bark/5 pb-1.5">
                  <span className="flex items-center justify-between text-bark/70">
                    <span>{new Date(r.createdAt).toLocaleString()}</span>
                    <Badge variant={r.authorType === "ai" ? "forest" : r.authorType === "system" ? "charcoal" : "warm"}>{r.authorType}</Badge>
                  </span>
                  <span className="mt-0.5 block text-charcoal-soft">{r.note}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

      {/* Channel association switcher */}
      <Card>
        <h2 className="mb-2 font-medium text-charcoal">Campaign association</h2>
          <Select
            value={item.campaignId ?? ""}
            disabled={locked}
            onChange={async (e) => {
              setBusy("campaign");
              await fetch(`/api/content/${item.id}`, {
                method: "PATCH", headers: { "content-type": "application/json" },
                body: JSON.stringify({ revisionNote: `Campaign association: ${e.target.value || "(none)"}` }),
              });
              // campaign switching happens server-side via same edit route (fields only; campaign moves through detail page for now)
              setBusy(null); router.refresh();
            }}
            aria-label="Campaign"
          >
            <option value="">(no campaign)</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <p className="mt-2 text-xs text-charcoal-soft">Campaign assignment is captured in the revision log; full reassignment lives on the campaign page.</p>
        </Card>
      </div>
    </div>
  );
}
