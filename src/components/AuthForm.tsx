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
        <Input name="email" type="email" autoComplete="email" required placeholder="you@company.com" />
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

/** Page wrapper shared by the login and signup pages. */
export function AuthShell({ mode }: { mode: "login" | "signup" }) {
  return (
    <div className="grain flex min-h-screen flex-col bg-ivory">
      <div className="pointer-events-none flex h-14 items-center px-5">
        <div className="flex items-center gap-2">
          <BanyanMark size={22} />
          <span className="font-serif text-lg text-forest-deep">
            Banyan<span className="text-moss">.ai</span>
          </span>
        </div>
      </div>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="fade-up w-full max-w-md rounded-xl border border-bark/15 bg-white p-8 shadow-md">
          <h1 className="serif text-2xl font-semibold text-forest-deep">
            {mode === "signup" ? "Start distributing" : "Welcome back"}
          </h1>
          <p className="mt-1 mb-6 text-sm text-charcoal-soft">
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
  );
}
