import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { z } from "zod";
import { MAX_JSON_BODY_BYTES, readJson } from "@/lib/api-utils";

/**
 * readJson is the uniform body reader for every mutating API route. The size
 * cap must trigger before JSON.parse / zod validation, closing the oversized-
 * payload memory-exhaustion path (zod 3.x advisory).
 */
const schema = z.object({ name: z.string().max(10) });

function makeReq(body: string, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/test", {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("readJson", () => {
  it("parses and validates a normal body", async () => {
    const res = await readJson(makeReq(JSON.stringify({ name: "banyan" })), schema);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.name).toBe("banyan");
  });

  it("returns 413 for an oversized body (actual bytes)", async () => {
    const big = JSON.stringify({ name: "x".repeat(MAX_JSON_BODY_BYTES + 1) });
    const res = await readJson(makeReq(big), schema);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(413);
      expect(res.message).toMatch(/too large/);
    }
  });

  it("returns 413 from the declared content-length before reading", async () => {
    // Serve a small body but lie about content-length; the declared check
    // must reject without draining the stream.
    const res = await readJson(makeReq('{"name":"ok"}', { "content-length": String(MAX_JSON_BODY_BYTES + 10) }), schema);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(413);
  });

  it("honors a custom lower cap", async () => {
    const res = await readJson(makeReq(JSON.stringify({ name: "banyan" })), schema, 8);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(413);
  });

  it("returns 400 for malformed JSON", async () => {
    const res = await readJson(makeReq("{not json"), schema);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
      expect(res.message).toMatch(/Invalid JSON/);
    }
  });

  it("returns 400 with zod issues for schema violations", async () => {
    const res = await readJson(makeReq(JSON.stringify({ name: "x".repeat(50) })), schema);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });

  it("returns 400 when the stream cannot be read", async () => {
    const req = new NextRequest("http://localhost:3000/api/test", { method: "POST", body: "x" });
    await req.text(); // consume the body — a second read throws
    const res = await readJson(req, schema);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });
});
