import { prisma } from "@/lib/db";
import { safeFetch } from "@/lib/net/safe-fetch";
import { recordSchemaResult, routeComplete, type ModelPurpose } from "@/lib/model/router";
import { analysisSchema, type Completer } from "@/lib/product/analyze";
import { runMarketResearch, type ResearchOverrides } from "./market";
import type { MarketResearch } from "./types";

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
