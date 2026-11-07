import { recommendationConfidence } from "@/lib/agents/handlers/analysis";
import { channelName, type CycleReport } from "@/lib/cycle-report";

/**
 * The next move from a cycle's own report — for cycles that ran on a strategy
 * (no analyst task) or any cycle without a recommendation yet. One change,
 * chosen from recorded numbers only, with the analyst's confidence thresholds.
 * Never invents an effect: with nothing measured it says so and asks for data.
 */

export type CycleRecommendation = {
  title: string;
  rationale: string;
  confidence: "low" | "medium" | "high";
  uncertainty: string;
  evidence: { source: string; ref: string; summary: string }[];
};

const MIN_VISITS_TO_COMPARE = 10;

export function recommendFromReport(r: CycleReport): CycleRecommendation {
  const live = r.shipped.filter((s) => s.state === "provider" || s.state === "manual");
  const visits = r.produced.visits ?? 0;
  const signups = (r.produced.trackedSignups ?? 0) + r.produced.recorded.filter((m) => /signup|registration/.test(m.metric)).reduce((s, m) => s + m.total, 0);

  const evidence: CycleRecommendation["evidence"] = [];
  if (live.length) evidence.push({ source: "publications", ref: "cycle", summary: `${live.length} post(s) went live (${live.filter((s) => s.state === "provider").length} confirmed by the platform).` });
  if (r.produced.visits !== null) evidence.push({ source: "tracked_links", ref: "cycle", summary: `${visits} tracked visit(s) through the cycle's links.` });
  if (signups > 0) evidence.push({ source: "signups", ref: "cycle", summary: `${signups} signup(s) recorded for the cycle.` });

  // Per-channel visits, only for channels with a tracked link.
  const byChannel = new Map<string, number>();
  for (const s of live) if (s.link) byChannel.set(s.channel, (byChannel.get(s.channel) ?? 0) + s.link.clicks);
  const ranked = [...byChannel.entries()].sort((a, b) => b[1] - a[1]);

  const { confidence, uncertainty } = recommendationConfidence({ signups, clicks: visits, publications: live.length, evidenceCount: evidence.length });
  const make = (title: string, rationale: string): CycleRecommendation => ({ title, rationale, confidence, uncertainty, evidence });

  if (live.length === 0) {
    return make(
      "Publish the approved posts before changing anything",
      "Nothing from this cycle went live, so there is no outcome to learn from. Publish (or export and record) the approved posts and let the window run."
    );
  }
  if (r.produced.visits === null) {
    return make(
      "Attach a tracked link to every post next cycle",
      "The posts went live without tracked links, so not one visit can be attributed. Keep everything else the same and measure this time."
    );
  }
  if (r.objective.status === "met") {
    return make(
      "Keep the message and add one channel",
      `The cycle met its target (${r.objective.actual} ${r.objective.metric.replace(/_/g, " ")}). Keep the same message and metric so the results stay comparable, and add one channel.`
    );
  }
  if (ranked.length >= 2 && ranked[0][1] >= MIN_VISITS_TO_COMPARE && ranked[0][1] >= 2 * Math.max(1, ranked[1][1])) {
    const [best, bestVisits] = ranked[0];
    const [other, otherVisits] = ranked[1];
    return make(
      `Lead with ${channelName(best)} next cycle`,
      `${channelName(best)} brought ${bestVisits} tracked visits against ${otherVisits} from ${channelName(other)}. Put the strongest asset there first and keep the message the same.`
    );
  }
  if (!r.window.closed && visits < MIN_VISITS_TO_COMPARE) {
    return make(
      "Let the current posts run until the window closes",
      `${visits} tracked visit(s) so far with ${r.window.daysRemaining ?? "some"} day(s) left. Changing course now would reset measurement before a readable signal exists.`
    );
  }
  const where = ranked[0] ? channelName(ranked[0][0]) : "the strongest channel";
  return make(
    `Test a different opening hook on ${where}`,
    `${visits} tracked visit(s) and ${signups} signup(s) fell short of the target. Change only the first line of the post on ${where}, keep the offer and channel, and compare next cycle.`
  );
}
