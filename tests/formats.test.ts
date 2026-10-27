import { describe, it, expect } from "vitest";
import { isChannel, isFormatFor, formatsFor, CHANNEL_LIMITS, channelSchema, contentBodySchema } from "@/lib/formats";

describe("channel validation", () => {
  it("accepts only the supported channels", () => {
    expect(isChannel("x")).toBe(true);
    expect(isChannel("linkedin")).toBe(true);
    expect(isChannel("shortvideo")).toBe(true);
    expect(isChannel("tiktok")).toBe(false);
    expect(isChannel("")).toBe(false);
  });

  it("validates via the zod schema too", () => {
    expect(channelSchema.safeParse("linkedin").success).toBe(true);
    expect(channelSchema.safeParse("threads").success).toBe(false);
  });
});

describe("format validation", () => {
  it("accepts formats defined for the channel", () => {
    expect(isFormatFor("x", "thread")).toBe(true);
    expect(isFormatFor("linkedin", "insight")).toBe(true);
  });

  it("rejects a format from another channel", () => {
    expect(isFormatFor("x", "insight")).toBe(false);
    expect(isFormatFor("linkedin", "thread")).toBe(false);
  });

  it("returns no formats for an unknown channel", () => {
    expect(formatsFor("myspace")).toEqual([]);
    expect(isFormatFor("myspace", "single")).toBe(false);
  });
});

describe("content body limits", () => {
  it("enforces the channel character limit", () => {
    const xSchema = contentBodySchema("x");
    expect(xSchema.safeParse("hi").success).toBe(false); // below min length
    expect(xSchema.safeParse("a".repeat(500)).success).toBe(true);
    expect(xSchema.safeParse("a".repeat(CHANNEL_LIMITS.x + 1)).success).toBe(false);
  });
});
