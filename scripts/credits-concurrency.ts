/**
 * US-062 acceptance against a real Postgres: with 10 credits available, two
 * concurrent 8-credit reservations — exactly one succeeds, and the cached
 * balance equals the ledger afterwards. Also checks a retried reservation is
 * charged once (US-056).
 *
 *   npx tsx --env-file=.env scripts/credits-concurrency.ts
 *
 * Creates a throwaway workspace and deletes it at the end.
 */
import { prisma } from "@/lib/db";
import { fold } from "@/lib/credits/ledger";
import { getBalance, reserveCredits, finalizeReservation, InsufficientCreditsError, releaseStaleReservations, BudgetExceededError, creditsUsedBy } from "@/lib/credits/service";
import { draftHoldKey, goalDraftPrefix, settleDraftCredit, WORKFLOW_DRAFT_CREDITS } from "@/lib/credits/draft-charge";

async function main() {
  const ws = await prisma.workspace.create({ data: { organization: { create: { name: "credits-concurrency", slug: `credits-concurrency-${Date.now()}` } }, name: "credits-concurrency", slug: `cc-${Date.now()}` } });
  let failures = 0;
  const check = (ok: boolean, label: string) => {
    console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
    if (!ok) failures++;
  };
  try {
    // Starter grant is 50; spend it down to exactly 10 available.
    await getBalance(ws.id);
    await reserveCredits(ws.id, 40, "setup");
    await finalizeReservation(ws.id, "setup", 40);
    check((await getBalance(ws.id)).available === 10, "10 credits available before the race");

    const results = await Promise.allSettled([reserveCredits(ws.id, 8, "race-a"), reserveCredits(ws.id, 8, "race-b")]);
    const won = results.filter((r) => r.status === "fulfilled").length;
    const lostShort = results.filter((r) => r.status === "rejected" && r.reason instanceof InsufficientCreditsError).length;
    check(won === 1 && lostShort === 1, "two concurrent 8-credit reservations: exactly one succeeds");

    const again = await reserveCredits(ws.id, 8, results[0].status === "fulfilled" ? "race-a" : "race-b");
    check(again.reused === true, "retrying the winning reservation reuses it instead of charging again");

    const entries = await prisma.creditEntry.findMany({ where: { workspaceId: ws.id }, select: { kind: true, amount: true } });
    const ledger = fold(entries);
    const cached = await getBalance(ws.id);
    check(ledger.available === cached.available && ledger.reserved === cached.reserved, `cached balance equals the ledger (${cached.available} available, ${cached.reserved} held)`);
    check(cached.available === 2 && cached.reserved === 8, "2 available and 8 held after the race");

    // Blocker 09: a hold left by a crashed run comes back; a fresh hold is left alone.
    const fresh = await releaseStaleReservations();
    check((await getBalance(ws.id)).reserved === 8, `a fresh hold is not released (${fresh.released} stale)`);
    await prisma.creditEntry.updateMany({ where: { workspaceId: ws.id, kind: "reserve", reservationKey: { in: ["race-a", "race-b"] } }, data: { createdAt: new Date(Date.now() - 2 * 3600_000) } });
    await releaseStaleReservations();
    const recovered = await getBalance(ws.id);
    check(recovered.available === 10 && recovered.reserved === 0, `a hold left by a crashed run is returned in full (${recovered.available} available, ${recovered.reserved} held)`);
    await releaseStaleReservations();
    check((await getBalance(ws.id)).available === 10, "releasing again changes nothing");

    // R4: a goal's drafts share its credit budget. Three drafts race under a 2-credit budget with
    // credits to spare: exactly two holds succeed and the third is refused for the budget.
    const goalA = { keyPrefix: goalDraftPrefix("goal-a"), limit: 2 };
    const raced = await Promise.allSettled(["t1", "t2", "t3"].map((t) => reserveCredits(ws.id, WORKFLOW_DRAFT_CREDITS, draftHoldKey("goal-a", t, 1), { budget: goalA })));
    const held = raced.filter((r) => r.status === "fulfilled").length;
    const overBudget = raced.filter((r) => r.status === "rejected" && r.reason instanceof BudgetExceededError).length;
    check(held === 2 && overBudget === 1, `three drafts under a 2-credit budget: two held, one refused (${held} held, ${overBudget} refused)`);
    check((await creditsUsedBy(ws.id, goalA.keyPrefix)) === 2, "the budget shows 2 credits used");

    // A template draft returns its hold, which frees room in the budget; a spent one keeps it.
    const winners = ["t1", "t2", "t3"].filter((_, i) => raced[i].status === "fulfilled");
    await settleDraftCredit(ws.id, draftHoldKey("goal-a", winners[0], 1), false);
    await settleDraftCredit(ws.id, draftHoldKey("goal-a", winners[1], 1), true);
    check((await creditsUsedBy(ws.id, goalA.keyPrefix)) === 1, "a returned hold no longer counts against the budget");
    const retried = await reserveCredits(ws.id, 1, draftHoldKey("goal-a", "t4", 1), { budget: goalA }).then(() => true, () => false);
    check(retried, "the freed credit lets the next draft through");

    // Another goal's drafts are not counted against this budget.
    const other = await reserveCredits(ws.id, 1, draftHoldKey("goal-b", "t1", 1), { budget: { keyPrefix: goalDraftPrefix("goal-b"), limit: 1 } }).then(() => true, () => false);
    check(other, "one goal's spending does not count against another goal's budget");
    const after = await getBalance(ws.id);
    const ledgerAfter = fold(await prisma.creditEntry.findMany({ where: { workspaceId: ws.id }, select: { kind: true, amount: true } }));
    check(ledgerAfter.available === after.available && ledgerAfter.reserved === after.reserved, "the balance still equals the ledger after budgeted holds");
  } finally {
    await prisma.organization.delete({ where: { id: ws.organizationId } }); // cascades to the product
    await prisma.$disconnect();
  }
  console.log(failures === 0 ? "ALL CREDIT CHECKS PASSED" : `${failures} CREDIT CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
