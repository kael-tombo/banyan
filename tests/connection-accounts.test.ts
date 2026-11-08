import { describe, it, expect } from "vitest";
import { SocialFlowProvider } from "@/lib/distribution/socialflow/adapter";
import type { Transport } from "@/lib/distribution/socialflow/client";
import { accountsForChannel, safeConnectUrl } from "@/lib/distribution/connection-accounts";

/** US-032: account connection and revocation through the provider. */

const reply = (status: number, body: unknown) => ({ status, headers: new Headers(), text: JSON.stringify(body), truncated: false });

function provider(handler: (method: string, path: string) => ReturnType<typeof reply>) {
  const seen: string[] = [];
  const transport: Transport = async (url, opts) => {
    const path = new URL(url).pathname;
    seen.push(`${opts.method ?? "GET"} ${path}`);
    return handler(opts.method ?? "GET", path);
  };
  return { sf: new SocialFlowProvider({ baseUrl: "https://sf.test", transport, enabledOverride: true }), seen };
}
const ctx = { workspaceId: "ws1", credentials: { apiKey: "k" } };

describe("revokeAccount (C10)", () => {
  it("revokes at the provider and reports whether the platform confirmed", async () => {
    const { sf, seen } = provider(() => reply(200, { id: "acc-1", status: "revoked", provider_revoked: false }));
    const res = await sf.revokeAccount(ctx, "acc-1");
    expect(res).toEqual({ ok: true, value: { platformConfirmed: false } });
    expect(seen).toEqual(["DELETE /v1/accounts/acc-1"]);
  });

  it("treats a missing provider_revoked as unconfirmed", async () => {
    const { sf } = provider(() => reply(200, { id: "acc-1", status: "revoked" }));
    expect(await sf.revokeAccount(ctx, "acc-1")).toEqual({ ok: true, value: { platformConfirmed: false } });
  });

  it("surfaces a provider error instead of pretending it worked", async () => {
    const { sf } = provider(() => reply(404, { error: { code: "not_found", message: "No such account." } }));
    const res = await sf.revokeAccount(ctx, "acc-x");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("not_found");
  });

  it("rejects a response that does not match the contract", async () => {
    const { sf } = provider(() => reply(200, { ok: true }));
    expect((await sf.revokeAccount(ctx, "acc-1")).ok).toBe(false);
  });

  it("escapes the account id in the path", async () => {
    const { sf, seen } = provider(() => reply(200, { id: "a/b", status: "revoked" }));
    await sf.revokeAccount(ctx, "a/b");
    expect(seen[0]).toBe("DELETE /v1/accounts/a%2Fb");
  });
});

describe("connection account helpers", () => {
  const caps = { publish: true, schedule: true, analytics: false, formats: ["post"] };
  it("scopes accounts to the connection's channel", () => {
    const list = [
      { id: "1", platform: "linkedin", handle: "Ada", status: "active" as const, capabilities: caps },
      { id: "2", platform: "x", handle: "@ada", status: "active" as const, capabilities: caps },
    ];
    expect(accountsForChannel(list, "x").map((a) => a.id)).toEqual(["2"]);
  });

  it("only lets http(s) connect links reach the browser", () => {
    expect(safeConnectUrl("https://social.example.com/connect/cs_1")).toBe("https://social.example.com/connect/cs_1");
    expect(safeConnectUrl("javascript:alert(1)")).toBeNull();
    expect(safeConnectUrl("data:text/html,hi")).toBeNull();
    expect(safeConnectUrl("not a url")).toBeNull();
  });
});

describe("token expiry note", async () => {
  const { expiryNote } = await import("@/lib/distribution/token-expiry");
  const now = new Date("2026-11-01T12:00:00Z");
  it("says nothing for tokens that do not expire", () => {
    expect(expiryNote(null, now)).toBeNull();
    expect(expiryNote("garbage", now)).toBeNull();
  });
  it("warns within 14 days, and says plainly when access has ended", () => {
    expect(expiryNote("2026-11-06T12:00:00Z", now)).toMatchObject({ tone: "soon", text: expect.stringContaining("in 5 days") });
    expect(expiryNote("2026-11-02T00:00:00Z", now)?.text).toContain("in 1 day.");
    expect(expiryNote("2026-10-31T12:00:00Z", now)).toMatchObject({ tone: "expired" });
  });
  it("is calm when access lasts", () => {
    expect(expiryNote("2026-12-31T12:00:00Z", now)).toMatchObject({ tone: "ok", text: "Access until Dec 31, 2026." });
  });
});
