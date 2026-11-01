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
import { getBalance, reserveCredits, finalizeReservation, InsufficientCreditsError } from "@/lib/credits/service";

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
  } finally {
    await prisma.organization.delete({ where: { id: ws.organizationId } }); // cascades to the product
    await prisma.$disconnect();
  }
  console.log(failures === 0 ? "ALL CREDIT CHECKS PASSED" : `${failures} CREDIT CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
