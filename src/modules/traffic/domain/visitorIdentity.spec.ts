/// <reference types="vitest/globals" />
import { ephemeralHash, visitorHash } from "./visitorIdentity";

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

  it("usa um hash local distinto para a cota por IP", () => {
    const hash = ephemeralHash("process-salt", "203.0.113.10");

    expect(hash).toHaveLength(64);
    expect(hash).not.toContain("203.0.113.10");
    expect(hash).toBe(ephemeralHash("process-salt", "203.0.113.10"));
    expect(hash).not.toBe(ephemeralHash("other-process-salt", "203.0.113.10"));
  });
});
