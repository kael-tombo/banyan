import { describe, expect, it } from "vitest";
import fs from "node:fs";
import manifest from "@/app/manifest";

describe("web app manifest (mobile M0)", () => {
  const m = manifest();

  it("installs as a standalone app that opens on the approvals inbox", () => {
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/app/approvals");
    expect(m.start_url!.startsWith(m.scope!)).toBe(true);
  });

  it("points only at icons that exist", () => {
    for (const icon of m.icons ?? []) {
      expect(fs.existsSync(`src/app${icon.src}`), icon.src).toBe(true);
    }
  });

  it("offers shortcuts only to app pages that exist", () => {
    for (const s of m.shortcuts ?? []) {
      expect(fs.existsSync(`src/app${s.url}/page.tsx`), s.url).toBe(true);
    }
  });
});
