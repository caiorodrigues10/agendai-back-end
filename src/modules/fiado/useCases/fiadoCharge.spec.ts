import { describe, expect, it } from "vitest";
import { chargeFiadoSchema } from "../schemas/fiadoSchemas";
import { buildFiadoChargeMessage } from "./fiadoUseCases";

describe("cobrança de fiado", () => {
  it("monta uma mensagem curta com valor e PIX", () => {
    const message = buildFiadoChargeMessage("João", 45.5, "corte", {
      pixKey: "11999999999",
    });

    expect(message).toContain("João");
    expect(message).toContain("R$\u00a045,50");
    expect(message).toContain("PIX: 11999999999");
    expect(message.length).toBeLessThan(300);
  });

  it("exige ao menos uma forma de pagamento", () => {
    expect(() => chargeFiadoSchema.parse({ pixKey: "", cardPaymentLink: "" })).toThrow();
    expect(
      chargeFiadoSchema.parse({ cardPaymentLink: "https://pagamento.example/123" })
    ).toMatchObject({ cardPaymentLink: "https://pagamento.example/123" });
  });
});
