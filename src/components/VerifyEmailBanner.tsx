"use client";

import { useState } from "react";
import { MailCheck } from "lucide-react";

/** US-011: shown while the signed-in founder's address is unconfirmed (and the server can send mail). */
export function VerifyEmailBanner({ email }: { email: string }) {
  const [state, setState] = useState<{ busy: boolean; note: string | null }>({ busy: false, note: null });

  async function resend() {
    setState({ busy: true, note: null });
    try {
      const res = await fetch("/api/auth/verify/resend", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const data = (await res.json().catch(() => ({}))) as { error?: string; alreadyVerified?: boolean };
      setState({ busy: false, note: res.ok ? (data.alreadyVerified ? "Already confirmed. Reload the page." : "Sent. Check your inbox (and spam).") : data.error || "Could not send a new link." });
    } catch {
      setState({ busy: false, note: "Banyan could not be reached." });
    }
  }

  return (
    <div role="status" className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-fig/25 bg-fig/[0.06] px-4 py-3 text-[14px] text-charcoal">
      <MailCheck size={16} strokeWidth={1.5} className="shrink-0 text-fig-deep" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        Confirm <span className="font-medium">{email}</span> to connect accounts and publish. The link is in your inbox.
      </span>
      <button type="button" onClick={resend} disabled={state.busy} className="font-medium text-forest underline-offset-2 hover:text-forest-deep hover:underline disabled:opacity-60">
        {state.busy ? "Sending…" : "Send a new link"}
      </button>
      {state.note && <span className="w-full text-[13px] text-charcoal-soft">{state.note}</span>}
    </div>
  );
}
