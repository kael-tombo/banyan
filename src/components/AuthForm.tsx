"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Input, Button, ErrorNote } from "@/components/ui";
import { BanyanMark } from "@/components/BanyanMark";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const payload =
      mode === "signup"
        ? {
            name: String(form.get("name") || ""),
            email: String(form.get("email") || ""),
            password: String(form.get("password") || ""),
          }
        : { email: String(form.get("email") || ""), password: String(form.get("password") || "") };
    try {
      const res = await fetch(`/api/auth/${mode === "signup" ? "signup" : "login"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }
      const next = params.get("next") || data.next || "/app";
      router.push(next);
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {mode === "signup" && (
        <label className="flex flex-col gap-1 text-sm font-medium text-charcoal">
          Name
          <Input name="name" autoComplete="name" required maxLength={80} placeholder="Ada Founder" />
        </label>
      )}
      <label className="flex flex-col gap-1 text-sm font-medium text-charcoal">
        Email
        <Input name="email" type="email" autoComplete="email" spellCheck={false} required placeholder="you@company.com" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-charcoal">
        Password
        <Input
          name="password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
          minLength={mode === "signup" ? 8 : 1}
          placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
        />
      </label>
      <ErrorNote>{error}</ErrorNote>
      <Button type="submit" disabled={busy} className="justify-center">
        {busy ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-charcoal-soft">
        {mode === "signup" ? (
          <>
            Already have an account? <Link href="/login" className="text-forest hover:text-forest-deep">Sign in</Link>
          </>
        ) : (
          <>
            New here? <Link href="/signup" className="text-forest hover:text-forest-deep">Create an account</Link>
          </>
        )}
      </p>
    </form>
  );
}

/** Page wrapper shared by the login and signup pages.
 * Split-screen: the canopy panel carries the brand and the promise; the form
 * gets a calm, uncluttered column. Collapses to a stacked layout on mobile. */
export function AuthShell({ mode }: { mode: "login" | "signup" }) {
  return (
    <div className="app-canvas grid min-h-screen lg:grid-cols-2">
      {/* Brand panel — canopy */}
      <aside className="canopy relative hidden flex-col justify-between p-10 text-ivory lg:flex" aria-hidden={false}>
        <Link href="/" className="flex items-center gap-2.5" aria-label="Banyan.ai home">
          <BanyanMark size={30} variant="white" />
          <span className="font-serif text-lg font-semibold">Banyan<span className="text-fig">.ai</span></span>
        </Link>
        <div>
          <blockquote className="display text-4xl leading-tight">
            Build your product.
            <br />
            Let it find its people.
          </blockquote>
          <ul className="mt-8 space-y-3 text-sm text-sage/85">
            <li className="flex items-center gap-2.5"><span className="h-px w-6 bg-fig" aria-hidden="true" /> Research, create, approve, publish — one workflow</li>
            <li className="flex items-center gap-2.5"><span className="h-px w-6 bg-fig" aria-hidden="true" /> Human approval required before anything goes live</li>
            <li className="flex items-center gap-2.5"><span className="h-px w-6 bg-fig" aria-hidden="true" /> Measured outcomes, never invented ones</li>
          </ul>
        </div>
        <p className="text-xs text-sage/60">© {new Date().getFullYear()} Banyan.ai — Build. Distribute. Grow.</p>
      </aside>

      {/* Form panel */}
      <div className="flex min-h-screen flex-col">
        <div className="canopy relative flex items-center justify-between px-5 py-3 lg:hidden">
          <Link href="/" className="flex items-center gap-2" aria-label="Banyan.ai home">
            <BanyanMark size={22} variant="white" />
            <span className="font-serif text-base text-ivory">Banyan<span className="text-fig">.ai</span></span>
          </Link>
          <Link href="/" className="text-xs text-sage/80 hover:text-ivory">← Back to site</Link>
        </div>
        <main className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center sm:px-6">
          <div className="fade-up card-shadow w-full max-w-md rounded-2xl border border-bark/12 bg-white p-8">
            <h1 className="font-serif text-[28px] leading-tight tracking-[-0.02em] text-forest-deep">
              {mode === "signup" ? "Start distributing" : "Welcome back"}
            </h1>
            <p className="mb-6 mt-1 text-sm text-charcoal-soft">
              {mode === "signup"
                ? "Create your account and set up your distribution workspace in five minutes."
                : "Sign in to your distribution workspace."}
            </p>
            <AuthForm mode={mode} />
          </div>
        </main>
        <footer className="px-4 pb-6 text-center text-xs text-charcoal-soft">
          <Link href="/privacy" className="hover:text-forest-deep">Privacy</Link>
          <span className="mx-2">·</span>
          <Link href="/terms" className="hover:text-forest-deep">Terms</Link>
        </footer>
      </div>
    </div>
  );
}
