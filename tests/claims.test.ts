import { describe, it, expect } from "vitest";
import { findClaims, isSupported, unsupportedClaims, unvouched } from "@/lib/content/claims";

const kinds = (s: string) => findClaims(s).map((c) => [c.kind, c.phrase]);

describe("findClaims", () => {
  it("finds the claims models invent", () => {
    expect(kinds("Teams cut review time by 40% with Ledgerline.")).toEqual([["metric", "40%"]]);
    expect(kinds("Invoices go out 3x faster.")).toEqual([["metric", "3x faster"]]);
    expect(kinds("Customers recovered $2.4M last year.")).toEqual([["metric", "$2.4M"]]);
    expect(kinds("It saves you 6 hours every week.")).toEqual([["metric", "saves you 6 hours"]]);
    expect(kinds("Used by 1,200+ founders worldwide.")[0]).toEqual(["social_proof", "Used by 1,200+ founders worldwide"]);
    expect(kinds("Join over 500 teams shipping faster.")[0]).toEqual(["social_proof", "Join over 500"]);
    expect(kinds("We now have 10k+ active users.")).toEqual([["customer_count", "10k+ active users"]]);
    expect(kinds('"This changed how we invoice." — Maria, Acme')[0][0]).toBe("testimonial");
    expect(kinds("The #1 invoicing tool for freelancers.")[0][0]).toBe("ranking");
    expect(kinds("An industry-leading approach.")[0][0]).toBe("ranking");
    expect(kinds("Guaranteed to get you paid.")[0][0]).toBe("ranking");
  });

  it("does not flag ordinary copy", () => {
    expect(findClaims("1/ We shipped usage alerts.\n\n2/ They fire before you hit a limit.")).toEqual([]);
    expect(findClaims("Released on 12 November 2026, version 2.1.")).toEqual([]);
    expect(findClaims("Set up takes three steps. Try it today.")).toEqual([]);
    expect(findClaims("We spent 14 days talking to 20 freelancers before building it.")).toEqual([]);
  });

  it("reports each claim once, in order", () => {
    const c = findClaims("40% faster. Really, 40% faster. Trusted by teams.");
    expect(c.map((x) => x.phrase)).toEqual(["40%", "Trusted by teams"]);
  });
});

describe("grounding", () => {
  const evidence = "Beta cohort: invoice approval time fell 40 % across 1,200 founders. Average 6 hours saved a week.";

  it("supports a claim whose figures appear in the founder's evidence", () => {
    const [pct] = findClaims("Approval time down 40%.");
    expect(isSupported(pct, evidence)).toBe(true);
    const [count] = findClaims("Used by 1200 founders.");
    expect(isSupported(count, evidence)).toBe(true);
    const [time] = findClaims("It saves you 6 hours.");
    expect(isSupported(time, evidence)).toBe(true);
  });

  it("does not support a figure that is not in the evidence", () => {
    expect(unsupportedClaims("Approval time down 45%.", [evidence]).map((c) => c.phrase)).toEqual(["45%"]);
    expect(unsupportedClaims("Used by 5,000 founders.", [evidence])).toHaveLength(1);
  });

  it("needs exact wording for a claim without figures", () => {
    expect(unsupportedClaims("Trusted by indie hackers.", ["Trusted by indie hackers since 2024."])).toEqual([]);
    expect(unsupportedClaims("Trusted by indie hackers.", ["Indie hackers like it."])).toHaveLength(1);
  });

  it("treats no evidence as no support", () => {
    expect(unsupportedClaims("40% faster", [])).toHaveLength(1);
    expect(unsupportedClaims("40% faster", ["", ""])).toHaveLength(1);
  });

  it("clears only the claims the founder vouched for", () => {
    const claims = unsupportedClaims("40% faster. Used by 300 teams.", []);
    expect(unvouched(claims, [claims[0].key]).map((c) => c.kind)).toEqual(["social_proof"]);
  });
});

describe("testimonials", () => {
  it("need the exact quote in the evidence, not just its figures", () => {
    const quote = '"We cut invoicing time by 40%." — Maria, Acme';
    expect(unsupportedClaims(quote, ["Invoicing time fell 40% in the beta."])).toHaveLength(1);
    expect(unsupportedClaims(quote, ['Maria said: "We cut invoicing time by 40%." — Maria, Acme'])).toEqual([]);
  });
});

describe("checkDraft integration", () => {
  it("flags unsupported claims only when evidence is supplied", async () => {
    const { checkDraft } = await import("@/lib/content/checks");
    const body = "Ledgerline is used by 2,000 freelancers and cuts chasing by 30%.";
    expect(checkDraft({ channel: "linkedin", format: "post", body, banned: [] })).toEqual([]);
    const flags = checkDraft({ channel: "linkedin", format: "post", body, banned: [], evidence: ["Beta: chasing time down 30%."] });
    expect(flags.map((f) => f.code)).toEqual(["unsupported_claim"]);
    expect(flags[0]).toMatchObject({ phrase: "used by 2,000 freelancers and cuts chasing by 30%" });
  });
});
