import { describe, it, expect, vi } from "vitest";
import { parseBlueskyPosts, parseRedditListing, parseYoutubeVideos, toHashtag, type HttpFetch } from "@/lib/research/trends/providers";
import { googleTrendsLink, hashtagsFor, researchLinks } from "@/lib/research/trends/links";
import { changePct, findArticle } from "@/lib/research/trends/interest";
import { runTrendRadar, ruleIdeas, type RadarInput } from "@/lib/research/trends/radar";

const input: RadarInput = {
  productName: "Ledgerline",
  description: "Invoicing that works offline.",
  audience: "freelance designers",
  pain: "Chasing late invoices every month.",
  terms: ["invoice reminders", "freelance invoicing"],
  competitors: ["FreshBooks"],
  developer: false,
};

const ok = (json: unknown) => ({ status: 200, json });

describe("platform parsers", () => {
  it("YouTube: most viewed first, with channel, stats and thumbnail", () => {
    const items = parseYoutubeVideos(
      {
        items: [
          { id: "a", snippet: { title: "Invoice reminders that work", channelTitle: "Freelance Lab", publishedAt: "2026-09-01T00:00:00Z", thumbnails: { medium: { url: "https://i.ytimg.com/a.jpg" } } }, statistics: { viewCount: "1200", likeCount: "80", commentCount: "12" } },
          { id: "b", snippet: { title: "FreshBooks vs Wave", channelTitle: "SaaS Picks" }, statistics: { viewCount: "54000" } },
        ],
      },
      "invoice reminders",
    );
    expect(items.map((i) => i.id)).toEqual(["yt:b", "yt:a"]);
    expect(items[1]).toMatchObject({ url: "https://www.youtube.com/watch?v=a", views: 1200, likes: 80, comments: 12, author: "Freelance Lab", thumbnail: "https://i.ytimg.com/a.jpg" });
  });

  it("Reddit: links to the thread, names the subreddit, skips NSFW", () => {
    const items = parseRedditListing(
      { data: { children: [{ data: { id: "x1", title: "How do you chase late invoices?", permalink: "/r/freelance/comments/x1/how/", subreddit_name_prefixed: "r/freelance", score: 310, num_comments: 140, created_utc: 1790000000 } }, { data: { id: "x2", title: "nsfw", permalink: "/r/x/", over_18: true } }] } },
      "late invoices",
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ url: "https://www.reddit.com/r/freelance/comments/x1/how/", author: "r/freelance", score: 310, comments: 140 });
  });

  it("Bluesky: builds the post URL from the handle and record key", () => {
    const items = parseBlueskyPosts({ posts: [{ uri: "at://did:plc:abc/app.bsky.feed.post/3kxyz", author: { handle: "ana.bsky.social" }, record: { text: "Invoice reminders saved my month", createdAt: "2026-10-01" }, likeCount: 40 }] }, "invoice reminders");
    expect(items[0]).toMatchObject({ url: "https://bsky.app/profile/ana.bsky.social/post/3kxyz", author: "@ana.bsky.social", likes: 40 });
  });

  it("hashtags are lower case with spaces removed", () => {
    expect(toHashtag("Invoice Reminders!")).toBe("invoicereminders");
    expect(hashtagsFor(["invoice reminders", "freelance invoicing"], "Ledgerline")).toEqual(["#invoicereminders", "#freelanceinvoicing", "#ledgerline"]);
  });
});

describe("research links for platforms Banyan does not read", () => {
  it("open the platform's own search, hashtag pages, trend charts and ad libraries", () => {
    const tiktok = researchLinks("tiktok", ["invoice reminders"], ["FreshBooks"]).map((l) => l.url);
    expect(tiktok).toContain("https://www.tiktok.com/search?q=invoice%20reminders");
    expect(tiktok).toContain("https://www.tiktok.com/tag/invoicereminders");
    expect(tiktok.some((u) => u.includes("creativecenter"))).toBe(true);
    const fb = researchLinks("facebook", ["invoice reminders"], ["FreshBooks"]).map((l) => l.url);
    expect(fb.some((u) => u.startsWith("https://www.facebook.com/ads/library/") && u.includes("q=FreshBooks"))).toBe(true);
    expect(googleTrendsLink(["FreshBooks", "invoice reminders"])?.url).toBe("https://trends.google.com/trends/explore?date=today%2012-m&q=FreshBooks,invoice%20reminders");
  });
});

describe("interest from Wikipedia page views", () => {
  it("only accepts an exact title match", async () => {
    const http: HttpFetch = async () => ok(["Calendy", ["Calendar", "Calendly"], [], []]);
    expect(await findArticle("Calendly", http)).toBe("Calendly");
    expect(await findArticle("Ledgerline", async () => ok(["Ledgerline", ["Ledger"], [], []]))).toBeNull();
  });

  it("compares the last three months with the three before", () => {
    expect(changePct([1, 1, 1, 2, 2, 2].map((views) => ({ views })))).toBe(100);
    expect(changePct([{ views: 5 }])).toBeNull();
  });
});

describe("the radar", () => {
  const http = vi.fn<HttpFetch>(async (url) => {
    if (url.includes("hn.algolia.com")) {
      return ok({ hits: [{ objectID: "1", title: "Ask HN: How do you handle invoice reminders?", author: "q", points: 120, num_comments: 80, created_at: "2026-09-01" }, { objectID: "2", title: "Unrelated launch", points: 500 }] });
    }
    if (url.includes("googleapis.com/youtube/v3/search")) return ok({ items: [{ id: { videoId: "v1" } }] });
    if (url.includes("googleapis.com/youtube/v3/videos")) return ok({ items: [{ id: "v1", snippet: { title: "Freelance invoicing: the full guide", channelTitle: "Lab" }, statistics: { viewCount: "9000" } }] });
    if (url.includes("opensearch")) return ok(["x", ["FreshBooks"], [], []]);
    if (url.includes("pageviews")) return ok({ items: [1, 2, 3, 4, 5, 6].map((i) => ({ timestamp: `2026${String(i).padStart(2, "0")}0100`, views: i * 100 })) });
    return { status: 404, json: null };
  });

  it("reads what it may, says why the rest isn't live, and never scrapes", async () => {
    const r = await runTrendRadar(input, { http, keys: {} });
    const status = Object.fromEntries(r.platforms.map((p) => [p.platform, p.status]));
    expect(status).toMatchObject({ youtube: "needs_key", reddit: "needs_key", bluesky: "needs_key", tiktok: "no_api", instagram: "no_api", facebook: "no_api", linkedin: "no_api", x: "no_api", pinterest: "no_api", hacker_news: "live" });
    expect(status.dev).toBeUndefined(); // not a developer product
    const hn = r.platforms.find((p) => p.platform === "hacker_news")!;
    expect(hn.items.map((i) => i.title)).toEqual(["Ask HN: How do you handle invoice reminders?"]); // the unrelated launch is dropped
    expect(http.mock.calls.some(([u]) => /tiktok|instagram|facebook|linkedin|x\.com|pinterest/.test(u))).toBe(false);
    for (const p of r.platforms) expect(p.links.length).toBeGreaterThan(0);
  });

  it("reads YouTube when a key is set, and measures interest", async () => {
    const r = await runTrendRadar(input, { http, keys: { youtube: "k" } });
    const yt = r.platforms.find((p) => p.platform === "youtube")!;
    expect(yt.status).toBe("live");
    expect(yt.items[0]).toMatchObject({ title: "Freelance invoicing: the full guide", views: 9000 });
    expect(r.interest[0]).toMatchObject({ article: "FreshBooks", change: 150 });
  });

  it("reports a failing platform instead of hiding it", async () => {
    const r = await runTrendRadar(input, { http: async (u) => (u.includes("youtube") ? { status: 403, json: { error: { errors: [{ reason: "quotaExceeded" }] } } } : http(u)), keys: { youtube: "k" } });
    expect(r.platforms.find((p) => p.platform === "youtube")).toMatchObject({ status: "failed", note: "YouTube's daily quota for this key is used up." });
  });

  it("without a model, gives one native idea per platform, built on the top post when there is one", () => {
    const ideas = ruleIdeas(input, [
      { platform: "tiktok", status: "no_api", note: "", items: [], links: [], hashtags: [] },
      { platform: "hacker_news", status: "live", note: "", items: [{ id: "hn:1", platform: "hacker_news", title: "Ask HN: invoice reminders?", url: "https://news.ycombinator.com/item?id=1", author: "", publishedAt: "", query: "invoice reminders" }], links: [], hashtags: [] },
    ]);
    expect(ideas[0]).toMatchObject({ platform: "tiktok", format: "Short video (30–45 s)", basis: [{ label: "Suggestion: nothing found on this platform to build on" }] });
    expect(ideas[1].basis[0].url).toBe("https://news.ycombinator.com/item?id=1");
  });

  it("with a model, keeps only ideas for listed platforms and drops citations from other platforms", async () => {
    const complete = vi.fn(async ({ user }: { user: string }) => {
      const hnId = user.match(/\[(T\d+)\] Hacker News/)?.[1];
      return {
        live: true,
        text: JSON.stringify({
          ideas: [
            { platform: "tiktok", format: "Short video", hook: "POV: invoices chase themselves", angle: "Before and after in 20 seconds.", basis_ids: [hnId] },
            { platform: "hacker_news", format: "Comment", hook: "We hit this too", angle: "Answer the Ask HN thread with what worked.", basis_ids: [hnId] },
            { platform: "myspace", format: "Post", hook: "Hello", angle: "Not a listed platform.", basis_ids: [] },
          ],
          hashtags: { tiktok: ["#InvoiceTips", "freelancelife"] },
        }),
      };
    });
    const r = await runTrendRadar(input, { http, keys: {}, complete });
    expect(r.method).toBe("model");
    expect(r.ideas.map((i) => i.platform)).toEqual(["tiktok", "hacker_news"]);
    expect(r.ideas[0].basis[0].label).toMatch(/^Suggestion/); // an HN post can't be the basis of a TikTok idea
    expect(r.ideas[1].basis[0].url).toBe("https://news.ycombinator.com/item?id=1");
    expect(r.platforms.find((p) => p.platform === "tiktok")!.hashtags.slice(0, 2)).toEqual(["#invoicetips", "#freelancelife"]);
  });
});

describe("interest safeguards", () => {
  it("drops a last month that is still being counted, and ignores tiny articles", async () => {
    const { dropIncompleteTail, interestFor } = await import("@/lib/research/trends/interest");
    const months = [3000, 3100, 2900, 3050, 81].map((views, i) => ({ month: `2026-0${i + 1}`, views }));
    expect(dropIncompleteTail(months).map((m) => m.views)).toEqual([3000, 3100, 2900, 3050]);
    const tiny = async (url: string) =>
      url.includes("opensearch")
        ? { status: 200, json: ["x", ["Meeting scheduling"], [], []] }
        : { status: 200, json: { items: [1, 2, 1, 0, 4, 1].map((v, i) => ({ timestamp: `20260${i + 1}0100`, views: v })) } };
    expect(await interestFor("meeting scheduling", tiny)).toBeNull();
  });
});
