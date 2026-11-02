/**
 * Draft-quality eval against the configured live model (blocker 03, steps 3–5).
 *
 *   npm run eval:drafts                 # 10 products × 3 formats
 *   npm run eval:drafts -- --judge      # also ask the model to rate each draft
 *   npm run eval:drafts -- --only ledgerline,stackwatch
 *
 * Writes tests/evals/reports/<date>-<model>.md with every draft, its automatic
 * checks, tokens, latency and reported cost, so a human can make the final
 * "approvable with light edits" call. Exits non-zero only when the run itself
 * fails (no live model), never because a draft scored badly.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getAIProvider, extractJSON, type AIProvider, type GenResult } from "@/lib/ai/provider";
import { generateContent } from "@/lib/ai/generate";
import type { Channel } from "@/lib/formats";
import { EVAL_PRODUCTS, type EvalProduct } from "../tests/evals/products";
import { DISTINCT_HOOK_MAX_OVERLAP, hookOverlap, scoreDraft, type DraftResult, type DraftScore } from "../tests/evals/score";

const FORMATS: { channel: Channel; format: string; label: string }[] = [
  { channel: "x", format: "thread", label: "X thread" },
  { channel: "linkedin", format: "problem_solution", label: "LinkedIn post" },
  { channel: "shortvideo", format: "hook_script", label: "Short video script" },
];

type Call = { tokensIn: number; tokensOut: number; costUsd: number; ms: number };
type Judged = { score: number; edits: string } | null;
type Row = { product: EvalProduct; label: string; draft: DraftResult; score: DraftScore; call: Call; judge: Judged; error?: string };

const args = process.argv.slice(2);
const wantJudge = args.includes("--judge");
const onlyArg = args.find((a) => a.startsWith("--only"));
const only = onlyArg ? (onlyArg.includes("=") ? onlyArg.split("=")[1] : args[args.indexOf(onlyArg) + 1]).split(",") : null;

/** Wraps the provider so each draft's tokens, latency and cost are captured. */
function metered(base: AIProvider, sink: Call): AIProvider {
  return {
    name: base.name,
    async complete(req) {
      const t = Date.now();
      const out: GenResult = await base.complete(req);
      sink.ms += Date.now() - t;
      sink.tokensIn += out.usage.promptTokens ?? 0;
      sink.tokensOut += out.usage.completionTokens ?? 0;
      sink.costUsd += out.usage.reportedCostUsd ?? 0;
      return out;
    },
  };
}

const JUDGE_SCHEMA = z.object({ score: z.number().min(1).max(5), edits: z.string().max(400) });

async function judge(base: AIProvider, p: EvalProduct, label: string, body: string): Promise<Judged> {
  try {
    const out = await base.complete({
      system:
        "You review social drafts for a founder before they approve them. Score 1-5: 5 = post as is, 4 = approve with light edits, 3 = needs a real rewrite of one part, 2 = mostly rewrite, 1 = unusable. Be strict about generic hype, invented facts and anything the founder did not say. Respond with ONLY JSON: {\"score\": number, \"edits\": \"the edits you would make, one sentence\"}.",
      user: [
        `Product name: ${p.profile.name}`,
        `Audience: ${p.profile.audience}; campaign audience: ${p.campaign.targetAudience}`,
        `Product facts: ${p.profile.description} ${p.profile.valueProp}`,
        `Key message: ${p.campaign.keyMessage}; call to action: ${p.campaign.cta}`,
        "An illustrative scene of the audience's problem is fine; a stated fact about customers, results or behaviour that is not in the facts is not.",
        `Allowed evidence: ${p.campaign.evidence}`,
        `Voice: ${p.brandVoice.tone}; avoid: ${p.brandVoice.avoid ?? "nothing listed"}`,
        `Draft (${label}):`,
        body,
      ].join("\n"),
      maxTokens: 400,
      temperature: 0,
    });
    return JUDGE_SCHEMA.parse(extractJSON(out.text));
  } catch {
    return null;
  }
}

async function runProduct(base: AIProvider, p: EvalProduct): Promise<Row[]> {
  const rows: Row[] = [];
  for (const f of FORMATS) {
    const call: Call = { tokensIn: 0, tokensOut: 0, costUsd: 0, ms: 0 };
    try {
      const res = await generateContent({
        channel: f.channel,
        format: f.format,
        profile: p.profile,
        campaign: p.campaign,
        brandVoice: p.brandVoice,
        provider: metered(base, call),
      });
      const draft: DraftResult = { channel: f.channel, format: f.format, body: res.body, isFallback: res.isFallback, label: res.label };
      const j = wantJudge && !res.isFallback ? await judge(base, p, f.label, res.body) : null;
      rows.push({ product: p, label: f.label, draft, score: scoreDraft(p, draft), call, judge: j });
    } catch (err) {
      const draft: DraftResult = { channel: f.channel, format: f.format, body: "", isFallback: true, label: "error" };
      rows.push({ product: p, label: f.label, draft, score: scoreDraft(p, draft), call, judge: null, error: (err as Error).message });
    }
  }
  return rows;
}

function pct(n: number, d: number): string {
  return d ? `${Math.round((100 * n) / d)}%` : "n/a";
}

function report(model: string, rows: Row[], perProductHook: Map<string, number>): string {
  const total = rows.length;
  const live = rows.filter((r) => r.score.live).length;
  const clean = rows.filter((r) => r.score.problems.length === 0).length;
  const invented = rows.filter((r) => r.score.inventedClaims.length > 0).length;
  const products = [...perProductHook.keys()];
  const distinct = [...perProductHook.values()].filter((o) => o <= DISTINCT_HOOK_MAX_OVERLAP).length;
  const judged = rows.filter((r) => r.judge);
  const approvable = judged.filter((r) => (r.judge?.score ?? 0) >= 4).length;
  const productsPassing = products.filter((id) => rows.filter((r) => r.product.id === id).every((r) => r.score.problems.length === 0)).length;
  const sum = (k: keyof Call) => rows.reduce((a, r) => a + r.call[k], 0);
  const costPerProduct = sum("costUsd") / Math.max(1, products.length);

  const out: string[] = [];
  out.push(`# Draft eval — ${model} — ${new Date().toISOString().slice(0, 10)}`, "");
  out.push("Generated by `npm run eval:drafts`" + (wantJudge ? " -- --judge" : "") + ". Acceptance lines are from `docs/mvp-blockers/03-no-live-model-provider.md`.", "");
  out.push("| Check | Result | Target |", "| --- | --- | --- |");
  out.push(`| Drafts from the live model | ${live}/${total} (${pct(live, total)}) | all |`);
  out.push(`| Drafts with no automatic problem | ${clean}/${total} (${pct(clean, total)}) | — |`);
  out.push(`| Products where all three drafts pass | ${productsPassing}/${products.length} | ≥ 8/10 |`);
  out.push(`| Drafts with a claim not in the evidence | ${invented} | 0 |`);
  out.push(`| X thread and LinkedIn open differently | ${distinct}/${products.length} | all |`);
  out.push(`| Model judge: approvable with light edits (≥4/5) | ${wantJudge ? `${approvable}/${judged.length} (${pct(approvable, judged.length)})` : "not run (use --judge)"} | ≥ 80% |`);
  out.push(`| Tokens per product (in / out) | ${Math.round(sum("tokensIn") / products.length)} / ${Math.round(sum("tokensOut") / products.length)} | — |`);
  out.push(`| Reported list cost per product (3 drafts) | ${costPerProduct ? `$${costPerProduct.toFixed(5)}` : "not reported by this provider"} | — |`);
  out.push(`| Average latency per draft | ${(sum("ms") / total / 1000).toFixed(1)} s | — |`, "");
  out.push("The judge is the same model that wrote the drafts, so treat its score as a hint. The human read below is the real test.", "");

  for (const id of products) {
    const pr = rows.filter((r) => r.product.id === id);
    const p = pr[0].product;
    out.push(`## ${p.profile.name}`, "", `${p.profile.description}  `, `Evidence allowed: ${p.campaign.evidence}  `, `Hook overlap, X vs LinkedIn: ${perProductHook.get(id)!.toFixed(2)}`, "");
    for (const r of pr) {
      const verdict = r.error ? `error: ${r.error}` : r.score.problems.length ? r.score.problems.join("; ") : "no automatic problems";
      out.push(`### ${r.label}`, "");
      out.push(`- Checks: ${verdict}`);
      if (r.judge) out.push(`- Judge: ${r.judge.score}/5 — ${r.judge.edits}`);
      out.push(`- ${r.call.tokensIn} in / ${r.call.tokensOut} out tokens, ${(r.call.ms / 1000).toFixed(1)} s${r.call.costUsd ? `, $${r.call.costUsd.toFixed(5)}` : ""}`, "");
      out.push("```text", r.draft.body.trim() || "(empty)", "```", "");
    }
  }
  return out.join("\n");
}

(async () => {
  const { provider, usage } = getAIProvider();
  if (usage.isFallback) {
    console.error("No live model configured (OPENAI_API_KEY / OPENCODE_URL). The eval measures a live model; nothing to do.");
    process.exit(1);
  }
  const products = EVAL_PRODUCTS.filter((p) => !only || only.includes(p.id));
  console.log(`Evaluating ${products.length} products × ${FORMATS.length} formats on ${usage.model}${wantJudge ? " with judge" : ""}…`);

  const rows: Row[] = [];
  const queue = [...products];
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      const r = await runProduct(provider, p);
      rows.push(...r);
      const bad = r.filter((x) => x.score.problems.length).length;
      console.log(`  ${p.id.padEnd(12)} ${bad ? `${bad} draft(s) with problems` : "all clean"}`);
    }
  });
  await Promise.all(workers);
  rows.sort((a, b) => products.indexOf(a.product) - products.indexOf(b.product) || FORMATS.findIndex((f) => f.label === a.label) - FORMATS.findIndex((f) => f.label === b.label));

  const hook = new Map<string, number>();
  for (const p of products) {
    const x = rows.find((r) => r.product.id === p.id && r.draft.channel === "x")?.draft.body ?? "";
    const li = rows.find((r) => r.product.id === p.id && r.draft.channel === "linkedin")?.draft.body ?? "";
    hook.set(p.id, hookOverlap(x, li));
  }

  const md = report(usage.model, rows, hook);
  const dir = join("tests", "evals", "reports");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${new Date().toISOString().slice(0, 10)}-${usage.model.replace(/[^\w.-]+/g, "_")}.md`);
  writeFileSync(file, md);
  console.log(md.split("\n").slice(0, 16).join("\n"));
  console.log(`\nFull report: ${file}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
