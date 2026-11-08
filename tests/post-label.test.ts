import { describe, it, expect } from "vitest";
import { firstLine, postLabel } from "@/lib/formats";

describe("post names a founder can read", () => {
  it("turns a generated title into channel · format", () => {
    expect(postLabel({ title: "Get 20 qualified signups in 14 days — wave 1 — linkedin insight", channel: "linkedin", format: "insight" })).toEqual({ name: "LinkedIn · Professional insight", generated: true });
    expect(postLabel({ title: "Get 20 qualified signups in 14 days — wave 1 — shortvideo hook_script", channel: "shortvideo", format: "hook_script" }).name).toBe("Short-form video · Hook + script");
  });
  it("keeps a title the founder wrote", () => {
    expect(postLabel({ title: "Why we went open source", channel: "x", format: "thread" })).toEqual({ name: "Why we went open source", generated: false });
  });
  it("previews the first line only", () => {
    expect(firstLine("\n  Hello there.\nSecond line")).toBe("Hello there.");
    expect(firstLine("word ".repeat(60), 20).length).toBeLessThanOrEqual(20);
  });
});

describe("cycle names", () => {
  it("drops the generated wave suffix", async () => {
    const { cycleName } = await import("@/lib/formats");
    expect(cycleName("Get 20 qualified signups in 14 days — wave 1")).toBe("Get 20 qualified signups in 14 days");
    expect(cycleName("Spring launch")).toBe("Spring launch");
  });
});
