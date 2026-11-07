import { describe, it, expect, vi } from "vitest";
import { extractSiteSignals, mergeSignals, signalsDigest } from "@/lib/product/site-signals";
import { analyzeProduct, alternateHost, pickExtraPages, type Fetcher } from "@/lib/product/analyze";
import { intakeFromAnalysis, suggestCycle, missingRequired, coverage } from "@/lib/product/intake-profile";
import { SafeFetchError } from "@/lib/net/safe-fetch";

const HOME = `<!doctype html><html lang="en"><head>
<title>Ledgerline — invoicing for freelancers</title>
<meta name="description" content="Send invoices from anywhere, even offline.">
<meta property="og:image" content="/og.png">
<meta name="theme-color" content="#1e4d3a">
<link rel="apple-touch-icon" href="/icon-180.png">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
  {"@type":"Organization","name":"Ledgerline Inc","sameAs":["https://x.com/ledgerline","https://www.linkedin.com/company/ledgerline"]},
  {"@type":"SoftwareApplication","name":"Ledgerline","applicationCategory":"BusinessApplication",
   "offers":[{"@type":"Offer","name":"Free","price":"0"},{"@type":"Offer","name":"Pro","price":"9","priceCurrency":"USD"}],
   "aggregateRating":{"@type":"AggregateRating","ratingValue":"4.8","bestRating":"5","ratingCount":"212"}}
]}</script>
</head><body>
<nav><a href="/pricing">Pricing</a><a href="/login">Log in</a></nav>
<div class="cookie-banner"><p>We use cookies to improve your experience on this site, accept them all.</p></div>
<h1>Get paid without chasing clients</h1>
<p>Ledgerline sends invoices and polite reminders for you. Built for freelance designers and developers who work on the move.</p>
<a class="btn btn-primary" href="/signup">Start free trial</a>
<a href="/about">About us</a>
<h2>Tired of chasing late invoices every month?</h2>
<h2>Offline invoicing</h2>
<p>Trusted by 3,000 freelancers in 40 countries.</p>
<blockquote>I got paid two weeks faster in my first month.</blockquote>
<footer><a href="https://github.com/ledgerline">GitHub</a> © 2026 All rights reserved.</footer>
</body></html>`;

describe("extractSiteSignals", () => {
  const s = extractSiteSignals(HOME, "https://ledgerline.app/");

  it("reads identity from meta tags and structured data", () => {
    expect(s.headline).toBe("Get paid without chasing clients");
    expect(s.lead).toMatch(/^Ledgerline sends invoices/);
    expect(s.metaDescription).toBe("Send invoices from anywhere, even offline.");
    expect(s.category).toBe("BusinessApplication");
    expect(s.siteName).toBe("Ledgerline");
    expect(s.image).toBe("https://ledgerline.app/og.png");
    expect(s.logo).toBe("https://ledgerline.app/icon-180.png");
    expect(s.themeColor).toBe("#1e4d3a");
    expect(s.language).toBe("en");
  });

  it("finds the call to action, prices, proof, audience and pain as the page states them", () => {
    expect(s.ctas).toEqual(["Start free trial"]);
    expect(s.prices).toEqual(expect.arrayContaining(["Free: free", "Pro: 9 USD"]));
    expect(s.proof).toEqual(expect.arrayContaining(["Trusted by 3,000 freelancers in 40 countries.", "Rated 4.8/5 from 212 reviews", "“I got paid two weeks faster in my first month.”"]));
    expect(s.audiencePhrases[0]).toBe("freelance designers and developers who work on the move");
    expect(s.painPhrases).toContain("Tired of chasing late invoices every month?");
    expect(s.stageHint).toBe("growth");
  });

  it("collects social profiles from structured data and links, one per network", () => {
    expect(s.socials.map((x) => x.network).sort()).toEqual(["github", "linkedin", "x"]);
  });

  it("keeps cookie banners out of the lead", () => {
    expect(s.lead).not.toMatch(/cookies/);
  });

  it("reads a waitlist page as not launched yet", () => {
    const w = extractSiteSignals(`<html><body><h1>Coming soon</h1><p>A calmer inbox for support teams who drown in tickets.</p><button>Join the waitlist</button></body></html>`, "https://calm.example/");
    expect(w.stageHint).toBe("building");
    expect(w.ctas).toEqual(["Join the waitlist"]);
  });

  it("uses the first paragraph when a page has no headline or meta description", async () => {
    const bare = `<!doctype html><html><head><title>Example Domain</title></head><body><p>This domain is for use in documentation examples without needing permission.</p></body></html>`;
    const fetch: Fetcher = async () => ({ status: 200, headers: new Headers({ "content-type": "text/html" }), text: bare, truncated: false });
    const out = await analyzeProduct("example.com", { fetch });
    expect(out.result.description).toBe("This domain is for use in documentation examples without needing permission.");
  });

  it("survives malformed structured data", () => {
    expect(() => extractSiteSignals(`<script type="application/ld+json">{not json</script><h1>Hi</h1>`, "https://x.example/")).not.toThrow();
  });

  it("merges pages with the home page first and renders a digest for the model", () => {
    const m = mergeSignals([s, extractSiteSignals(`<h2>Team plan</h2><p>Team is $29 per month for five seats.</p>`, "https://ledgerline.app/pricing")]);
    expect(m.headline).toBe(s.headline);
    expect(m.prices).toContain("Team is $29 per month for five seats.");
    expect(signalsDigest(m)).toMatch(/Calls to action: Start free trial/);
  });
});

describe("page discovery and host fallback", () => {
  it("prefers one page of each kind, treating www and the bare domain as one site", () => {
    const html = `<a href="/pricing">p</a><a href="/pricing/teams">pt</a><a href="https://www.ledgerline.app/about">a</a><a href="/customers">c</a><a href="/features">f</a><a href="/faq">q</a><a href="/blog">b</a>`;
    expect(pickExtraPages(html, "https://ledgerline.app/")).toEqual([
      "https://ledgerline.app/pricing",
      "https://www.ledgerline.app/about",
      "https://ledgerline.app/features",
      "https://ledgerline.app/customers",
    ]);
  });

  it("swaps www and the bare domain, never for IP addresses", () => {
    expect(alternateHost("https://fansos.com/")).toBe("https://www.fansos.com/");
    expect(alternateHost("https://www.fansos.com/")).toBe("https://fansos.com/");
    expect(alternateHost("http://93.184.216.34/")).toBeNull();
  });

  it("reads the www site when the bare domain does not resolve", async () => {
    const fetch: Fetcher = vi.fn(async (url: string) => {
      if (url !== "https://www.ledgerline.app/") throw new SafeFetchError("Blocked: host could not be resolved.");
      return { status: 200, headers: new Headers({ "content-type": "text/html" }), text: HOME, truncated: false };
    });
    const out = await analyzeProduct("ledgerline.app", { fetch });
    expect(out.pages[0]).toBe("https://www.ledgerline.app/");
    expect(out.result.primary_cta).toBe("Start free trial");
  });

  it("reads a JavaScript-only page from its meta tags instead of failing", async () => {
    const spa = `<html><head><title>Calm — support inbox</title><meta name="description" content="A calmer inbox for support teams."></head><body><div id="root"></div></body></html>`;
    const fetch: Fetcher = async () => ({ status: 200, headers: new Headers({ "content-type": "text/html" }), text: spa, truncated: false });
    const out = await analyzeProduct("calm.example", { fetch });
    expect(out.result.description).toBe("A calmer inbox for support teams.");
  });
});

describe("onboarding review from an analysis", () => {
  it("fills the form, labels every field with its page, and suggests a goal from the button", async () => {
    const fetch: Fetcher = async (url) => {
      if (url === "https://ledgerline.app/") return { status: 200, headers: new Headers({ "content-type": "text/html" }), text: HOME, truncated: false };
      throw new SafeFetchError("Request could not be completed.");
    };
    const out = await analyzeProduct("ledgerline.app", { fetch });
    const p = intakeFromAnalysis(out.result, { url: "https://ledgerline.app/", method: out.method, pages: out.pages });
    expect(p.name).toBe("Ledgerline");
    expect(p.primaryCta).toBe("Start free trial");
    expect(p.proof.length).toBeGreaterThan(0);
    expect(p.sources.audience).toBe("https://ledgerline.app/");
    expect(p.sources.stage).toBe("inferred");
    expect(p.site?.socials.length).toBe(3);
    // The rule-based read cannot state the problem; the founder is asked for it.
    expect(missingRequired(p).map((f) => f.key)).toEqual(["problem"]);
    expect(coverage(p).read).toBeGreaterThan(5);
    expect(suggestCycle(p)).toMatchObject({ metric: "trial signups", target: 20 });
  });

  it("suggests demos, waitlists and installs from the matching buttons", () => {
    expect(suggestCycle({ primaryCta: "Book a demo", stage: "launched" }).metric).toBe("demo bookings");
    expect(suggestCycle({ primaryCta: "", stage: "building" }).metric).toBe("waitlist signups");
    expect(suggestCycle({ primaryCta: "Download for Mac", stage: "launched" }).metric).toBe("installs");
    expect(suggestCycle({ primaryCta: "", stage: "launched" }).metric).toBe("signups");
  });
});
