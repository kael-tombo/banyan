"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { Input, ErrorNote } from "@/components/ui";
import { BanyanMark } from "@/components/BanyanMark";
import { DistributionLandscape } from "@/components/landing/landscape/DistributionLandscape";
import { PlatformMark } from "@/components/landing/landscape/platforms";

type Mode = "login" | "signup";

const COPY: Record<Mode, { title: string; lede: string; submit: string; busy: string }> = {
  signup: {
    title: "Create your Banyan account",
    lede: "Next you'll describe your product. Banyan drafts from there, and nothing is published until you approve it.",
    submit: "Create account",
    busy: "Creating account…",
  },
  login: {
    title: "Sign in to Banyan",
    lede: "Your drafts, approvals and results are where you left them.",
    submit: "Sign in",
    busy: "Signing in…",
  },
};

/** Only same-site paths may be used as a post-auth destination. */
function safeNext(raw: string | null | undefined): string | null {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : null;
}

function Label({ htmlFor, children, aside }: { htmlFor: string; children: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-charcoal">
        {children}
      </label>
      {aside}
    </div>
  );
}

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);
  const copy = COPY[mode];

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    const payload = mode === "signup" ? { name: String(form.get("name") || "").trim(), email, password } : { email, password };
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Something went wrong. Try again in a moment.");
        return;
      }
      router.push(safeNext(params.get("next")) || safeNext(data.next) || "/app");
      router.refresh();
    } catch {
      setError("Banyan could not be reached. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" aria-busy={busy}>
      {mode === "signup" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="auth-name">Your name</Label>
          <Input id="auth-name" name="name" autoComplete="name" required maxLength={80} autoFocus placeholder="Ada Okafor" className="h-11" />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="auth-email">Work email</Label>
        <Input
          id="auth-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          spellCheck={false}
          autoCapitalize="none"
          required
          autoFocus={mode === "login"}
          placeholder="ada@ledgerline.app"
          className="h-11"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="auth-password"
          aside={mode === "signup" ? <span id="auth-password-hint" className="text-xs text-muted">8 characters or more</span> : undefined}
        >
          Password
        </Label>
        <div className="relative">
          <Input
            id="auth-password"
            name="password"
            type={reveal ? "text" : "password"}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={mode === "signup" ? 8 : 1}
            aria-describedby={mode === "signup" ? "auth-password-hint" : undefined}
            className="h-11 w-full pr-11"
          />
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? "Hide password" : "Show password"}
            aria-pressed={reveal}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted transition-colors hover:text-charcoal focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-forest"
          >
            {reveal ? <EyeOff size={16} strokeWidth={1.5} aria-hidden="true" /> : <Eye size={16} strokeWidth={1.5} aria-hidden="true" />}
          </button>
        </div>
      </div>

      <ErrorNote>{error}</ErrorNote>

      <button
        type="submit"
        disabled={busy}
        className="mt-1 inline-flex h-11 items-center justify-center rounded-xl bg-forest-deep px-5 text-[15px] font-medium text-white transition-[background-color,transform] duration-150 hover:bg-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest active:scale-[0.99] disabled:cursor-progress disabled:opacity-70"
      >
        {busy ? copy.busy : copy.submit}
      </button>

      {mode === "signup" && (
        <p className="text-xs leading-relaxed text-muted">
          By creating an account you agree to the{" "}
          <Link href="/terms" className="text-charcoal-soft underline decoration-bark/30 underline-offset-2 hover:text-forest-deep">Terms</Link> and{" "}
          <Link href="/privacy" className="text-charcoal-soft underline decoration-bark/30 underline-offset-2 hover:text-forest-deep">Privacy policy</Link>.
        </p>
      )}
    </form>
  );
}

/**
 * The moment: the internet keeps flowing behind, and in front of it sits the
 * one thing Banyan never does without you, a drafted post waiting for a
 * decision. Fictional product (Ledgerline, as on the landing page);
 * decorative, so hidden from assistive tech.
 */
function ApprovalMoment() {
  return (
    <div className="relative h-full overflow-hidden rounded-[20px] border border-bark/10 bg-white" aria-hidden="true">
      <DistributionLandscape variant="panel" />

      <div className="relative flex h-full flex-col items-center justify-center px-10 pb-28">
        <div className="w-full max-w-[400px] rounded-2xl border border-bark/12 bg-white p-5 card-shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[13px] text-charcoal">
              <PlatformMark platform="linkedin" size={20} />
              LinkedIn post
              <span className="text-muted">· draft 2 of 3</span>
            </span>
            <span className="flex items-center gap-1.5 text-xs text-fig-deep">
              <span className="h-1.5 w-1.5 rounded-full bg-fig" />
              Waiting on you
            </span>
          </div>

          <p className="mt-4 text-[14px] leading-relaxed text-charcoal">
            Freelancers told us the worst part of losing signal wasn&rsquo;t the work. It was the invoice that couldn&rsquo;t go out.
            Ledgerline now sends it the moment you&rsquo;re back online.
          </p>

          <p className="mt-3 truncate font-mono text-[11px] text-muted">ledgerline.app/offline?utm_source=linkedin&amp;utm_campaign=get-paid</p>

          <div className="mt-4 flex items-center gap-2 border-t border-bark/10 pt-4">
            <span className="inline-flex h-8 items-center rounded-lg bg-forest-deep px-3 text-[13px] font-medium text-white">Approve</span>
            <span className="inline-flex h-8 items-center rounded-lg border border-bark/15 px-3 text-[13px] text-charcoal">Edit</span>
            <span className="ml-auto text-xs text-muted">Scheduled for Tue, 9:00</span>
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0">
        <div className="h-16 bg-gradient-to-t from-white to-white/0" />
        <div className="bg-white px-10 pb-8">
          <p className="text-[15px] font-medium text-forest-deep">Nothing goes out until you approve it</p>
          <p className="mt-1.5 max-w-[440px] text-[13px] leading-relaxed text-charcoal-soft">
            Banyan drafts for each channel, waits for your decision, then measures what each post brought in visits and signups.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Page wrapper shared by the login and signup pages. */
export function AuthShell({ mode }: { mode: Mode }) {
  const params = useSearchParams();
  const copy = COPY[mode];
  const next = safeNext(params.get("next"));
  const other = mode === "signup" ? "/login" : "/signup";
  const otherHref = next ? `${other}?next=${encodeURIComponent(next)}` : other;

  return (
    <div className="grid min-h-svh bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex min-h-svh flex-col px-5 py-5 sm:px-10 sm:py-6">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2" aria-label="Banyan.ai home">
            <BanyanMark size={26} />
            <span className="text-[17px] font-medium tracking-[-0.01em] text-forest-deep">
              Banyan<span className="text-forest">.ai</span>
            </span>
          </Link>
          <Link href="/" className="flex items-center gap-1.5 text-[13px] text-charcoal-soft hover:text-forest-deep">
            <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
            Back to site
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center py-12">
          <div className="fade-up w-full max-w-[380px]">
            <h1 className="tight text-[28px] font-medium leading-tight text-forest-deep">{copy.title}</h1>
            <p className="mb-8 mt-2 text-[15px] leading-relaxed text-charcoal-soft">{copy.lede}</p>
            <AuthForm mode={mode} />
            <p className="mt-8 border-t border-bark/10 pt-6 text-[14px] text-charcoal-soft">
              {mode === "signup" ? "Already have an account? " : "New to Banyan? "}
              <Link href={otherHref} className="font-medium text-forest hover:text-forest-deep">
                {mode === "signup" ? "Sign in" : "Create an account"}
              </Link>
            </p>
          </div>
        </main>

        <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span>© {new Date().getFullYear()} Banyan.ai</span>
          <Link href="/privacy" className="hover:text-forest-deep">Privacy</Link>
          <Link href="/terms" className="hover:text-forest-deep">Terms</Link>
        </footer>
      </div>

      <aside className="hidden p-3 lg:block">
        <div className="sticky top-3 h-[calc(100svh-1.5rem)]">
          <ApprovalMoment />
        </div>
      </aside>
    </div>
  );
}
