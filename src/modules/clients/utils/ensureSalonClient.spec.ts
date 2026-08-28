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

  it("gera chave por nome quando a fila não tem WhatsApp", () => {
    expect(salonClientCrmKey(STAFF_QUEUE_PLACEHOLDER_WHATSAPP, "Caio Rodrigues")).toBe(
      "np:caiorodrigues"
    );
  });

  it("cabe em VarChar(20)", () => {
    const key = salonClientCrmKey("", "Maria da Conceicao Silva Extra");
    expect(key).toBeTruthy();
    expect(key!.length).toBeLessThanOrEqual(20);
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
  it("cria cliente sem WhatsApp pela chave de nome", async () => {
    const store = new Map<string, { id: string; name: string; whatsapp: string }>();
    const db = {
      salonClient: {
        upsert: async (args: {
          where: { barbershopId_whatsapp: { barbershopId: string; whatsapp: string } };
          create: { barbershopId: string; name: string; whatsapp: string };
          update: { name: string };
        }) => {
          const key = args.where.barbershopId_whatsapp.whatsapp;
          const existing = store.get(key);
          if (existing) {
            existing.name = args.update.name;
            return { id: existing.id };
          }
          const created = { id: "c1", name: args.create.name, whatsapp: args.create.whatsapp };
          store.set(key, created);
          return { id: created.id };
        },
      },
    };

    const first = await upsertSalonClientRecord(
      db,
      "shop-1",
      "Caio Rodrigues",
      STAFF_QUEUE_PLACEHOLDER_WHATSAPP
    );
    const second = await upsertSalonClientRecord(
      db,
      "shop-1",
      "Caio Rodrigues",
      STAFF_QUEUE_PLACEHOLDER_WHATSAPP
    );
    expect(first).toEqual({ id: "c1" });
    expect(second).toEqual({ id: "c1" });
    expect(store.get("np:caiorodrigues")?.name).toBe("Caio Rodrigues");
  });
});
