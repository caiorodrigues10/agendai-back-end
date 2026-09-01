import { describe, expect, it } from "vitest";
import {
  salonClientCrmKey,
  salonClientDisplayName,
  salonClientPublicWhatsapp,
  salonClientWhatsappKey,
  upsertSalonClientRecord,
} from "./ensureSalonClient";
import { STAFF_QUEUE_PLACEHOLDER_WHATSAPP } from "@/modules/queue/utils/queueDuplicate";

describe("salonClientWhatsappKey", () => {
  it("normaliza DDD + celular", () => {
    expect(salonClientWhatsappKey("(11) 98888-7777")).toBe("11988887777");
  });

  it("ignora placeholder da fila", () => {
    expect(salonClientWhatsappKey(STAFF_QUEUE_PLACEHOLDER_WHATSAPP)).toBeNull();
  });

  it("remove DDI 55", () => {
    expect(salonClientWhatsappKey("5511988887777")).toBe("11988887777");
  });
});

describe("salonClientCrmKey", () => {
  it("usa o telefone quando é válido", () => {
    expect(salonClientCrmKey("(11) 98888-7777", "Caio Rodrigues")).toBe("11988887777");
  });

  it("não une pessoas por nome quando a fila não tem WhatsApp", () => {
    expect(salonClientCrmKey(STAFF_QUEUE_PLACEHOLDER_WHATSAPP, "Caio Rodrigues")).toBeNull();
  });

  it("retorna null sem telefone válido", () => {
    expect(salonClientCrmKey("", "Maria da Conceicao Silva Extra")).toBeNull();
  });
});

describe("salonClientPublicWhatsapp", () => {
  it("esconde chave sintética", () => {
    expect(salonClientPublicWhatsapp("np:caiorodrigues")).toBe("");
    expect(salonClientPublicWhatsapp("11988887777")).toBe("11988887777");
  });
});

describe("salonClientDisplayName", () => {
  it("exige pelo menos 2 caracteres", () => {
    expect(salonClientDisplayName(" A ")).toBeNull();
    expect(salonClientDisplayName("Caio Rodrigues")).toBe("Caio Rodrigues");
  });
});

describe("upsertSalonClientRecord", () => {
  it("cria ou atualiza cliente pelo telefone normalizado", async () => {
    const store = new Map<string, { id: string; name: string; whatsapp: string }>();
    const db = {
      salonClient: {
        findFirst: async (args: { where: { normalizedWhatsapp: string } }) => store.get(args.where.normalizedWhatsapp) ? { id: "c1" } : null,
        create: async (args: { data: { name: string; whatsapp: string; normalizedWhatsapp: string } }) => { const created = { id: "c1", name: args.data.name, whatsapp: args.data.whatsapp }; store.set(args.data.normalizedWhatsapp, created); return { id: created.id }; },
        update: async (args: { data: { name: string } }) => { const existing = store.get("11988887777")!; existing.name = args.data.name; return { id: existing.id }; },
      },
    };

    const first = await upsertSalonClientRecord(
      db,
      "shop-1",
      "Caio Rodrigues",
      "11988887777"
    );
    const second = await upsertSalonClientRecord(
      db,
      "shop-1",
      "Caio Rodrigues",
      "11988887777"
    );
    expect(first).toEqual({ id: "c1" });
    expect(second).toEqual({ id: "c1" });
    expect(store.get("11988887777")?.name).toBe("Caio Rodrigues");
  });
});
