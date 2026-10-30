import { describe, it, expect } from "vitest";
import { channelConstraint, normalizeChannelToken, parseChannelConstraint } from "@/lib/agents/channels";
import { isManualChannel } from "@/lib/formats";

describe("parseChannelConstraint", () => {
  it("reads the canonical constraint", () => {
    expect(parseChannelConstraint("channels: x, linkedin, shortvideo")).toEqual([
      "x",
      "linkedin",
      "shortvideo",
    ]);
  });

  it("tolerates equals, semicolons and aliases", () => {
    expect(parseChannelConstraint("Channels = LinkedIn; X")).toEqual(["linkedin", "x"]);
    expect(parseChannelConstraint("channels: twitter, short-form video")).toEqual([
      "x",
      "shortvideo",
    ]);
  });

  it("deduplicates and preserves order", () => {
    expect(parseChannelConstraint("channels: linkedin, linkedin, x")).toEqual(["linkedin", "x"]);
  });

  it("returns nothing when there is no channel constraint", () => {
    expect(parseChannelConstraint("no paid ads; budget $0")).toEqual([]);
    expect(parseChannelConstraint("")).toEqual([]);
  });

  it("ignores unknown tokens", () => {
    expect(parseChannelConstraint("channels: linkedin, podcast")).toEqual(["linkedin"]);
  });
});

describe("channel tokens", () => {
  it("normalizes common aliases", () => {
    expect(normalizeChannelToken("Twitter")).toBe("x");
    expect(normalizeChannelToken("short-form video")).toBe("shortvideo");
    expect(normalizeChannelToken("LinkedIn")).toBe("linkedin");
    expect(normalizeChannelToken("podcast")).toBeNull();
  });

  it("renders a canonical constraint", () => {
    expect(channelConstraint(["linkedin", "x"])).toBe("channels: linkedin, x");
    expect(channelConstraint([])).toBe("");
  });

  it("classifies short-form video as the manual handoff channel", () => {
    expect(isManualChannel("shortvideo")).toBe(true);
    expect(isManualChannel("linkedin")).toBe(false);
    expect(isManualChannel("x")).toBe(false);
  });
});
