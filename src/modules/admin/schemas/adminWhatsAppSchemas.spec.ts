import { describe, expect, it } from "vitest";
import {
  whatsappInstanceReasonSchema,
  whatsappPlatformSettingsPutSchema,
} from "./adminWhatsAppSchemas";

const REASON = "motivo com pelo menos dez caracteres";

describe("whatsappPlatformSettingsPutSchema", () => {
  it("aceita booleanos reais", () => {
    const parsed = whatsappPlatformSettingsPutSchema.parse({
      outboundPaused: true,
      reason: REASON,
    });
    expect(parsed.outboundPaused).toBe(true);
  });

  it("recusa string no lugar de booleano (não converte \"false\" em true)", () => {
    expect(() =>
      whatsappPlatformSettingsPutSchema.parse({
        aiGloballyEnabled: "false",
        reason: REASON,
      })
    ).toThrow();
  });

  it("recusa campos desconhecidos", () => {
    expect(() =>
      whatsappPlatformSettingsPutSchema.parse({
        outboundPaused: true,
        reason: REASON,
        extra: "não permitido",
      })
    ).toThrow();
  });

  it("exige motivo com pelo menos 10 caracteres", () => {
    expect(() =>
      whatsappPlatformSettingsPutSchema.parse({ outboundPaused: true, reason: "curto" })
    ).toThrow();
  });
});

describe("whatsappInstanceReasonSchema", () => {
  it("aceita apenas o motivo para reconectar/deslogar", () => {
    expect(whatsappInstanceReasonSchema.parse({ reason: REASON })).toEqual({
      reason: REASON,
    });
  });

  it("recusa campos de outro fluxo", () => {
    expect(() =>
      whatsappInstanceReasonSchema.parse({ reason: REASON, enabled: true })
    ).toThrow();
  });
});
