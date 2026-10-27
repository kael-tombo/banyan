import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";

export const metadata: Metadata = { title: "Terms of Service" };

const updated = "October 27, 2026";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-ivory">
      <SiteNav cta="Sign in" ctaHref="/login" />
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="serif text-3xl font-semibold text-forest-deep">Terms of Service</h1>
        <p className="mt-2 text-sm text-charcoal-soft">Last updated: {updated}</p>

        <section className="mt-10 space-y-4 text-sm leading-relaxed text-charcoal-soft">
          <p>These terms govern your use of the Banyan.ai MVP.</p>

          <h2 className="serif text-xl font-semibold text-forest-deep">1. Accounts</h2>
          <p>
            You must provide a valid email address and a password of at least 8 characters. You are
            responsible for activity in your sessions and for keeping your credentials private.
          </p>

          <h2 className="serif text-xl font-semibold text-forest-deep">2. Your content and your responsibility</h2>
          <p>
            Content you create or publish through Banyan.ai is yours. You are responsible for complying
            with the rules of the platforms you publish to (X, LinkedIn, and others). Banyan.ai does not
            bypass platform restrictions, does not automate unauthorized publishing, and will not
            publish content that has not been approved by a recorded human action in your workspace.
          </p>

          <h2 className="serif text-xl font-semibold text-forest-deep">3. AI-generated content</h2>
          <p>
            AI drafts are suggestions. You are responsible for verifying claims before publication.
            Facts without evidence must not be published. Fallback template drafts are clearly labeled
            as such and must be treated as skeletons, not finished copy.
          </p>

          <h2 className="serif text-xl font-semibold text-forest-deep">4. Honest analytics</h2>
          <p>
            Analytics in Banyan.ai reflect recorded observations only: tracked link clicks, confirmed
            publications, provider responses, and metrics you or a provider report. We do not fabricate
            data, and attribution shown in the app is explicitly labeled as observed or estimated.
          </p>

          <h2 className="serif text-xl font-semibold text-forest-deep">5. Early-stage software</h2>
          <p>
            The MVP is provided as-is during early development, without a service-level guarantee of
            uptime. Publish scheduled posts through connections you have verified. Your data lives in
            the configured database; export anything you cannot afford to lose.
          </p>

          <h2 className="serif text-xl font-semibold text-forest-deep">6. Termination</h2>
          <p>
            You can stop using the service at any time. We may suspend accounts that abuse the service,
            attempt to publish unauthorized content through connected accounts, or compromise other
            users' security.
          </p>
        </section>
        <p className="mt-10 text-sm"><Link href="/" className="text-forest hover:text-forest-deep">← Back to home</Link></p>
      </main>
    </div>
  );
}
