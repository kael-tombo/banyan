import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";

export const metadata: Metadata = { title: "Privacy Policy" };

const updated = "October 27, 2026";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-ivory">
      <SiteNav cta="Sign in" ctaHref="/login" />
      <main className="prose-banyan mx-auto max-w-3xl px-4 py-16">
        <h1 className="serif text-3xl font-semibold text-forest-deep">Privacy Policy</h1>
        <p className="mt-2 text-sm text-charcoal-soft">Last updated: {updated}</p>

        <section className="mt-10 space-y-4 text-sm leading-relaxed text-charcoal-soft">
          <p>
            Banyan.ai is an early-stage product. This policy describes what we collect in the current
            MVP and why. We do not sell personal data, and we do not show advertising.
          </p>

          <h2 className="serif text-xl font-semibold text-forest-deep">What we collect</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li><strong>Account data</strong> — your name, email address, and a hashed password (bcrypt). We never store your password in readable form.</li>
            <li><strong>Workspace content</strong> — product profiles, audience notes, campaigns, content, approvals, and results you record. This is your data; workspace isolation is enforced in the application.</li>
            <li><strong>Analytics you create via our links</strong> — when a visitor clicks a tracked distribution link (a /t/ link), we record the click, the UTM parameters of the link, and the time. If that visitor later signs up, we record that the signup followed a tracked link. This is observed attribution, not inferred identity matching.</li>
            <li><strong>Session cookie</strong> — one httpOnly cookie (`banyan_session`) keeps you signed in. One optional cookie (`banyan_vis`) records the tracked link you arrived through so signups can be attributed. No third-party tracking cookies.</li>
          </ul>

          <h2 className="serif text-xl font-semibold text-forest-deep">Third-party services</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li><strong>Publishing connections</strong> — when you configure a Postiz connection, your API key is stored encrypted (AES-256-GCM) and sent only to the Postiz instance you specify, to publish posts you approve.</li>
            <li><strong>AI providers</strong> — content generation may call a model provider if you configure one. Without configuration, no external AI calls are made and a clearly-labeled template fallback is used.</li>
          </ul>

          <h2 className="serif text-xl font-semibold text-forest-deep">What we do not do</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>We do not sell or share personal data with data brokers or advertisers.</li>
            <li>We do not fabricate analytics. Reports show measured facts or nothing.</li>
            <li>We do not publish anything to external platforms without recorded human approval.</li>
          </ul>

          <h2 className="serif text-xl font-semibold text-forest-deep">Your choices</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>You can delete workspace content at any time within the app.</li>
            <li>Ask questions about your data at <span className="text-forest">privacy@banyan.ai</span> (we are a small team; replies may take a couple of business days).</li>
          </ul>

          <p className="text-xs text-charcoal-soft">
            This policy covers the MVP as implemented. Material changes will be reflected here with a new "last updated" date.
          </p>
        </section>
        <p className="mt-10 text-sm"><Link href="/" className="text-forest hover:text-forest-deep">← Back to home</Link></p>
      </main>
    </div>
  );
}
