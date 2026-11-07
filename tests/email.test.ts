import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * US-010/011/012. Pure logic plus the outbox and token rules against a small
 * in-memory stand-in for the two Prisma models they touch.
 */

type Row = Record<string, unknown> & { id: string };
const tables = { emailMessage: [] as Row[], emailToken: [] as Row[] };
let seq = 0;
let verifiedOwner: { id: string } | null = null;

function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => {
    const cell = row[k];
    if (v && typeof v === "object" && !(v instanceof Date)) {
      const op = v as { lte?: Date; lt?: Date; in?: unknown[] };
      if (op.lte) return cell instanceof Date && cell <= op.lte;
      if (op.lt) return cell instanceof Date && cell < op.lt;
      if (op.in) return op.in.includes(cell);
    }
    return cell === v || (v === null && cell == null);
  });
}

function apply(row: Row, data: Record<string, unknown>) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && "increment" in (v as object)) row[k] = (row[k] as number) + (v as { increment: number }).increment;
    else row[k] = v;
  }
  row.updatedAt = new Date();
}

function model(name: keyof typeof tables, defaults: () => Record<string, unknown>) {
  const t = () => tables[name];
  return {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `${name}-${++seq}`, ...defaults(), ...data, createdAt: new Date(), updatedAt: new Date() } as Row;
      t().push(row);
      return row;
    },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const hit = t().filter((r) => matches(r, where));
      hit.forEach((r) => apply(r, data));
      return { count: hit.length };
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = t().find((r) => r.id === where.id)!;
      apply(row, data);
      return row;
    },
    findUnique: async ({ where }: { where: Record<string, unknown> }) => t().find((r) => matches(r, where)) ?? null,
    findUniqueOrThrow: async ({ where }: { where: Record<string, unknown> }) => {
      const r = t().find((x) => matches(x, where));
      if (!r) throw new Error("not found");
      return r;
    },
    findMany: async ({ where }: { where: Record<string, unknown> }) => t().filter((r) => matches(r, where)),
  };
}

vi.mock("@/lib/db", () => {
  const prisma = {
    emailMessage: model("emailMessage", () => ({ status: "queued", attempts: 0, nextAttemptAt: new Date(0), payload: null, lastError: null })),
    emailToken: model("emailToken", () => ({ usedAt: null })),
    membership: { findFirst: async () => verifiedOwner },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  return { prisma };
});
vi.mock("@/lib/log", () => ({ log: () => {} }));

const { renderEmail } = await import("@/lib/email/templates");
const { safeAddress, setTransportForTests, EmailSendError, emailConfigured } = await import("@/lib/email/transport");
const { queueEmail, deliverEmail, deliverDueEmails, nextAttemptDelay, MAX_EMAIL_ATTEMPTS, InvalidRecipientError } = await import("@/lib/email/outbox");
const { issueEmailToken, consumeEmailToken, hashEmailToken, TOKEN_TTL_MS } = await import("@/lib/auth/email-tokens");
const { verificationRequired } = await import("@/lib/auth/email-flows");
const { workspacePublishingBlocked } = await import("@/lib/auth/verification");

const sent: { to: string; subject: string; text: string }[] = [];
let failNext: InstanceType<typeof EmailSendError>[] = [];

beforeEach(() => {
  tables.emailMessage.length = 0;
  tables.emailToken.length = 0;
  sent.length = 0;
  failNext = [];
  setTransportForTests({
    name: "smtp",
    async send(mail) {
      const f = failNext.shift();
      if (f) throw f;
      sent.push(mail);
      return { transport: "smtp", delivered: true, providerId: `<m${sent.length}@test>` };
    },
  });
});
afterEach(() => setTransportForTests(null));

describe("templates", () => {
  it("puts the link in the text and states the expiry", () => {
    const v = renderEmail("verify_email", { name: "Ada Okafor", link: "https://app/verify-email?token=abc" });
    expect(v.subject).toMatch(/confirm/i);
    expect(v.text).toContain("Hi Ada,");
    expect(v.text).toContain("https://app/verify-email?token=abc");
    expect(v.text).toContain("24 hours");
    expect(renderEmail("reset_password", { name: "", link: "L" }).text).toMatch(/Hi there,[\s\S]*1 hour[\s\S]*signs out every other session/);
  });
});

describe("addresses", () => {
  it("accepts one plain address and refuses header or recipient smuggling", () => {
    expect(safeAddress(" ada@ledgerline.app ")).toBe("ada@ledgerline.app");
    for (const bad of ["ada@x.io\r\nBcc: e@vil.io", "a@x.io, b@y.io", "Ada <ada@x.io>", "nope", "a@b", `${"a".repeat(250)}@x.io`]) {
      expect(safeAddress(bad)).toBeNull();
    }
  });

  it("refuses to queue for an unusable address", async () => {
    await expect(queueEmail({ template: "verify_email", to: "a@x.io, b@y.io", data: { name: "A", link: "L" } })).rejects.toBeInstanceOf(InvalidRecipientError);
    expect(tables.emailMessage).toHaveLength(0);
  });
});

describe("outbox", () => {
  it("sends once, then erases the encrypted content", async () => {
    const { id } = await queueEmail({ template: "reset_password", to: "ada@ledgerline.app", data: { name: "Ada", link: "https://app/reset-password?token=SECRET" } });
    expect(sent).toHaveLength(1); // no Redis in tests: delivered immediately
    expect(sent[0].text).toContain("token=SECRET");
    const row = tables.emailMessage.find((r) => r.id === id)!;
    expect(row.status).toBe("sent");
    expect(row.payload).toBeNull();
    expect(row.providerId).toBe("<m1@test>");
    expect(await deliverEmail(id)).toEqual({ status: "skipped" }); // a duplicate job is a no-op
    expect(sent).toHaveLength(1);
  });

  it("never stores the link in readable form", async () => {
    failNext = [new EmailSendError("SMTP 451: try later", true)];
    const { id } = await queueEmail({ template: "verify_email", to: "ada@ledgerline.app", data: { name: "Ada", link: "https://app/verify-email?token=SECRET" } });
    const row = tables.emailMessage.find((r) => r.id === id)!;
    expect(row.status).toBe("queued");
    expect(String(row.payload)).not.toContain("SECRET");
  });

  it("retries a transient failure with backoff, then succeeds exactly once", async () => {
    failNext = [new EmailSendError("SMTP 451: try later", true)];
    const t0 = new Date();
    const { id } = await queueEmail({ template: "verify_email", to: "ada@ledgerline.app", data: { name: "Ada", link: "L" } });
    const row = tables.emailMessage.find((r) => r.id === id)!;
    expect(row).toMatchObject({ status: "queued", attempts: 1, lastError: "SMTP 451: try later" });
    expect((row.nextAttemptAt as Date).getTime()).toBeGreaterThanOrEqual(t0.getTime() + nextAttemptDelay(1) - 5);
    expect((await deliverDueEmails(20, new Date())).attempted).toBe(0); // not due yet
    const later = new Date(Date.now() + nextAttemptDelay(1) + 1000);
    expect(await deliverDueEmails(20, later)).toEqual({ attempted: 1, sent: 1 });
    expect(sent).toHaveLength(1);
    expect(row.status).toBe("sent");
  });

  it("gives up on a permanent rejection and after the last attempt, clearing the content", async () => {
    failNext = [new EmailSendError("SMTP 550: no such mailbox", false)];
    const a = await queueEmail({ template: "verify_email", to: "gone@ledgerline.app", data: { name: "A", link: "L" } });
    expect(tables.emailMessage.find((r) => r.id === a.id)).toMatchObject({ status: "failed", payload: null });

    failNext = Array.from({ length: MAX_EMAIL_ATTEMPTS }, () => new EmailSendError("SMTP 421", true));
    const b = await queueEmail({ template: "verify_email", to: "slow@ledgerline.app", data: { name: "B", link: "L" } });
    let when = Date.now();
    for (let i = 1; i < MAX_EMAIL_ATTEMPTS; i++) {
      when += nextAttemptDelay(i) + 1000;
      await deliverDueEmails(20, new Date(when));
    }
    expect(tables.emailMessage.find((r) => r.id === b.id)).toMatchObject({ status: "failed", attempts: MAX_EMAIL_ATTEMPTS, payload: null });
  });

  it("backs off 1 min, 5 min, 15 min, then hourly", () => {
    expect([1, 2, 3, 4, 9].map(nextAttemptDelay)).toEqual([60_000, 300_000, 900_000, 3_600_000, 3_600_000]);
  });
});

describe("email tokens", () => {
  it("works once", async () => {
    const token = await issueEmailToken("u1", "reset");
    expect(tables.emailToken[0].tokenHash).not.toContain(token);
    expect(await consumeEmailToken(token, "reset")).toEqual({ ok: true, userId: "u1" });
    expect(await consumeEmailToken(token, "reset")).toEqual({ ok: false, reason: "used" });
  });

  it("expires (reset after 1 hour, verify after 24)", async () => {
    const t0 = new Date("2026-11-02T10:00:00Z");
    const reset = await issueEmailToken("u1", "reset", t0);
    expect(await consumeEmailToken(reset, "reset", new Date(t0.getTime() + TOKEN_TTL_MS.reset + 1))).toEqual({ ok: false, reason: "expired" });
    const verify = await issueEmailToken("u1", "verify", t0);
    expect((await consumeEmailToken(verify, "verify", new Date(t0.getTime() + 23 * 3600_000))).ok).toBe(true);
  });

  it("a new link cancels the previous one; purposes never cross", async () => {
    const first = await issueEmailToken("u1", "reset");
    const second = await issueEmailToken("u1", "reset");
    expect(await consumeEmailToken(first, "reset")).toEqual({ ok: false, reason: "used" });
    expect(await consumeEmailToken(second, "verify")).toEqual({ ok: false, reason: "invalid" });
    expect(hashEmailToken(second, "verify")).not.toBe(hashEmailToken(second, "reset"));
    expect((await consumeEmailToken(second, "reset")).ok).toBe(true);
  });

  it("rejects malformed tokens without a lookup", async () => {
    for (const t of ["", "short", "has spaces in it and is long enough", "x".repeat(200)]) {
      expect(await consumeEmailToken(t, "verify")).toEqual({ ok: false, reason: "invalid" });
    }
  });
});

describe("verification gate", () => {
  it("is off when the server cannot send email, so nobody is locked out", () => {
    expect(emailConfigured()).toBe(false);
    expect(verificationRequired({ emailVerifiedAt: null })).toBe(false);
  });

  it("applies to unconfirmed addresses once SMTP is configured", async () => {
    const { env } = await import("@/lib/env");
    const before = env.SMTP_URL;
    (env as { SMTP_URL: string }).SMTP_URL = "smtps://user:pass@smtp.example.com:465";
    try {
      expect(verificationRequired({ emailVerifiedAt: null })).toBe(true);
      expect(verificationRequired({ emailVerifiedAt: new Date() })).toBe(false);
    } finally {
      (env as { SMTP_URL: string }).SMTP_URL = before;
    }
  });

  it("blocks every publish path for a workspace until its owner is confirmed", async () => {
    verifiedOwner = null;
    expect(await workspacePublishingBlocked("ws1")).toBe(false); // no SMTP: never gated
    const { env } = await import("@/lib/env");
    const before = env.SMTP_URL;
    (env as { SMTP_URL: string }).SMTP_URL = "smtps://user:pass@smtp.example.com:465";
    try {
      expect(await workspacePublishingBlocked("ws1")).toBe(true);
      verifiedOwner = { id: "m1" };
      expect(await workspacePublishingBlocked("ws1")).toBe(false);
    } finally {
      (env as { SMTP_URL: string }).SMTP_URL = before;
      verifiedOwner = null;
    }
  });
});
