"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Finish onboarding without starting a cycle, so the dashboard stops sending the founder back here. */
export function ExploreFirst() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className="font-medium text-forest hover:underline disabled:opacity-60"
      onClick={async () => {
        setBusy(true);
        let timeZone: string | undefined;
        try {
          timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch {
          timeZone = undefined;
        }
        await fetch("/api/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ timeZone }) }).catch(() => null);
        router.push("/app");
        router.refresh();
      }}
    >
      {busy ? "Opening…" : "Look around first"}
    </button>
  );
}
