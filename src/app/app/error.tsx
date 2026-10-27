"use client";

import Link from "next/link";
import { Button, Card } from "@/components/ui";

/** Recoverable error boundary for the app. Explains what happened and how to continue. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card className="border-clay/30">
      <h2 className="font-serif text-xl text-forest-deep">This page could not load</h2>
      <p className="mt-1 text-sm text-charcoal-soft">
        The rest of the app is unaffected — nothing was published or changed. Retry this page, or carry on from the
        dashboard.
      </p>
      {error.digest && <p className="mt-2 text-xs text-charcoal-soft">Reference: {error.digest}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Link
          href="/app"
          className="rounded-md border border-forest/20 px-4 py-2 text-sm font-medium text-forest-deep transition-colors hover:border-forest/50"
        >
          Back to dashboard
        </Link>
      </div>
    </Card>
  );
}
