/** Loading skeleton for the authenticated app — avoids a blank screen mid-navigation. */
export default function AppLoading() {
  return (
    <div role="status" aria-live="polite" className="animate-pulse space-y-6">
      <span className="sr-only">Loading…</span>
      <div className="h-7 w-52 rounded bg-bark/10" />
      <div className="h-4 w-full max-w-2xl rounded bg-bark/10" />
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-[3px] border border-bark/15 bg-white p-4">
            <div className="h-3 w-24 rounded bg-bark/10" />
            <div className="mt-3 h-6 w-20 rounded bg-bark/10" />
          </div>
        ))}
      </div>
      <div className="h-40 rounded-[3px] border border-bark/15 bg-white" />
    </div>
  );
}
