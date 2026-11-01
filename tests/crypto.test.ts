import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret, maskSecret, randomSlug } from "@/lib/crypto";

describe("secret encryption (AES-256-GCM)", () => {
  it("round-trips a credential payload without leaking plaintext", () => {
    const payload = JSON.stringify({ baseUrl: "https://provider.example.com", apiKey: "sk-live-123456" });
    const encrypted = encryptSecret(payload);
    expect(encrypted).not.toContain("sk-live-123456");
    expect(decryptSecret(encrypted)).toBe(payload);
  });

  it("treats empty input as empty output", () => {
    expect(encryptSecret("")).toBe("");
    expect(decryptSecret("")).toBe("");
  });

  it("refuses to decrypt tampered ciphertext (auth tag check)", () => {
    const encrypted = encryptSecret("hello world");
    const tampered = Buffer.from(encrypted, "base64");
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => decryptSecret(tampered.toString("base64"))).toThrow();
  });
});

describe("maskSecret", () => {
  it("never reveals enough to reconstruct the secret", () => {
    expect(maskSecret("")).toBe("");
    expect(maskSecret("short")).toBe("••••••••");
    expect(maskSecret("abcdefghijkl")).toBe("abcd••••ijkl");
  });
});

describe("randomSlug", () => {
  it("produces the requested length from an unambiguous alphabet", () => {
    const slug = randomSlug(12);
    expect(slug).toHaveLength(12);
    expect(slug).toMatch(/^[abcdefghijkmnpqrstuvwxyz23456789]+$/);
  });

  it("does not collide across many calls", () => {
    const set = new Set(Array.from({ length: 200 }, () => randomSlug(8)));
    expect(set.size).toBe(200);
  });
});
