/// <reference types="vitest/globals" />
import {
  DEFAULT_IGNORED_HOSTS,
  hostFromUrl,
  isBotUserAgent,
  isIgnoredHost,
  isOriginAllowed,
  isPrefetch,
  isPrivacyOptOut,
  normalizeOriginHost,
  referrerHostFromValue,
} from "./trafficExclusions";

describe("regras de privacidade e exclusão do beacon", () => {
  it("reconhece bots, crawlers, headless e user-agent vazio", () => {
    expect(isBotUserAgent("Googlebot/2.1")).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 HeadlessChrome/120")).toBe(true);
    expect(isBotUserAgent("curl/8.5.0")).toBe(true);
    expect(isBotUserAgent("python-requests/2.32")).toBe(true);
    expect(isBotUserAgent("")).toBe(true);
    expect(isBotUserAgent(undefined)).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 (Macintosh) Chrome/126 Safari/537.36")).toBe(false);
  });

  it("honora DNT e Global Privacy Control", () => {
    expect(isPrivacyOptOut({ dnt: "1" })).toBe(true);
    expect(isPrivacyOptOut({ "sec-gpc": "1" })).toBe(true);
    expect(isPrivacyOptOut({ dnt: "0", "sec-gpc": "0" })).toBe(false);
    expect(isPrivacyOptOut({})).toBe(false);
  });

  it("reconhece prefetch e prerender", () => {
    expect(isPrefetch({ "sec-purpose": "prefetch" })).toBe(true);
    expect(isPrefetch({ purpose: "prefetch;prerender" })).toBe(true);
    expect(isPrefetch({ "x-purpose": "prefetch" })).toBe(true);
    expect(isPrefetch({ "sec-purpose": "prerender" })).toBe(true);
    expect(isPrefetch({ purpose: "prerender" })).toBe(true);
    expect(isPrefetch({ "sec-purpose": "analytics" })).toBe(false);
  });

  it("aceita somente origens explicitamente permitidas", () => {
    const allowed = ["https://app.example.com"];
    expect(isOriginAllowed("https://app.example.com", allowed)).toBe(true);
    expect(isOriginAllowed("https://evil.example.com", allowed)).toBe(false);
    expect(isOriginAllowed("null", allowed)).toBe(false);
    expect(isOriginAllowed(undefined, allowed)).toBe(false);
    expect(isOriginAllowed("https://app.example.com", [])).toBe(false);
  });

  it("mantém Origin estrito e rejeita um hostname sem esquema", () => {
    expect(isOriginAllowed("app.example.com", ["https://app.example.com"])).toBe(false);
    expect(isOriginAllowed("app.example.com", ["app.example.com"])).toBe(false);
    expect(hostFromUrl("app.example.com")).toBeNull();
  });

  it("ignora hosts locais/test e hosts extras sem registrar o path", () => {
    expect(isIgnoredHost("localhost", DEFAULT_IGNORED_HOSTS)).toBe(true);
    expect(isIgnoredHost("api.localhost", DEFAULT_IGNORED_HOSTS)).toBe(true);
    expect(isIgnoredHost("app.example.test", DEFAULT_IGNORED_HOSTS)).toBe(true);
    expect(isIgnoredHost("staging.example.com", ["staging.example.com"])).toBe(true);
    expect(isIgnoredHost("www.example.com", ["staging.example.com"])).toBe(false);
  });

  it("extrai somente o host e normaliza o valor persistível", () => {
    expect(hostFromUrl("https://example.com/path?token=secret")).toBe("example.com");
    expect(hostFromUrl("/relative/path")).toBeNull();
    expect(hostFromUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeOriginHost("  EXAMPLE.COM  ")).toBe("example.com");
    expect(normalizeOriginHost("")).toBeNull();
    expect(normalizeOriginHost("x".repeat(300))).toHaveLength(255);
  });

  it("aceita referrer por hostname ou URL absoluta sem vazar path e query", () => {
    const fromUrl = referrerHostFromValue(
      "https://example.com/path?token=super-secret",
    );
    const fromHostname = referrerHostFromValue("example.com");

    expect(fromUrl).toBe("example.com");
    expect(fromHostname).toBe(fromUrl);
    expect(referrerHostFromValue("EXAMPLE.COM")).toBe("example.com");
    expect(referrerHostFromValue("/relative/path")).toBeNull();
    expect(referrerHostFromValue("example.com/path")).toBeNull();
    expect(referrerHostFromValue("example.com?token=super-secret")).toBeNull();
    expect(referrerHostFromValue("not a hostname")).toBeNull();
    expect(referrerHostFromValue("javascript:alert(1)")).toBeNull();
  });
});
