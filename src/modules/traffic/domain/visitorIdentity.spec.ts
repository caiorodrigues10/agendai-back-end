/// <reference types="vitest/globals" />
import { rateLimitHash, visitorHash } from "./visitorIdentity";

describe("identidade efêmera de visitante", () => {
  it("produz o mesmo HMAC para a mesma entrada e não expõe o IP", () => {
    const hash = visitorHash("salt", "203.0.113.10", "Mozilla/5.0");

    expect(hash).toBe(visitorHash("salt", "203.0.113.10", "Mozilla/5.0"));
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain("203.0.113.10");
    expect(hash).not.toContain("Mozilla/5.0");
  });

  it("rotaciona a identidade quando o salt diário muda", () => {
    expect(visitorHash("salt-a", "203.0.113.10", "Mozilla/5.0")).not.toBe(
      visitorHash("salt-b", "203.0.113.10", "Mozilla/5.0"),
    );
  });

  it("usa um hash distinto e estável entre réplicas para a cota por IP", () => {
    const hash = rateLimitHash("shared-daily-salt", "203.0.113.10");

    expect(hash).toHaveLength(64);
    expect(hash).not.toContain("203.0.113.10");
    expect(hash).toBe(rateLimitHash("shared-daily-salt", "203.0.113.10"));
    expect(hash).not.toBe(rateLimitHash("other-daily-salt", "203.0.113.10"));
  });
});
