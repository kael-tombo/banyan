import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { BanyanMark } from "@/components/BanyanMark";
import { ProviderLogo } from "@/components/ProviderLogo";
import { PROVIDERS } from "@/lib/auth/oauth/providers";
import { PENDING_COOKIE, safeNext, unseal, type PendingSignup } from "@/lib/auth/oauth/flow";
import { oauthKey } from "@/lib/auth/oauth/server";
import { CompleteForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Finish creating your account" };

/** Step two of a provider sign-up that arrived without an email (e.g. X). */
export default async function CompleteSignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const pending = unseal<PendingSignup>((await cookies()).get(PENDING_COOKIE)?.value, oauthKey());
  const label = pending ? PROVIDERS[pending.provider].label : null;

  return (
    <div className="flex min-h-svh flex-col bg-white px-5 py-5 sm:px-10 sm:py-6">
      <header className="flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2" aria-label="Banyan.ai home">
          <BanyanMark size={26} />
          <span className="text-[17px] font-medium tracking-[-0.01em] text-forest-deep">
            Banyan<span className="text-forest">.ai</span>
          </span>
        </Link>
        <Link href="/signup" className="flex items-center gap-1.5 text-[13px] text-charcoal-soft hover:text-forest-deep">
          <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
          Other sign-up options
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center py-12">
        <div className="fade-up w-full max-w-[380px]">
          {pending && label ? (
            <>
              <span className="inline-flex items-center gap-2 rounded-full border border-bark/12 px-3 py-1 text-[13px] text-charcoal-soft">
                <ProviderLogo provider={pending.provider} size={14} />
                Signed in with {label}
              </span>
              <h1 className="tight mt-5 text-[28px] font-medium leading-tight text-forest-deep">One more step</h1>
              <p className="mb-8 mt-2 text-[15px] leading-relaxed text-charcoal-soft">
                {label} doesn&rsquo;t share an email address. Add the one Banyan should use for your account.
              </p>
              <CompleteForm defaultName={pending.name ?? ""} next={safeNext(next)} />
            </>
          ) : (
            <>
              <h1 className="tight text-[28px] font-medium leading-tight text-forest-deep">This sign-up expired</h1>
              <p className="mt-2 text-[15px] leading-relaxed text-charcoal-soft">
                Provider sign-ups have to be finished within ten minutes, in the same browser.
              </p>
              <Link href="/signup" className="mt-8 inline-flex h-11 items-center justify-center rounded-xl bg-forest-deep px-5 text-[15px] font-medium text-white hover:bg-forest">
                Start again
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
