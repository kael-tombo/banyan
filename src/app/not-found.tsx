import Link from "next/link";
import { BanyanMark } from "@/components/BanyanMark";

/**
 * Root 404. Public users can reach unknown URLs (typos, stale links) — this
 * keeps the experience branded and offers the two useful exits.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ivory px-4 text-center">
      <BanyanMark size={40} className="opacity-80" />
      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-clay">404</p>
      <h1 className="serif mt-2 text-3xl font-semibold text-forest-deep">This page has not taken root</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-charcoal-soft">
        The address does not match anything in Banyan. Nothing was changed by this visit — pick up where you left off.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/app"
          className="rounded-full bg-forest-deep px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-forest"
        >
          Go to your dashboard
        </Link>
        <Link
          href="/"
          className="rounded-full border border-forest/20 bg-white px-5 py-2.5 text-sm font-medium text-forest-deep transition-colors hover:border-forest/50"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
