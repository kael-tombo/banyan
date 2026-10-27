"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input, Select } from "@/components/ui";

export function ContentSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        defaultValue={params.get("q") ?? ""}
        placeholder="Search titles and bodies…"
        className="max-w-xs"
        onChange={(e) => setParam("q", e.target.value)}
        aria-label="Search content"
      />
      <Select defaultValue={params.get("status") ?? ""} onChange={(e) => setParam("status", e.target.value)} className="max-w-44" aria-label="Filter by status">
        <option value="">All statuses</option>
        {["draft", "ready_for_review", "approved", "scheduled", "published", "failed", "rejected", "archived"].map((s) => (
          <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
        ))}
      </Select>
      <Select defaultValue={params.get("channel") ?? ""} onChange={(e) => setParam("channel", e.target.value)} className="max-w-40" aria-label="Filter by channel">
        <option value="">All channels</option>
        <option value="x">X</option>
        <option value="linkedin">LinkedIn</option>
        <option value="shortvideo">Short-form video</option>
      </Select>
    </div>
  );
}
