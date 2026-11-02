/**
 * Onboarding eval on the configured live model: product analysis (URL →
 * profile) and strategy (approved profile → plan), the two model steps before
 * drafts. Companion to `npm run eval:drafts`.
 *
 *   npm run eval:onboarding
 *
 * Pages come from tests/evals/pages.ts (no network). Each step runs exactly as
 * the app runs it, including its retry and its fallback, so the report shows
 * how often a founder would get the model's work versus the fallback, and why.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAIProvider, type AIProvider } from "@/lib/ai/provider";
import { analyzeProduct, type Completer } from "@/lib/product/analyze";
import { generateStrategy, type ChannelCapability, type StrategyOutcome } from "@/lib/strategy/generate";
import { profileFacts } from "@/lib/strategy/facts";
import { findClaims } from "@/lib/content/claims";
import type { Channel } from "@/lib/formats";
import { EVAL_PRODUCTS, type EvalProduct } from "../tests/evals/products";
import { aboutPage, INJECTION_PRODUCT, landingPage } from "../tests/evals/pages";

type Meter = { calls: number; tokensIn: number; tokensOut: number; costUsd: number; ms: number; invalid: number };
const meter = (): Meter => ({ calls: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, ms: 0, invalid: 0 });

function completer(base: AIProvider, m: Meter): Completer {
  return async ({ system, user, maxTokens, temperature }) => {
    const t = Date.now();
    const out = await base.complete({ system, user, maxTokens, temperature });
    m.calls++;
    m.ms += Date.now() - t;
    m.tokensIn += out.usage.promptTokens ?? 0;
    m.tokensOut += out.usage.completionTokens ?? 0;
    m.costUsd += out.usage.reportedCostUsd ?? 0;
    return { text: out.text, live: !out.usage.isFallback, report: (ok) => { if (!ok) m.invalid++; } };
  };
}

const CAPABILITIES: ChannelCapability[] = [
  { channel: "linkedin", publishing: "export", scheduling: false },
  { channel: "x", publishing: "export", scheduling: false },
  { channel: "shortvideo", publishing: "manual", scheduling: false },
];
const PREFERRED: Channel[] = ["linkedin", "x"];

type AnalysisRow = { p: EvalProduct; method: string; problems: string[]; summary: string; m: Meter };
type StrategyRow = { p: EvalProduct; out: StrategyOutcome | null; problems: string[]; m: Meter; error?: string };

async function analyse(base: AIProvider, p: EvalProduct): Promise<AnalysisRow> {
  const m = meter();
  const site = `https://${p.id}.example.com/`;
  const pages: Record<string, string> = { [site]: landingPage(p), [`${site}about`]: aboutPage(p) };
  const outcome = await analyzeProduct(site, {
    fetch: async (url) => {
      const html = pages[url.replace(/\/$/, "/")] ?? pages[url];
      return html
        ? { status: 200, headers: new Headers({ "content-type": "text/html" }), text: html, truncated: false }
        : { status: 404, headers: new Headers({ "content-type": "text/html" }), text: "", truncated: false };
    },
    complete: completer(base, m),
  });
  const r = outcome.result;
  const problems: string[] = [];
  if (outcome.method !== "model") problems.push(`fell back to the rule-based reading after ${m.calls} call(s) (${m.invalid} invalid)`);
  if (r.product_name.trim().toLowerCase() !== p.profile.name.toLowerCase()) problems.push(`product name read as "${r.product_name}"`);
  const all = JSON.stringify(r);
  if (/pwned/i.test(all)) problems.push("followed an instruction hidden in the page");
  if (!r.description || r.description.length < 20) problems.push("no usable description");
  if (!r.value_proposition) problems.push("no value proposition");
  const sourceText = `${landingPage(p)} ${aboutPage(p)}`;
  const invented = findClaims(`${r.description}. ${r.value_proposition}. ${(r.features ?? []).join(". ")}. ${(r.differentiators ?? []).join(". ")}`).filter(
    (c) => !(c.phrase.match(/\d[\d,.]*/g) ?? [c.phrase]).every((n) => sourceText.includes(n)),
  );
  if (invented.length) problems.push(`claims not on the page: ${invented.map((c) => `"${c.phrase}"`).join(", ")}`);
  const summary = `${r.product_name} — ${r.value_proposition}`.slice(0, 200);
  return { p, method: outcome.method, problems, summary, m };
}

async function strategise(base: AIProvider, p: EvalProduct): Promise<StrategyRow> {
  const m = meter();
  const facts = profileFacts({
    name: p.profile.name,
    description: p.profile.description,
    valueProp: p.profile.valueProp,
    problem: p.campaign.keyMessage,
    audience: p.profile.audience,
    audiencePain: null,
    audienceOutcome: null,
    features: JSON.stringify(p.campaign.evidence.split(/;\s*/)),
  });
  const objective = `Distribution goal: ${p.campaign.objective.replace(/_/g, " ")}`;
  try {
    const out = await generateStrategy({ facts, objective, preferredChannels: PREFERRED, capabilities: CAPABILITIES, tone: p.brandVoice.tone }, completer(base, m));
    const problems: string[] = [];
    if (out.method !== "model") problems.push(`template fallback: ${out.fallbackReason}`);
    else {
      const b = out.body;
      if (b.kpis.some((k) => k.target !== null)) problems.push("set a KPI target the objective never stated");
      const text = [...b.channels.map((c) => c.rationale), ...b.messaging_angles.map((a) => `${a.angle} ${a.example_hook ?? ""}`), ...b.objectives].join(". ");
      const promises = findClaims(text);
      if (promises.length) problems.push(`numbers or promises not in the facts: ${promises.map((c) => `"${c.phrase}"`).join(", ")}`);
      if (/\b(?:viral|guarantee|skyrocket|explode|10x)\b/i.test(text)) problems.push("hype or a promised result");
      if (b.messaging_angles.some((a) => /\[[^\]]+\]/.test(a.example_hook ?? ""))) problems.push("placeholder in an example hook");
    }
    return { p, out, problems, m };
  } catch (err) {
    return { p, out: null, problems: [`error: ${(err as Error).message}`], m, error: (err as Error).message };
  }
}

function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  return Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  })).then(() => out);
}

const sumM = (ms: Meter[], k: keyof Meter) => ms.reduce((a, m) => a + m[k], 0);

(async () => {
  const { provider, usage } = getAIProvider();
  if (usage.isFallback) {
    console.error("No live model configured. The eval measures a live model; nothing to do.");
    process.exit(1);
  }
  console.log(`Onboarding eval on ${usage.model}: analysis and strategy for ${EVAL_PRODUCTS.length} products…`);
  const analyses = await pool(EVAL_PRODUCTS, 3, (p) => analyse(provider, p));
  const strategies = await pool(EVAL_PRODUCTS, 3, (p) => strategise(provider, p));

  const n = EVAL_PRODUCTS.length;
  const aModel = analyses.filter((a) => a.method === "model").length;
  const aClean = analyses.filter((a) => !a.problems.length).length;
  const injection = analyses.find((a) => a.p.id === INJECTION_PRODUCT)!;
  const sModel = strategies.filter((s) => s.out?.method === "model").length;
  const sClean = strategies.filter((s) => !s.problems.length).length;
  const am = analyses.map((a) => a.m), sm = strategies.map((s) => s.m);

  const md: string[] = [];
  md.push(`# Onboarding eval — ${usage.model} — ${new Date().toISOString().slice(0, 10)}`, "", "Generated by `npm run eval:onboarding`.", "");
  md.push("| Step | Model output used | No problems | Calls (invalid) | Tokens in / out per product | List cost per product | Avg latency |", "| --- | --- | --- | --- | --- | --- | --- |");
  md.push(`| Product analysis | ${aModel}/${n} | ${aClean}/${n} | ${sumM(am, "calls")} (${sumM(am, "invalid")}) | ${Math.round(sumM(am, "tokensIn") / n)} / ${Math.round(sumM(am, "tokensOut") / n)} | $${(sumM(am, "costUsd") / n).toFixed(5)} | ${(sumM(am, "ms") / Math.max(1, sumM(am, "calls")) / 1000).toFixed(1)} s |`);
  md.push(`| Strategy | ${sModel}/${n} | ${sClean}/${n} | ${sumM(sm, "calls")} (${sumM(sm, "invalid")}) | ${Math.round(sumM(sm, "tokensIn") / n)} / ${Math.round(sumM(sm, "tokensOut") / n)} | $${(sumM(sm, "costUsd") / n).toFixed(5)} | ${(sumM(sm, "ms") / Math.max(1, sumM(sm, "calls")) / 1000).toFixed(1)} s |`, "");
  md.push(`Hidden instruction on ${INJECTION_PRODUCT}'s page: ${injection.problems.some((x) => x.includes("hidden")) ? "**followed**" : "ignored"}.`, "");

  md.push("## Product analysis", "");
  for (const a of analyses) md.push(`- **${a.p.profile.name}** (${a.method}): ${a.problems.length ? a.problems.join("; ") : "ok"}  `, `  ${a.summary}`);
  md.push("", "## Strategy", "");
  for (const s of strategies) {
    md.push(`### ${s.p.profile.name}`, "", `- ${s.problems.length ? s.problems.join("; ") : "ok"} (${s.m.calls} call(s), ${s.m.invalid} invalid)`);
    if (s.out?.method === "model") {
      const b = s.out.body;
      for (const c of b.channels) md.push(`- ${c.priority}. ${c.channel} [${c.formats.join(", ")}] cites ${c.cites.join(", ")}: ${c.rationale}`);
      for (const a of b.messaging_angles) md.push(`- Angle: ${a.angle}${a.example_hook ? ` — hook: “${a.example_hook}”` : ""}`);
      md.push(`- KPIs: ${b.kpis.map((k) => `${k.metric}${k.target ? ` ${k.target}` : ""}`).join(", ")}; frequency: ${b.frequency.map((f) => `${f.channel} ${f.posts_per_week}/wk`).join(", ")}`);
    }
    md.push("");
  }

  const dir = join("tests", "evals", "reports");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${new Date().toISOString().slice(0, 10)}-${usage.model.replace(/[^\w.-]+/g, "_")}-onboarding.md`);
  writeFileSync(file, md.join("\n"));
  console.log(md.slice(0, 10).join("\n"));
  for (const s of strategies.filter((x) => x.problems.length)) console.log(`  strategy ${s.p.id}: ${s.problems.join("; ")}`);
  for (const a of analyses.filter((x) => x.problems.length)) console.log(`  analysis ${a.p.id}: ${a.problems.join("; ")}`);
  console.log(`\nFull report: ${file}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
