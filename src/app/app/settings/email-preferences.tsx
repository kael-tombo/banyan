"use client";

import { useState } from "react";
import { ErrorNote } from "@/components/ui";

/** Optional email. Account emails (confirmation, password reset) are not listed: they always arrive. */
export function EmailPreferences({ initial, emailConfigured }: { initial: { autonomyDigest: boolean }; emailConfigured: boolean }) {
  const [digest, setDigest] = useState(initial.autonomyDigest);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function toggle(next: boolean) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/account/email-preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ autonomyDigest: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save.");
      setDigest(Boolean(body.prefs?.autonomyDigest));
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <label className="flex items-start gap-2 text-charcoal">
        <input type="checkbox" className="mt-1" checked={digest} disabled={busy} onChange={(e) => toggle(e.target.checked)} />
        <span>
          Weekly autopilot summary
          <span className="block text-xs text-charcoal-soft">
            Once a week, when your autopilot is supervised: what Banyan approved and scheduled on its own, and what waits for you.
            Sent only to confirmed addresses, and only when something happened.
          </span>
        </span>
      </label>
      {saved && <p role="status" className="text-xs text-moss">Saved.</p>}
      <ErrorNote>{error}</ErrorNote>
      {!emailConfigured && (
        <p className="text-xs text-charcoal-soft">Email is not configured on this server (no SMTP_URL), so nothing is delivered yet.</p>
      )}
      <p className="text-xs text-charcoal-soft">Account emails, like confirmation links and password resets, always arrive.</p>
    </div>
  );
}
