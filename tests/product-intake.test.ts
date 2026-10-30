import { describe, it, expect } from "vitest";
import { extractProductSnapshot, normalizeProductUrl } from "@/lib/product/intake";

const BASE = "https://acme.test/";

describe("normalizeProductUrl", () => {
  it("adds https to a bare domain", () => {
    expect(normalizeProductUrl("acme.test")).toBe("https://acme.test");
  });

  it("keeps an explicit protocol", () => {
    expect(normalizeProductUrl("http://acme.test/pricing")).toBe("http://acme.test/pricing");
  });

  it("returns empty for empty input", () => {
    expect(normalizeProductUrl("   ")).toBe("");
  });
});

describe("extractProductSnapshot", () => {
  it("reads Open Graph and meta fields without inventing positioning", () => {
    const html = `<!doctype html>
      <html><head>
        <title>Acme — Ship faster</title>
        <meta property="og:site_name" content="Acme" />
        <meta property="og:description" content="Acme helps teams ship &amp; measure faster." />
        <script>document.title = "Wrong title";</script>
      </head><body><h1>Ship faster</h1></body></html>`;

    const snapshot = extractProductSnapshot(html, BASE);

    expect(snapshot.name).toBe("Acme");
    expect(snapshot.description).toBe("Acme helps teams ship & measure faster.");
    expect(snapshot.valueProp).toBe("Acme helps teams ship & measure faster.");
    expect(snapshot.website).toBe(BASE);
    expect(snapshot.stage).toBe("launched");
    // Nothing is invented: these require the founder's judgment.
    expect(snapshot.problem).toBe("");
    expect(snapshot.audience).toBe("");
    expect(snapshot.audiencePain).toBe("");
    expect(snapshot.observedFields).toEqual(["name", "description", "valueProp"]);
  });

  it("falls back to a plain meta description and a title", () => {
    const html = `
      <html><head>
        <title>Beta | Calmer distribution</title>
        <meta name="description" content="A calmer way to distribute a product." />
      </head><body></body></html>`;

    const snapshot = extractProductSnapshot(html, "https://beta.test");

    expect(snapshot.name).toBe("Beta");
    expect(snapshot.description).toBe("A calmer way to distribute a product.");
  });

  it("uses a meaningful h1 when no description exists", () => {
    const html = `<html><head><title>Gamma</title></head><body>
      <h1>A calmer way to distribute your product</h1>
    </body></html>`;

    const snapshot = extractProductSnapshot(html, "https://gamma.test");

    expect(snapshot.name).toBe("Gamma");
    expect(snapshot.description).toBe("A calmer way to distribute your product");
    expect(snapshot.valueProp).toBe(snapshot.description);
  });

  it("falls back to the hostname and returns an honest empty description", () => {
    const snapshot = extractProductSnapshot("<html><head></head><body></body></html>", "https://www.example.com/path");

    expect(snapshot.name).toBe("example.com");
    expect(snapshot.description).toBe("");
    expect(snapshot.valueProp).toBe("");
    expect(snapshot.observedFields).toEqual(["name"]);
  });

  it("ignores generic titles and script/style content", () => {
    const html = `<html><head>
      <title>Home</title>
      <style>.hero { content: "Buy now"; }</style>
      <script>const description = "Fake";</script>
    </head><body></body></html>`;

    const snapshot = extractProductSnapshot(html, "https://realproduct.test");

    expect(snapshot.name).toBe("realproduct.test");
    expect(snapshot.description).toBe("");
  });
});
