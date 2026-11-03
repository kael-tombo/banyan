"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Input, ErrorNote } from "@/components/ui";

/**
 * Forgot password, reset password and email confirmation (US-011, US-012).
 * Small client forms over the /api/auth endpoints; every outcome says what
 * happened and what to do next.
 */

const BUTTON =
  "inline-flex h-11 items-center justify-center rounded-xl bg-forest-deep px-5 text-[15px] font-medium text-white transition-[background-color,transform] duration-150 hover:bg-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest active:scale-[0.99] disabled:cursor-progress disabled:opacity-70";
const LINK = "font-medium text-forest hover:text-forest-deep";

async function post(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, data };
}

function Status({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="rounded-lg border border-forest/20 bg-forest/[0.05] px-3 py-2.5 text-[14px] leading-relaxed text-forest-deep">
      {children}
    </p>
  );
}

function DevNote({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p className="mt-3 text-xs leading-relaxed text-muted">
      Email is not configured on this server (no SMTP_URL), so nothing is delivered. In development the link is printed in the server log.
    </p>
  );
}

export function ForgotPasswordForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ message: string; dev: boolean } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const email = String(new FormData(e.currentTarget).get("email") || "").trim();
      const { ok, data } = await post("/api/auth/password/forgot", { email });
      if (!ok) return setError(String(data.error || "Something went wrong. Try again in a moment."));
      setDone({ message: String(data.message), dev: data.emailConfigured === false });
    } catch {
      setError("Banyan could not be reached. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div>
        <Status>{done.message}</Status>
        <DevNote show={done.dev} />
        <p className="mt-8 text-[14px] text-charcoal-soft">
          Remembered it? <Link href="/login" className={LINK}>Sign in</Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" aria-busy={busy}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="forgot-email" className="text-[13px] font-medium text-charcoal">Work email</label>
        <Input id="forgot-email" name="email" type="email" inputMode="email" autoComplete="email" spellCheck={false} autoCapitalize="none" required autoFocus placeholder="ada@ledgerline.app" className="h-11" />
      </div>
      <ErrorNote>{error}</ErrorNote>
      <button type="submit" disabled={busy} className={BUTTON}>{busy ? "Sending…" : "Send reset link"}</button>
      <p className="text-[14px] text-charcoal-soft">
        <Link href="/login" className={LINK}>Back to sign in</Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; again: boolean } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") || "");
    if (password !== String(form.get("confirm") || "")) return setError({ message: "The two passwords do not match.", again: false });
    setBusy(true);
    setError(null);
    try {
      const { ok, data } = await post("/api/auth/password/reset", { token, password });
      if (!ok) return setError({ message: String(data.error || "Something went wrong."), again: Boolean(data.reason) });
      router.push(String(data.next || "/login?reset=1"));
    } catch {
      setError({ message: "Banyan could not be reached. Check your connection and try again.", again: false });
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div>
        <ErrorNote>This page needs the link from your reset email.</ErrorNote>
        <p className="mt-6 text-[14px] text-charcoal-soft"><Link href="/forgot-password" className={LINK}>Ask for a reset link</Link></p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" aria-busy={busy}>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="reset-password" className="text-[13px] font-medium text-charcoal">New password</label>
          <span id="reset-password-hint" className="text-xs text-muted">8 characters or more</span>
        </div>
        <Input id="reset-password" name="password" type="password" autoComplete="new-password" required minLength={8} autoFocus aria-describedby="reset-password-hint" className="h-11" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="reset-confirm" className="text-[13px] font-medium text-charcoal">Type it again</label>
        <Input id="reset-confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} className="h-11" />
      </div>
      <ErrorNote>{error?.message ?? null}</ErrorNote>
      {error?.again && (
        <p className="-mt-2 text-[14px]"><Link href="/forgot-password" className={LINK}>Ask for a new link</Link></p>
      )}
      <button type="submit" disabled={busy} className={BUTTON}>{busy ? "Saving…" : "Set new password"}</button>
    </form>
  );
}

export function VerifyEmailResult({ signedIn }: { signedIn: boolean }) {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<{ kind: "checking" } | { kind: "ok" } | { kind: "error"; message: string; reason?: string }>({ kind: "checking" });
  const [resent, setResent] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setState({ kind: "error", message: "This page needs the link from your confirmation email." });
      return;
    }
    post("/api/auth/verify", { token })
      .then(({ ok, data }) => setState(ok ? { kind: "ok" } : { kind: "error", message: String(data.error || "That link did not work."), reason: data.reason as string | undefined }))
      .catch(() => setState({ kind: "error", message: "Banyan could not be reached. Check your connection and try again." }));
  }, [token]);

  async function resend() {
    setResent(null);
    const { ok, data } = await post("/api/auth/verify/resend", {}).catch(() => ({ ok: false, data: {} as Record<string, unknown> }));
    if (!ok) return setResent(String(data.error || "Could not send a new link."));
    setResent(data.alreadyVerified ? "Your address is already confirmed." : `A new link is on its way to ${String(data.email)}.`);
  }

  if (state.kind === "checking") return <p role="status" className="text-[15px] text-charcoal-soft">Confirming your address…</p>;
  if (state.kind === "ok") {
    return (
      <div>
        <Status>Your email address is confirmed. Banyan can now publish in your name once you approve a post.</Status>
        <p className="mt-6 text-[14px]"><Link href={signedIn ? "/app" : "/login"} className={LINK}>{signedIn ? "Back to Banyan" : "Sign in"}</Link></p>
      </div>
    );
  }
  return (
    <div>
      <ErrorNote>{state.message}</ErrorNote>
      {state.reason !== "used" && (
        <div className="mt-6 text-[14px] text-charcoal-soft">
          {signedIn ? (
            <button type="button" onClick={resend} className={`${LINK} underline-offset-2 hover:underline`}>Send me a new link</button>
          ) : (
            <span><Link href="/login?next=/app" className={LINK}>Sign in</Link> to ask for a new link.</span>
          )}
          {resent && <p role="status" className="mt-3">{resent}</p>}
        </div>
      )}
      {state.reason === "used" && (
        <p className="mt-6 text-[14px]"><Link href={signedIn ? "/app" : "/login"} className={LINK}>{signedIn ? "Back to Banyan" : "Sign in"}</Link></p>
      )}
    </div>
  );
}
