import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { deltas, insufficientMessage, STARTER_GRANT, validAmount, type Balance, type CreditKind } from "./ledger";

/**
 * Credit operations — US-055, US-056, US-062.
 *
 * Every operation runs in a transaction that first locks the workspace's
 * CreditAccount row (SELECT … FOR UPDATE), so a balance check and the
 * reservation that depends on it cannot interleave with another request:
 * two 8-credit reservations against 10 credits, exactly one succeeds.
 * Entries are written once per idempotency key; repeating an operation
 * returns the original entry instead of charging again.
 */

export class InsufficientCreditsError extends Error {
  constructor(public needed: number, public available: number) {
    super(insufficientMessage(needed, available));
  }
}

type Tx = Prisma.TransactionClient;

async function lockAccount(tx: Tx, workspaceId: string): Promise<Balance> {
  await tx.creditAccount.upsert({ where: { workspaceId }, create: { workspaceId }, update: {} });
  const rows = await tx.$queryRaw<{ available: number; reserved: number }[]>`
    SELECT "available", "reserved" FROM "CreditAccount" WHERE "workspaceId" = ${workspaceId} FOR UPDATE`;
  let balance = { available: Number(rows[0]?.available ?? 0), reserved: Number(rows[0]?.reserved ?? 0) };
  // Every workspace starts with a grant, written once.
  const starter = await tx.creditEntry.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey: "starter-grant" } } });
  if (!starter) balance = await apply(tx, workspaceId, balance, "grant", STARTER_GRANT, "starter-grant", { note: "Starter credits" });
  return balance;
}

async function apply(
  tx: Tx,
  workspaceId: string,
  balance: Balance,
  kind: CreditKind,
  amount: number,
  idempotencyKey: string,
  extra: { reservationKey?: string; campaignId?: string | null; note?: string } = {},
): Promise<Balance> {
  if (!validAmount(kind, amount)) throw new Error(`Invalid ${kind} amount ${amount}`);
  await tx.creditEntry.create({
    data: { workspaceId, kind, amount, idempotencyKey, reservationKey: extra.reservationKey ?? null, campaignId: extra.campaignId ?? null, note: extra.note ?? "" },
  });
  const d = deltas(kind, amount);
  const next = { available: balance.available + d.available, reserved: balance.reserved + d.reserved };
  await tx.creditAccount.update({ where: { workspaceId }, data: next });
  return next;
}

function locked<T>(workspaceId: string, fn: (tx: Tx, balance: Balance) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => fn(tx, await lockAccount(tx, workspaceId)), { timeout: 15_000 });
}

export async function getBalance(workspaceId: string): Promise<Balance> {
  return locked(workspaceId, async (_tx, balance) => balance);
}

export async function grantCredits(workspaceId: string, amount: number, key: string, note: string) {
  return locked(workspaceId, async (tx, balance) => {
    const existing = await tx.creditEntry.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey: key } } });
    if (existing) return balance;
    return apply(tx, workspaceId, balance, "grant", amount, key, { note });
  });
}

/**
 * Hold credits before billable work starts. Refused, with nothing written,
 * when the balance is short. Repeating with the same key returns the
 * existing reservation.
 */
export async function reserveCredits(workspaceId: string, amount: number, key: string, extra: { campaignId?: string | null; note?: string } = {}) {
  return locked(workspaceId, async (tx, balance) => {
    const existing = await tx.creditEntry.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey: key } } });
    if (existing) return { reused: true, balance };
    if (balance.available < amount) throw new InsufficientCreditsError(amount, balance.available);
    return { reused: false, balance: await apply(tx, workspaceId, balance, "reserve", amount, key, { ...extra, reservationKey: key }) };
  });
}

/**
 * Close a reservation: spend `actual` of it and return the rest. Safe to
 * repeat: each part is written once per reservation.
 */
export async function finalizeReservation(workspaceId: string, reservationKey: string, actual: number) {
  return locked(workspaceId, async (tx, balance) => {
    const entries = await tx.creditEntry.findMany({ where: { workspaceId, reservationKey } });
    const reserve = entries.find((e) => e.kind === "reserve");
    if (!reserve) return balance;
    const closed = entries.filter((e) => e.kind === "settle" || e.kind === "release").reduce((s, e) => s + e.amount, 0);
    let remaining = reserve.amount - closed;
    let next = balance;
    const spend = Math.min(Math.max(0, actual), remaining);
    if (spend > 0 && !entries.some((e) => e.kind === "settle")) {
      next = await apply(tx, workspaceId, next, "settle", spend, `${reservationKey}:settle`, { reservationKey, campaignId: reserve.campaignId, note: reserve.note });
      remaining -= spend;
    }
    if (remaining > 0 && !entries.some((e) => e.kind === "release")) {
      next = await apply(tx, workspaceId, next, "release", remaining, `${reservationKey}:release`, { reservationKey, campaignId: reserve.campaignId, note: "Unused credits returned" });
    }
    return next;
  });
}

/** Give back spent credits (for example after a provider-side failure). */
export async function refundCredits(workspaceId: string, amount: number, key: string, extra: { campaignId?: string | null; note: string }) {
  return locked(workspaceId, async (tx, balance) => {
    const existing = await tx.creditEntry.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey: key } } });
    if (existing) return balance;
    return apply(tx, workspaceId, balance, "refund", amount, key, extra);
  });
}
