"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ErrorNote, Input } from "@/components/ui";

export function CompleteForm({ defaultName, next }: { defaultName: string; next: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/oauth/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: String(form.get("name") || "").trim(), email: String(form.get("email") || "").trim(), next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error || "Something went wrong. Try again in a moment.");
      router.push(data.next || "/app");
      router.refresh();
    } catch {
      setError("Banyan could not be reached. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" aria-busy={busy}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="complete-name" className="text-[13px] font-medium text-charcoal">Your name</label>
        <Input id="complete-name" name="name" autoComplete="name" required maxLength={80} defaultValue={defaultName} className="h-11" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="complete-email" className="text-[13px] font-medium text-charcoal">Work email</label>
        <Input id="complete-email" name="email" type="email" inputMode="email" autoComplete="email" spellCheck={false} autoCapitalize="none" required autoFocus placeholder="ada@ledgerline.app" className="h-11" />
      </div>
      <ErrorNote>{error}</ErrorNote>
      <button
        type="submit"
        disabled={busy}
        className="mt-1 inline-flex h-11 items-center justify-center rounded-xl bg-forest-deep px-5 text-[15px] font-medium text-white transition-colors hover:bg-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest disabled:cursor-progress disabled:opacity-70"
      >
        {busy ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
