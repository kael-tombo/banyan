import { prisma } from "@/lib/db";
import { safeFetch } from "@/lib/net/safe-fetch";
import { routeComplete } from "@/lib/model/router";
import { analyzeProduct, validateProductUrl, AnalysisError, type AnalysisErrorCode } from "@/lib/product/analyze";
import { JOB, enqueue, queueConfigured } from "@/lib/queue/jobs";
import { markStage } from "@/lib/onboarding/progress";

/**
 * Database side of product analysis (US-021): create the record, run it on
 * the queue (or inline without Redis), and persist each phase so the UI can
 * show queued → reading → analysing → ready | failed.
 */

const FETCH_OPTS = {
  timeoutMs: 10_000,
  maxBytes: 2_000_000,
  headers: { accept: "text/html,application/xhtml+xml", "user-agent": "BanyanBot/1.0 (product analysis)" },
};

export type StartResult =
  | { ok: true; analysisId: string; status: string }
  | { ok: false; status: number; code: AnalysisErrorCode; message: string };

export async function startAnalysis(workspaceId: string, rawUrl: string): Promise<StartResult> {
  const valid = validateProductUrl(rawUrl);
  // Refused before any request is made (US-021).
  if (!valid.ok) return { ok: false, status: 400, code: valid.code, message: valid.message };

  const analysis = await prisma.productAnalysis.create({ data: { workspaceId, url: valid.url, status: "queued" } });
  if (queueConfigured()) {
    try {
      await enqueue(JOB.productAnalyze, { analysisId: analysis.id }, { jobId: `analysis-${analysis.id}`, attempts: 1, removeOnComplete: { count: 1000 } });
      return { ok: true, analysisId: analysis.id, status: "queued" };
    } catch {
      /* queue down: run inline below rather than leave it queued forever */
    }
  }
  await runAnalysis(analysis.id);
  const done = await prisma.productAnalysis.findUnique({ where: { id: analysis.id }, select: { status: true } });
  return { ok: true, analysisId: analysis.id, status: done?.status ?? "failed" };
}

export async function runAnalysis(analysisId: string): Promise<void> {
  const analysis = await prisma.productAnalysis.findUnique({ where: { id: analysisId } });
  if (!analysis || analysis.status === "ready") return;

  await prisma.productAnalysis.update({ where: { id: analysisId }, data: { status: "reading", errorCode: null, errorMessage: null } });

  const attempt = () =>
    analyzeProduct(analysis.url, {
      fetch: (url) => safeFetch(url, FETCH_OPTS),
      complete: async ({ system, user }) => {
        const res = await routeComplete({ workspaceId: analysis.workspaceId, purpose: "product_analysis", system, user, maxTokens: 1_200, temperature: 0.2 });
        return { text: res.text, live: res.usage.provider !== "template-fallback" && !res.quotaDeferred };
      },
      onPhase: async () => {
        await prisma.productAnalysis.update({ where: { id: analysisId }, data: { status: "analysing" } });
      },
    });

  try {
    let outcome;
    try {
      outcome = await attempt();
    } catch (err) {
      // One retry for transient failures (timeout, outage).
      if (err instanceof AnalysisError && err.retryable) {
        await new Promise((r) => setTimeout(r, 2_000));
        outcome = await attempt();
      } else {
        throw err;
      }
    }
    await prisma.productAnalysis.update({
      where: { id: analysisId },
      data: {
        status: "ready",
        pages: JSON.stringify(outcome.pages),
        result: JSON.stringify(outcome.result),
        method: outcome.method,
        flags: JSON.stringify(outcome.flags),
        promptVersion: outcome.promptVersion,
      },
    });
    await markStage(analysis.workspaceId, "product_url", "done");
  } catch (err) {
    const e = err instanceof AnalysisError ? err : new AnalysisError("unreachable", "The analysis could not finish. Try again, or describe your product yourself.", true);
    await prisma.productAnalysis.update({ where: { id: analysisId }, data: { status: "failed", errorCode: e.code, errorMessage: e.message } });
  }
}

export async function getAnalysis(workspaceId: string, analysisId: string) {
  const a = await prisma.productAnalysis.findFirst({ where: { id: analysisId, workspaceId } });
  if (!a) return null;
  return {
    id: a.id,
    url: a.url,
    status: a.status,
    method: a.method,
    error: a.errorCode ? { code: a.errorCode, message: a.errorMessage } : null,
    pages: JSON.parse(a.pages) as string[],
    result: a.result ? JSON.parse(a.result) : null,
    flags: JSON.parse(a.flags) as { label: string; excerpt: string; page: string }[],
    promptVersion: a.promptVersion,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}
