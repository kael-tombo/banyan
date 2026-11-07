import { beforeEach, describe, expect, it, vi } from "vitest";

/** Status surfaces and real selection must agree, and hosted OpenCode stays out of production. */

const envMock = vi.hoisted(() => ({
  AI_PROVIDER: "",
  OPENAI_API_KEY: "",
  OPENAI_BASE_URL: "https://api.openai.com/v1",
  OPENAI_MODEL: "gpt-x",
  OPENAI_EXTRA_HEADERS: "",
  OPENCODE_URL: "",
  OPENCODE_PASSWORD: "",
  OPENCODE_MODEL: "opencode/free",
  OPENCODE_TIMEOUT_MS: 5000,
  NODE_ENV: "development",
}));
vi.mock("@/lib/env", () => ({ env: envMock }));

import { describeLiveModel, getAIProvider, hostedInferenceBlocked } from "@/lib/ai/provider";

const set = (over: Partial<typeof envMock>) => Object.assign(envMock, over);

beforeEach(() => {
  set({ AI_PROVIDER: "", OPENAI_API_KEY: "", OPENAI_BASE_URL: "https://api.openai.com/v1", OPENCODE_URL: "", NODE_ENV: "development" });
});

const CASES: [string, Partial<typeof envMock>][] = [
  ["nothing configured", {}],
  ["a key, auto", { OPENAI_API_KEY: "k" }],
  ["a key, explicit", { AI_PROVIDER: "openai", OPENAI_API_KEY: "k" }],
  ["provider none with a key", { AI_PROVIDER: "none", OPENAI_API_KEY: "k" }],
  ["opencode requested, a key present", { AI_PROVIDER: "opencode", OPENAI_API_KEY: "k", OPENCODE_URL: "http://x" }],
  ["opencode requested, no key", { AI_PROVIDER: "opencode", OPENCODE_URL: "http://x" }],
  ["opencode in production", { AI_PROVIDER: "opencode", OPENCODE_URL: "http://x", NODE_ENV: "production" }],
  ["hosted inference, development", { OPENAI_API_KEY: "k", OPENAI_BASE_URL: "https://opencode.ai/inference/go/openai/v1" }],
  ["hosted inference, production", { OPENAI_API_KEY: "k", OPENAI_BASE_URL: "https://opencode.ai/inference/go/openai/v1", NODE_ENV: "production" }],
  ["direct key, production", { OPENAI_API_KEY: "k", NODE_ENV: "production" }],
];

describe("describeLiveModel and getAIProvider", () => {
  it.each(CASES)("agree: %s", (_name, over) => {
    set(over);
    expect(describeLiveModel().live).toBe(!getAIProvider().usage.isFallback);
  });

  it("does not claim a live model when AI_PROVIDER=opencode and a key is set, which serves templates", () => {
    set({ AI_PROVIDER: "opencode", OPENAI_API_KEY: "k", OPENCODE_URL: "http://x" });
    expect(describeLiveModel()).toMatchObject({ live: false, via: "none" });
  });
});

describe("OpenCode's hosted inference", () => {
  const HOSTED = { OPENAI_API_KEY: "k", OPENAI_BASE_URL: "https://opencode.ai/inference/go/openai/v1" };

  it("works for development and internal testing", () => {
    set(HOSTED);
    expect(hostedInferenceBlocked()).toBe(false);
    expect(getAIProvider().usage.isFallback).toBe(false);
  });

  it("is off in production, and the label says why", () => {
    set({ ...HOSTED, NODE_ENV: "production" });
    expect(hostedInferenceBlocked()).toBe(true);
    const { usage } = getAIProvider();
    expect(usage.isFallback).toBe(true);
    expect(usage.label).toContain("internal use only");
  });

  it("does not catch a lookalike host, or a direct provider", () => {
    set({ ...HOSTED, NODE_ENV: "production", OPENAI_BASE_URL: "https://notopencode.ai/v1" });
    expect(hostedInferenceBlocked()).toBe(false);
    set({ OPENAI_BASE_URL: "https://api.openai.com/v1" });
    expect(hostedInferenceBlocked()).toBe(false);
  });
});
