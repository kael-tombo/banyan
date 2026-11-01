import { describe, it, expect } from "vitest";
import { deltas, fold, estimateDraftRun, validAmount, insufficientMessage, CREDIT_KINDS, type CreditKind } from "@/lib/credits/ledger";

describe("credit ledger (US-055)", () => {
  it("moves the two balances by kind", () => {
    expect(deltas("grant", 50)).toEqual({ available: 50, reserved: 0 });
    expect(deltas("reserve", 10)).toEqual({ available: -10, reserved: 10 });
    expect(deltas("settle", 7)).toEqual({ available: 0, reserved: -7 });
    expect(deltas("release", 3)).toEqual({ available: 3, reserved: -3 });
    expect(deltas("refund", 2)).toEqual({ available: 2, reserved: 0 });
    expect(deltas("expire", 4)).toEqual({ available: -4, reserved: 0 });
    expect(deltas("adjust", -5)).toEqual({ available: -5, reserved: 0 });
  });

  it("the balance is the sum of the entries for any sequence", () => {
    const entries: { kind: CreditKind; amount: number }[] = [
      { kind: "grant", amount: 50 },
      { kind: "reserve", amount: 10 },
      { kind: "settle", amount: 7 },
      { kind: "release", amount: 3 },
      { kind: "refund", amount: 2 },
      { kind: "reserve", amount: 5 },
    ];
    expect(fold(entries)).toEqual({ available: 50 - 10 + 3 + 2 - 5, reserved: 5 });
    // Folding in any split equals folding the whole.
    const a = fold(entries.slice(0, 3));
    const b = fold(entries.slice(3));
    expect({ available: a.available + b.available, reserved: a.reserved + b.reserved }).toEqual(fold(entries));
  });

  it("a reservation closed by settle and release leaves nothing held", () => {
    expect(fold([{ kind: "grant", amount: 20 }, { kind: "reserve", amount: 9 }, { kind: "settle", amount: 6 }, { kind: "release", amount: 3 }])).toEqual({ available: 14, reserved: 0 });
  });

  it("validates amounts", () => {
    for (const k of CREDIT_KINDS.filter((k) => k !== "adjust")) {
      expect(validAmount(k, 0)).toBe(false);
      expect(validAmount(k, -1)).toBe(false);
      expect(validAmount(k, 1.5)).toBe(false);
      expect(validAmount(k, 3)).toBe(true);
    }
    expect(validAmount("adjust", -3)).toBe(true);
    expect(validAmount("adjust", 0)).toBe(false);
  });
});

describe("draft pricing (US-056)", () => {
  it("prices a run by complexity and itemises it", () => {
    expect(estimateDraftRun({ drafts: 4, channels: 2 })).toEqual({
      total: 6,
      lines: [{ label: "Drafting run", credits: 1 }, { label: "4 drafts", credits: 4 }, { label: "1 extra channel", credits: 1 }],
    });
    expect(estimateDraftRun({ drafts: 1, channels: 1 }).total).toBe(2);
    expect(estimateDraftRun({ drafts: 0, channels: 2 })).toEqual({ total: 0, lines: [] });
  });

  it("explains a short balance", () => {
    expect(insufficientMessage(10, 5)).toBe("This needs 10 credits and 5 are available. Nothing was started.");
    expect(insufficientMessage(1, 1)).toBe("This needs 1 credit and 1 is available. Nothing was started.");
  });
});
