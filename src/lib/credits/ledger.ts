/**
 * Credit ledger rules — US-055, US-056. Pure and unit-tested.
 *
 * Every movement is an entry with a positive amount and a kind. The kind
 * decides how it moves the two balances:
 *
 *   grant    available +n            credits added (starter, monthly, promo)
 *   reserve  available -n reserved +n held before billable work starts
 *   settle              reserved -n  the held credits are spent
 *   release  available +n reserved -n held credits returned (unused, failed)
 *   refund   available +n            spent credits given back
 *   expire   available -n            unused credits that lapsed
 *   adjust   available ±n            manual correction (signed amount)
 *
 * The balance shown anywhere is the fold of the entries, so the ledger and
 * the balance can never disagree.
 */

export const CREDIT_KINDS = ["grant", "reserve", "settle", "release", "refund", "expire", "adjust"] as const;
export type CreditKind = (typeof CREDIT_KINDS)[number];

export const KIND_LABEL: Record<CreditKind, string> = {
  grant: "Granted",
  reserve: "Reserved",
  settle: "Spent",
  release: "Returned",
  refund: "Refunded",
  expire: "Expired",
  adjust: "Adjusted",
};

export type Balance = { available: number; reserved: number };

export function deltas(kind: CreditKind, amount: number): Balance {
  switch (kind) {
    case "grant":
    case "refund":
      return { available: amount, reserved: 0 };
    case "reserve":
      return { available: -amount, reserved: amount };
    case "settle":
      return { available: 0, reserved: -amount };
    case "release":
      return { available: amount, reserved: -amount };
    case "expire":
      return { available: -amount, reserved: 0 };
    case "adjust":
      return { available: amount, reserved: 0 };
  }
}

export function fold(entries: { kind: string; amount: number }[]): Balance {
  return entries.reduce<Balance>(
    (acc, e) => {
      const d = deltas(e.kind as CreditKind, e.amount);
      return { available: acc.available + d.available, reserved: acc.reserved + d.reserved };
    },
    { available: 0, reserved: 0 },
  );
}

export function validAmount(kind: CreditKind, amount: number): boolean {
  if (!Number.isInteger(amount)) return false;
  return kind === "adjust" ? amount !== 0 : amount > 0;
}

/** Credits every workspace starts with. */
export const STARTER_GRANT = 50;

/**
 * What writing drafts costs, by complexity: a base per run, one per draft,
 * and one per channel beyond the first. Shown before anything is spent.
 */
export const PRICING = { base: 1, perDraft: 1, perExtraChannel: 1 } as const;

export type Estimate = { total: number; lines: { label: string; credits: number }[] };

export function estimateDraftRun(input: { drafts: number; channels: number }): Estimate {
  if (input.drafts <= 0) return { total: 0, lines: [] };
  const extraChannels = Math.max(0, input.channels - 1);
  const lines = [
    { label: "Drafting run", credits: PRICING.base },
    { label: `${input.drafts} draft${input.drafts === 1 ? "" : "s"}`, credits: input.drafts * PRICING.perDraft },
    ...(extraChannels ? [{ label: `${extraChannels} extra channel${extraChannels === 1 ? "" : "s"}`, credits: extraChannels * PRICING.perExtraChannel }] : []),
  ];
  return { total: lines.reduce((s, l) => s + l.credits, 0), lines };
}

export function insufficientMessage(needed: number, available: number): string {
  return `This needs ${needed} credit${needed === 1 ? "" : "s"} and ${available} ${available === 1 ? "is" : "are"} available. Nothing was started.`;
}
