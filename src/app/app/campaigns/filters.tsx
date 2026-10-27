"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { Input } from "@/components/ui";
import { StatusBadge } from "@/components/ui";

const STATUSES = ["draft", "planned", "in_progress", "completed", "archived"];

export function CampaignFilters({ counts }: { counts: { status: string; count: number }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const currentStatus = params.get("status") ?? "";
  const currentQ = params.get("q") ?? "";

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        defaultValue={currentQ}
        placeholder="Search name or message…"
        className="max-w-xs"
        onChange={(e) => setParam("q", e.target.value)}
        aria-label="Search campaigns"
      />
      <nav className="flex flex-wrap gap-1" aria-label="Filter by status">
        <FilterBtn label="All" active={!currentStatus} count={counts.reduce((s, c) => s + c.count, 0)} onClick={() => setParam("status", "")} />
        {STATUSES.map((s) => {
          const count = counts.find((c) => c.status === s)?.count ?? 0;
          return <FilterBtn key={s} active={currentStatus === s} count={count} onClick={() => setParam("status", s)} label={<StatusBadge status={s} />} ariaLabel={`Filter ${s}`} />;
        })}
      </nav>
    </div>
  );
}

function FilterBtn({ label, active, count, onClick, ariaLabel }: { label: React.ReactNode; active: boolean; count: number; onClick: () => void; ariaLabel?: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${active ? "border-forest/40 bg-forest/10 text-forest-deep" : "border-bark/15 bg-white text-charcoal-soft hover:border-forest/30"}`}
    >
      {active || count > 0 ? label : label}
      <span className="text-bark/50">{count}</span>
    </button>
  );
}
