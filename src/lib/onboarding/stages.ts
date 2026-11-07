/**
 * The nine onboarding stages (US-018). Pure: no database, so the rules are
 * unit-tested directly.
 *
 * Required stages are the minimum for Banyan to produce a grounded plan.
 * Optional stages can be skipped and revisited; skipping never blocks
 * exploring the product (brief: "never require social account connection
 * to explore the product").
 */

export const STAGES = [
  { key: "account", label: "Account", required: true },
  { key: "workspace", label: "Workspace", required: true },
  { key: "business", label: "Business profile", required: true },
  { key: "product_url", label: "Product URL", required: false },
  { key: "brand", label: "Brand identity", required: false },
  { key: "connection", label: "Distribution", required: false },
  { key: "preferences", label: "Distribution preferences", required: true },
  { key: "first_campaign", label: "First campaign", required: false },
  { key: "activation", label: "First publication", required: false },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];
export type StageStatus = "done" | "skipped" | "not_started";

export const STAGE_KEYS = STAGES.map((s) => s.key) as StageKey[];

export function isStageKey(value: string): value is StageKey {
  return (STAGE_KEYS as string[]).includes(value);
}

export function isRequired(key: StageKey): boolean {
  return STAGES.find((s) => s.key === key)!.required;
}

export type Progress = {
  stages: { key: StageKey; label: string; required: boolean; status: StageStatus }[];
  /** First stage that is neither done nor skipped; null when nothing is left. */
  current: StageKey | null;
  /** Share of all stages that are done or skipped, 0–100. */
  percent: number;
  /** Every required stage is done: the workspace counts as onboarded. */
  requiredComplete: boolean;
};

export function computeProgress(recorded: Partial<Record<string, "done" | "skipped">>): Progress {
  const stages = STAGES.map((s) => ({
    key: s.key,
    label: s.label,
    required: s.required,
    // Account exists by definition once a workspace has a progress record.
    status: (s.key === "account" ? "done" : (recorded[s.key] ?? "not_started")) as StageStatus,
  }));
  const settled = stages.filter((s) => s.status !== "not_started").length;
  return {
    stages,
    current: stages.find((s) => s.status === "not_started")?.key ?? null,
    percent: Math.round((settled / stages.length) * 100),
    requiredComplete: stages.filter((s) => s.required).every((s) => s.status === "done"),
  };
}

export type SkipCheck = { ok: true } | { ok: false; reason: string };

/** Only optional stages can be skipped, and a done stage stays done. */
export function canSkip(key: StageKey, current: StageStatus): SkipCheck {
  if (isRequired(key)) return { ok: false, reason: `"${STAGES.find((s) => s.key === key)!.label}" is required and cannot be skipped.` };
  if (current === "done") return { ok: false, reason: "This stage is already done." };
  return { ok: true };
}

/** A real IANA time zone, as known to this runtime (US-019). */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
