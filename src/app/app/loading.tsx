/** Loading skeleton for the authenticated app — avoids a blank screen mid-navigation. */
export default function AppLoading() {
  return (
    <div role="status" aria-live="polite" className="animate-pulse space-y-6">
      <span className="sr-only">Loading…</span>
      <div className="h-3 w-40 rounded-full bg-bark/10" />
      <div className="h-9 w-64 rounded-lg bg-bark/10" />
      <div className="h-4 w-full max-w-2xl rounded-full bg-bark/[0.07]" />
      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <div className="h-56 rounded-2xl bg-forest-deep/[0.08]" />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-bark/12 bg-white p-4">
              <div className="h-8 w-8 rounded-lg bg-bark/10" />
              <div className="mt-4 h-7 w-16 rounded bg-bark/10" />
              <div className="mt-2 h-3 w-20 rounded-full bg-bark/[0.07]" />
            </div>
          ))}
        </div>
      </div>
      <div className="h-64 rounded-2xl border border-bark/12 bg-white" />
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-bark/12 bg-white p-4">
            <div className="h-3 w-24 rounded-full bg-bark/10" />
            <div className="mt-3 h-6 w-20 rounded bg-bark/10" />
          </div>
        ))}
      </div>
    </div>
  );
}
