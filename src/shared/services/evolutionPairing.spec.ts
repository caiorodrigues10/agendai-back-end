import { describe, expect, it } from "vitest";
import { extractPairingCode } from "./evolutionApiService";

describe("extractPairingCode", () => {
  it("lê pairingCode no objeto raiz", () => {
    expect(extractPairingCode({ pairingCode: "WZYEH1YY", code: "2@abc" })).toBe("WZYEH1YY");
  });

  it("aceita hífen e normaliza para maiúsculas", () => {
    expect(extractPairingCode({ pairingCode: "abcd-efgh" })).toBe("ABCD-EFGH");
  });

  it("lê array de respostas da Evolution", () => {
    expect(
      extractPairingCode([{ pairingCode: "FNPG5AYK", code: "2@x", count: 1 }])
    ).toBe("FNPG5AYK");
  });

  it("ignora token Baileys em code", () => {
    expect(extractPairingCode({ code: "2@y8eK+bjtEjUWy9" })).toBeNull();
  });
});
