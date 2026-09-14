import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 13 — the stakes on this one behavior are asymmetric and high in
 * both directions: getting it wrong one way silently exposes a staging
 * deployment to search engines (competing with real production content
 * carrying the same product names); getting it wrong the other way
 * silently de-indexes real production forever if `APP_ENV` is ever
 * misconfigured there. Both directions are pinned directly rather than
 * trusted to a single manual read of the source.
 */
describe("robots.ts — environment-aware indexing", () => {
  afterEach(() => {
    vi.resetModules();
  });

  async function loadRobotsWithAppEnv(appEnv: "development" | "staging" | "production") {
    vi.resetModules();
    vi.doMock("@/lib/env", () => ({ env: { APP_ENV: appEnv } }));
    vi.doMock("@/lib/site-url", () => ({ SITE_URL: "https://example.test" }));
    const mod = await import("@/app/robots");
    return mod.default();
  }

  it("blocks everything when APP_ENV is development (the safe default)", async () => {
    const result = await loadRobotsWithAppEnv("development");
    expect(result.rules).toEqual({ userAgent: "*", disallow: "/" });
    expect(result.sitemap).toBeUndefined();
  });

  it("blocks everything when APP_ENV is staging", async () => {
    const result = await loadRobotsWithAppEnv("staging");
    expect(result.rules).toEqual({ userAgent: "*", disallow: "/" });
  });

  it("applies the real, per-route production policy only when APP_ENV is production", async () => {
    const result = await loadRobotsWithAppEnv("production");
    expect(result.rules).toMatchObject({ userAgent: "*", allow: "/" });
    expect(result.sitemap).toBe("https://example.test/sitemap.xml");
    const disallow = Array.isArray(result.rules) ? [] : (result.rules.disallow as string[]);
    expect(disallow).toContain("/account");
    expect(disallow).toContain("/checkout");
  });
});
