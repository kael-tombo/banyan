import { prisma } from "@/lib/db";
import { safeFetch } from "@/lib/net/safe-fetch";
import { recordSchemaResult, routeComplete, type ModelPurpose } from "@/lib/model/router";
import { analysisSchema, type Completer } from "@/lib/product/analyze";
import { runMarketResearch, type ResearchOverrides } from "./market";
import type { MarketResearch } from "./types";
import { env } from "@/lib/env";
import { runTrendRadar } from "./trends/radar";
import type { HttpFetch } from "./trends/providers";
import type { TrendsReport } from "./trends/types";

/**
 * Database side of the onboarding market scan: runs against a finished
 * product analysis in the same workspace and keeps the result on it.
 * Runs inline (it needs ~10–45 s); the route allows 60.
 */

const PAGE_OPTS = {
  timeoutMs: 10_000,
  maxBytes: 1_500_000,
  headers: { accept: "text/html,application/xhtml+xml", "user-agent": "BanyanBot/1.0 (competitor read)" },
};
const JSON_OPTS = {
  timeoutMs: 8_000,
  maxBytes: 1_000_000,
  headers: { accept: "application/json", "user-agent": "BanyanBot/1.0 (market research)" },
};

export type ResearchStart =
  | { ok: true; research: MarketResearch }
  | { ok: false; status: number; message: string };

export async function runResearch(workspaceId: string, analysisId: string, overrides: ResearchOverrides = {}): Promise<ResearchStart> {
  const analysis = await prisma.productAnalysis.findFirst({ where: { id: analysisId, workspaceId } });
  if (!analysis) return { ok: false, status: 404, message: "Analysis not found." };
  if (analysis.status !== "ready" || !analysis.result) return { ok: false, status: 409, message: "Read the site first." };
  if (analysis.researchStatus === "running" && Date.now() - analysis.updatedAt.getTime() < 90_000) {
    return { ok: false, status: 409, message: "The market scan is already running." };
  }
  const parsed = analysisSchema.safeParse(JSON.parse(analysis.result));
  if (!parsed.success) return { ok: false, status: 409, message: "This analysis can't be scanned. Read the site again." };

  await prisma.productAnalysis.update({ where: { id: analysisId }, data: { researchStatus: "running" } });

  const pages = JSON.parse(analysis.pages) as string[];
  const ownUrl = pages[0] ?? analysis.url;
  // Competitor suggestions are research; opportunities are recommendations (ledger purposes).
  const complete: Completer = async ({ system, user, maxTokens, temperature, prompt, attempt }) => {
    const purpose: ModelPurpose = prompt.name === "market-opportunities" ? "recommendation" : "research";
    const res = await routeComplete({ workspaceId, purpose, system, user, maxTokens, temperature, prompt, attempt });
    return {
      text: res.text,
      live: res.usage.provider !== "template-fallback" && !res.quotaDeferred,
      report: (valid) => recordSchemaResult(res.modelCallId, valid),
    };
  };

  try {
    const research = await runMarketResearch(
      parsed.data,
      ownUrl,
      {
        fetchPage: (url) => safeFetch(url, PAGE_OPTS),
        fetchJson: async (url) => JSON.parse((await safeFetch(url, JSON_OPTS)).text) as unknown,
        complete,
      },
      overrides,
    );
    await prisma.productAnalysis.update({ where: { id: analysisId }, data: { research: JSON.stringify(research), researchStatus: "ready" } });
    return { ok: true, research };
  } catch {
    await prisma.productAnalysis.update({ where: { id: analysisId }, data: { researchStatus: "failed" } });
    return { ok: false, status: 502, message: "The market scan could not finish. Try again in a minute." };
  }
}

/** The last site read behind a saved profile, and its market scan if one finished. */
export async function savedScan(workspaceId: string, analysisId: string | null | undefined): Promise<{ analysisId: string | null; research: MarketResearch | null }> {
  if (!analysisId) return { analysisId: null, research: null };
  const a = await prisma.productAnalysis.findFirst({
    where: { id: analysisId, workspaceId, status: "ready" },
    select: { id: true, research: true, researchStatus: true },
  });
  if (!a) return { analysisId: null, research: null };
  try {
    return { analysisId: a.id, research: a.researchStatus === "ready" && a.research ? (JSON.parse(a.research) as MarketResearch) : null };
  } catch {
    return { analysisId: a.id, research: null };
  }
}

/**
 * The trend radar for an analysis whose market scan has finished: search
 * terms and competitors come from the scan, and the result is kept on it.
 */
export async function runTrends(workspaceId: string, analysisId: string): Promise<{ ok: true; trends: TrendsReport } | { ok: false; status: number; message: string }> {
  const analysis = await prisma.productAnalysis.findFirst({ where: { id: analysisId, workspaceId } });
  if (!analysis) return { ok: false, status: 404, message: "Analysis not found." };
  if (analysis.researchStatus !== "ready" || !analysis.research || !analysis.result) {
    return { ok: false, status: 409, message: "Scan the market first." };
  }
  const parsed = analysisSchema.safeParse(JSON.parse(analysis.result));
  if (!parsed.success) return { ok: false, status: 409, message: "Read the site again first." };
  const research = JSON.parse(analysis.research) as MarketResearch;
  const a = parsed.data;

  const complete: Completer = async ({ system, user, maxTokens, temperature, prompt, attempt }) => {
    const res = await routeComplete({ workspaceId, purpose: "recommendation", system, user, maxTokens, temperature, prompt, attempt });
    return { text: res.text, live: res.usage.provider !== "template-fallback" && !res.quotaDeferred, report: (valid) => recordSchemaResult(res.modelCallId, valid) };
  };
  const http: HttpFetch = async (url, init) => {
    const res = await safeFetch(url, { method: init?.method ?? "GET", headers: { accept: "application/json", "user-agent": "BanyanBot/1.0 (trend radar)", ...init?.headers }, body: init?.body, timeoutMs: 9_000, maxBytes: 1_500_000 });
    let json: unknown = null;
    try {
      json = JSON.parse(res.text);
    } catch {
      json = null;
    }
    return { status: res.status, json };
  };

  try {
    const trends = await runTrendRadar(
      {
        productName: a.product_name,
        description: a.description || a.value_proposition,
        audience: a.target_audience.join("; "),
        pain: a.audience_pain,
        terms: research.queries,
        competitors: research.competitors.filter((c) => c.verified || c.source !== "suggested").map((c) => c.name),
        developer: /\b(developers?|engineers?|api|sdk|open[- ]source)\b/i.test([a.category, a.description, a.target_audience.join(" ")].join(" ")),
      },
      {
        http,
        keys: {
          youtube: env.YOUTUBE_API_KEY,
          redditId: env.REDDIT_CLIENT_ID,
          redditSecret: env.REDDIT_CLIENT_SECRET,
          blueskyHandle: env.BLUESKY_HANDLE,
          blueskyPassword: env.BLUESKY_APP_PASSWORD,
        },
        complete,
      },
    );
    await prisma.productAnalysis.update({ where: { id: analysisId }, data: { research: JSON.stringify({ ...research, trends }) } });
    return { ok: true, trends };
  } catch {
    return { ok: false, status: 502, message: "The trend radar could not finish. Try again in a minute." };
  }
}
