import { describe, it, expect, vi } from "vitest";
import { parseHnLeads, parseHnStories, parseSoQuestions, titleRelevance } from "@/lib/research/sources";
import { candidateUrl, dedupeCandidates, readCompetitor } from "@/lib/research/competitors";
import { cleanQuery, runMarketResearch, ruleOpportunities } from "@/lib/research/market";
import { analysisSchema } from "@/lib/product/analyze";
import type { SafeFetchResult } from "@/lib/net/safe-fetch";

const page = (html: string, status = 200): SafeFetchResult => ({ status, headers: new Headers({ "content-type": "text/html" }), text: html, truncated: false });

const comment = (id: string, text: string, author = "someone") => ({ objectID: id, author, created_at: "2026-10-01T00:00:00Z", comment_text: text });

describe("buying signals from public comments", () => {
  const hits = {
    hits: [
      comment("1", "We are moving off Calendly because it got too expensive for our team. Anything simpler?", "alice"),
      comment("2", "Email: me@example.com Book a call: https://calendly.com/me/15min Looking for: staff roles.", "recruiter"),
      comment("3", "I'm building a Calendly alternative that lets an LLM pick slots, feedback welcome.", "founder"),
      comment("4", "Here is my link https://calendly.com/bob and that's all I have to say about planning.", "bob"),
      comment("5", "Honestly Calendly is way too expensive for what it does, sick of paying per seat.", "carol"),
      comment("6", "Look at Cal.com compared to Calendly and you'll see the difference immediately.", "dave"),
    ],
  };
  const leads = parseHnLeads(hits, "Calendly");

  it("keeps people switching, complaining or comparing, with the sentence that says so", () => {
    expect(leads.map((l) => [l.author, l.intent])).toEqual([
      ["alice", "alternative_to"],
      ["carol", "frustrated"],
      ["dave", "comparing"],
    ]);
    expect(leads[0].excerpt).toBe("We are moving off Calendly because it got too expensive for our team.");
    expect(leads[0].url).toBe("https://news.ycombinator.com/item?id=1");
  });

  it("drops job posts, founders announcing their own alternative, and names that only appear in a link", () => {
    expect(leads.map((l) => l.author)).not.toContain("recruiter");
    expect(leads.map((l) => l.author)).not.toContain("founder");
    expect(leads.map((l) => l.author)).not.toContain("bob");
  });

  it("for a topic, needs the ask and every topic word in one sentence", () => {
    const t = parseHnLeads(
      { hits: [comment("7", "Is there a good tool for invoice reminders that works offline? Thanks."), comment("8", "Looking for a new job. Unrelated: invoice reminders are dull.")] },
      "invoice reminders",
      "topic",
    );
    expect(t.map((l) => l.id)).toEqual(["hn:7"]);
  });
});

describe("conversations", () => {
  it("links to the discussion and scores relevance by title words", () => {
    const s = parseHnStories({ hits: [{ objectID: "9", title: "Ask HN: What is the most annoying part of scheduling meetings?", points: 40, num_comments: 12, author: "x", created_at: "2026-09-01" }] }, "meeting scheduling");
    expect(s[0].url).toBe("https://news.ycombinator.com/item?id=9");
    expect(titleRelevance(s[0].title, "meeting scheduling")).toBe(1);
    expect(titleRelevance("Where Lisp fails at turning people into cogs", "where people intro")).toBe(0);
  });

  it("turns unanswered Stack Overflow questions into signals, keeping author and link", () => {
    const out = parseSoQuestions({ items: [{ question_id: 1, title: "How to send invoice reminders from Node?", link: "https://stackoverflow.com/q/1", owner: { display_name: "dev&amp;co" }, score: 3, answer_count: 0, is_answered: false, creation_date: 1790000000 }] }, "invoice reminders");
    expect(out.conversations[0].author).toBe("dev&co");
    expect(out.leads[0]).toMatchObject({ intent: "asking_how", url: "https://stackoverflow.com/q/1" });
  });

  it("drops filler words that no title contains", () => {
    expect(cleanQuery("Meeting Scheduling Software")).toBe("meeting scheduling");
  });
});

describe("competitors are checked on their own sites", () => {
  it("skips the status quo, the product itself and duplicates", () => {
    const out = dedupeCandidates(
      [
        { name: "Zoom / Google Meet", source: "named_on_site" },
        { name: "Email back-and-forth", source: "named_on_site" },
        { name: "Cal.com", source: "suggested", domain: "cal.com" },
        { name: "Calendly", source: "suggested", domain: "calendly.com" },
        { name: "calendly", source: "named_on_site" },
      ],
      "Cal.com",
      "https://cal.com/",
    );
    expect(out).toEqual([{ name: "calendly", source: "named_on_site" }]);
  });

  it("guesses name.com only when no domain is given", () => {
    expect(candidateUrl({ name: "SavvyCal", source: "named_on_site" })).toBe("https://savvycal.com/");
    expect(candidateUrl({ name: "X", source: "suggested", domain: "https://www.calendly.com/pricing" })).toBe("https://calendly.com/");
  });

  it("is verified only when the page names it, and then reads its tagline and button", async () => {
    const html = `<html><head><title>Calendly - Scheduling</title></head><body><h1>All the work around meetings, handled</h1><a class="btn" href="/signup">Get started</a></body></html>`;
    const ok = await readCompetitor({ name: "Calendly", domain: "calendly.com", source: "suggested" }, async () => page(html));
    expect(ok).toMatchObject({ verified: true, tagline: "All the work around meetings, handled", cta: "Get started" });
    const parked = await readCompetitor({ name: "Harmonizely", domain: "harmonizely.com", source: "suggested" }, async () => page("<title>Domain for sale</title>"));
    expect(parked.verified).toBe(false);
    const down = await readCompetitor({ name: "Gone", domain: "gone.example", source: "suggested" }, async () => { throw new Error("unreachable"); });
    expect(down.verified).toBe(false);
  });
});

const analysis = analysisSchema.parse({
  product_name: "Ledgerline",
  description: "Invoicing that works offline.",
  value_proposition: "Get paid without chasing clients.",
  features: ["Offline invoicing", "Automatic reminders"],
  target_audience: ["freelance designers"],
  problems_solved: [],
  differentiators: ["Works offline"],
  missing_information: [],
  provenance: {},
  category: "invoicing software for freelancers",
  alternatives: ["FreshBooks"],
});

describe("the market scan", () => {
  const fetchPage = vi.fn(async (url: string) =>
    url === "https://freshbooks.com/" ? page(`<title>FreshBooks</title><h1>Accounting software for small business</h1>`) : page("", 404),
  );
  const fetchJson = vi.fn(async (url: string) => {
    if (url.includes("tags=story") && url.includes("query=invoicing%20freelancers")) {
      return { hits: [{ objectID: "s1", title: "Ask HN: Invoicing for freelancers in 2026?", points: 80, num_comments: 40, author: "q", created_at: "2026-09-01" }] };
    }
    if (url.includes("tags=comment") && url.includes("FreshBooks")) {
      return { hits: [comment("c1", "We switched from FreshBooks last month because the price doubled.", "erin")] };
    }
    return { hits: [] };
  });

  it("without a model: verified competitor, a relevant thread, a buying signal, and opportunities that cite them", async () => {
    const r = await runMarketResearch(analysis, "https://ledgerline.app/", { fetchPage, fetchJson });
    expect(r.method).toBe("basic");
    expect(r.queries[0]).toBe("invoicing freelancers");
    expect(r.competitors).toMatchObject([{ name: "FreshBooks", verified: true, source: "named_on_site" }]);
    expect(r.conversations.map((c) => c.title)).toEqual(["Ask HN: Invoicing for freelancers in 2026?"]);
    expect(r.leads).toMatchObject([{ author: "erin", intent: "alternative_to", about: "FreshBooks" }]);
    expect(r.opportunities.map((o) => o.kind)).toEqual(["conversation", "competitor_gap", "content", "proof", "positioning"]);
    for (const o of r.opportunities) expect(o.evidence.length).toBeGreaterThan(0);
    expect(r.sources).toEqual([{ name: "Competitor websites", ok: true }, { name: "Hacker News", ok: true }]);
  });

  it("uses the founder's own search terms and competitors when given", async () => {
    fetchJson.mockClear();
    await runMarketResearch(analysis, "https://ledgerline.app/", { fetchPage, fetchJson }, { queries: ["late invoices"], competitors: [{ name: "Wave", domain: "waveapps.com" }] });
    const urls = fetchJson.mock.calls.map((c) => c[0]);
    expect(urls.some((u) => u.includes("query=late%20invoices"))).toBe(true);
    expect(urls.some((u) => u.includes("FreshBooks"))).toBe(false);
  });

  it("reports a source that fails instead of filling the gap", async () => {
    const r = await runMarketResearch(analysis, "https://ledgerline.app/", { fetchPage, fetchJson: async () => { throw new Error("down"); } });
    expect(r.conversations).toEqual([]);
    expect(r.sources).toContainEqual({ name: "Hacker News", ok: false });
  });

  it("drops model opportunities that cite no real evidence", async () => {
    const complete = vi.fn(async ({ user, prompt }: { user: string; prompt: { name: string } }) => {
      if (prompt.name === "market-scan") {
        return { text: JSON.stringify({ competitors: [], search_queries: ["invoicing freelancers"], developer_audience: false }), live: true };
      }
      // Cite the evidence id Banyan actually gave the post by erin.
      const erin = user.match(/\[(E\d+)\][^\n]*erin/)?.[1];
      return {
        text: JSON.stringify({
          opportunities: [
            { title: "Reply to Erin's switch from FreshBooks", rationale: "Someone is switching right now.", first_step: "Reply.", kind: "conversation", evidence_ids: [erin], confidence: "medium" },
            { title: "Claim 10,000 users", rationale: "Big numbers convert better than anything.", kind: "proof", evidence_ids: ["E99"], confidence: "high" },
          ],
        }),
        live: true,
      };
    });
    const r = await runMarketResearch(analysis, "https://ledgerline.app/", { fetchPage, fetchJson, complete });
    expect(r.method).toBe("model");
    expect(r.opportunities.map((o) => o.title)).toEqual(["Reply to Erin's switch from FreshBooks"]);
    expect(r.opportunities[0].evidence[0].url).toBe("https://news.ycombinator.com/item?id=c1");
  });

  it("asks for proof when the site states none", () => {
    const o = ruleOpportunities(analysis, "https://ledgerline.app/", [], [], []);
    expect(o.map((x) => x.kind)).toContain("proof");
  });
});

describe("opportunity prose", () => {
  it("drops evidence ids the chips already show", async () => {
    const { stripRefs } = await import("@/lib/research/market");
    expect(stripRefs("Several posts compare alternatives [E7]-[E13], and one user says so [E14].")).toBe("Several posts compare alternatives, and one user says so.");
    expect(stripRefs("Lead with proof ([E2], [E3]) first")).toBe("Lead with proof first");
    expect(stripRefs("people searching for alternatives [E7-E13], and more")).toBe("people searching for alternatives, and more");
  });
});

describe("competitor pricing", () => {
  it("reads the competitor's /pricing page when the home page states no price", async () => {
    const { readCompetitor, pricingLink } = await import("@/lib/research/competitors");
    const home = `<title>Calendly</title><h1>Scheduling made simple</h1><a href="/pricing">Pricing</a><a href="https://other.example/pricing">x</a>`;
    expect(pricingLink(home, "https://calendly.com/")).toBe("https://calendly.com/pricing");
    const pages: Record<string, string> = {
      "https://calendly.com/": home,
      "https://calendly.com/pricing": `<h2>Standard</h2><p>Standard is $10 per seat per month.</p>`,
    };
    const c = await readCompetitor({ name: "Calendly", domain: "calendly.com", source: "suggested" }, async (u) => page(pages[u] ?? "", pages[u] ? 200 : 404));
    expect(c.pricing).toBe("Standard is $10 per seat per month.");
  });
});
