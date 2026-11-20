import { describe, expect, it } from "vitest";
import {
  addDaysToCivilDate,
  assertDemoShowcaseSeedAllowed,
  civilDateToUtcDate,
  demoShowcaseBusinessEmails,
  demoShowcaseUuid,
  saoPauloCivilDate,
} from "./demoShowcaseSeed";
import type { DemoShowcaseManifestBusiness } from "./demoShowcaseAssets";

const LOCAL_ENV: NodeJS.ProcessEnv = {
  SEED_DEMO: "true",
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://user:pass@localhost:5442/agendai",
  DIRECT_URL: "postgresql://user:pass@localhost:5442/agendai",
};

const business: DemoShowcaseManifestBusiness = {
  id: "barbearia",
  segmento: "BARBERSHOP",
  pasta: "Barbearia",
  logo: "logo.png",
  banner: "banner.png",
  confirmar: true,
  extras: [],
};

describe("demoShowcaseSeed — UUIDs determinísticos", () => {
  it("gera UUID válido e estável para a mesma chave", () => {
    const first = demoShowcaseUuid("d1a0b001", "demo-showcase:shop:barbearia");
    const second = demoShowcaseUuid("d1a0b001", "demo-showcase:shop:barbearia");
    expect(first).toBe(second);
    expect(first).toMatch(
      /^[0-9a-f]{8}-5000-4000-8000-[0-9a-f]{12}$/u,
    );
  });

  it("gera UUIDs diferentes por namespace e por chave", () => {
    const shop = demoShowcaseUuid("d1a0b001", "demo-showcase:shop:barbearia");
    const owner = demoShowcaseUuid("d1a0b002", "demo-showcase:shop:barbearia");
    const other = demoShowcaseUuid("d1a0b001", "demo-showcase:shop:cilios");
    expect(shop).not.toBe(owner);
    expect(shop).not.toBe(other);
  });

  it("rejeita namespace que não seja hex de 8 dígitos", () => {
    expect(() => demoShowcaseUuid("nope", "key")).toThrow(/Namespace de UUID inválido/u);
    expect(() => demoShowcaseUuid("d1a0b00", "key")).toThrow(/Namespace de UUID inválido/u);
  });
});

describe("demoShowcaseSeed — datas de São Paulo", () => {
  it("converte instante UTC para a data civil em America/Sao_Paulo", () => {
    // 02:00 UTC = 23:00 do dia anterior em São Paulo (UTC-3).
    expect(saoPauloCivilDate(new Date("2026-06-10T02:00:00.000Z"))).toBe("2026-06-09");
    expect(saoPauloCivilDate(new Date("2026-06-10T12:00:00.000Z"))).toBe("2026-06-10");
  });

  it("soma dias na data civil atravessando mês e ano", () => {
    expect(addDaysToCivilDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToCivilDate("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDaysToCivilDate("2026-06-10", 0)).toBe("2026-06-10");
  });

  it("gera Date à meia-noite UTC para a data civil (@db.Date do Prisma)", () => {
    const date = civilDateToUtcDate("2026-06-10");
    expect(date.toISOString()).toBe("2026-06-10T00:00:00.000Z");
  });

  it("hoje e amanhã são dias consecutivos", () => {
    const today = saoPauloCivilDate(new Date());
    const tomorrow = addDaysToCivilDate(today, 1);
    expect(tomorrow > today).toBe(true);
    expect(civilDateToUtcDate(tomorrow).getTime() - civilDateToUtcDate(today).getTime()).toBe(
      24 * 60 * 60 * 1000,
    );
  });
});

describe("demoShowcaseSeed — e-mails dos tenants demo", () => {
  it("gera 3 e-mails ASCII (dono + 2 profissionais) e estáveis", () => {
    const emails = demoShowcaseBusinessEmails(business);
    expect(emails).toHaveLength(3);
    expect(emails[0]).toBe("demo+owner.barbearia@agendai.local");
    expect(emails[1]).toMatch(/^demo\+staff\.barbearia\.[01]@agendai\.local$/u);
    for (const email of emails) {
      expect(email).toMatch(/^[\x20-\x7E]+$/u); // sem Unicode
      expect(email).toBe(email.toLowerCase());
    }
    expect(new Set(demoShowcaseBusinessEmails(business)).size).toBe(3);
  });

  it("não colide com outro negócio do manifesto", () => {
    const other: DemoShowcaseManifestBusiness = { ...business, id: "cilios" };
    const emails = new Set([...demoShowcaseBusinessEmails(business), ...demoShowcaseBusinessEmails(other)]);
    expect(emails.size).toBe(6);
  });
});

describe("demoShowcaseSeed — guardas de ambiente", () => {
  it("recusa sem SEED_DEMO=true", () => {
    expect(() =>
      assertDemoShowcaseSeedAllowed({ ...LOCAL_ENV, SEED_DEMO: undefined }),
    ).toThrow(/exige SEED_DEMO=true/u);
  });

  it("recusa NODE_ENV=production", () => {
    expect(() =>
      assertDemoShowcaseSeedAllowed({ ...LOCAL_ENV, NODE_ENV: "production" }),
    ).toThrow(/produção/u);
  });

  it("recusa banco cujo nome parece produção", () => {
    expect(() =>
      assertDemoShowcaseSeedAllowed({
        ...LOCAL_ENV,
        DATABASE_URL: "postgresql://user:pass@localhost:5442/agendai_prod",
        DIRECT_URL: "postgresql://user:pass@localhost:5442/agendai_prod",
      }),
    ).toThrow(/produção/u);
  });

  it("recusa sem DATABASE_URL/DIRECT_URL", () => {
    expect(() =>
      assertDemoShowcaseSeedAllowed({ ...LOCAL_ENV, DIRECT_URL: undefined }),
    ).toThrow(/exige DATABASE_URL e DIRECT_URL/u);
  });

  it("recusa quando DATABASE_URL e DIRECT_URL apontam para bancos diferentes", () => {
    expect(() =>
      assertDemoShowcaseSeedAllowed({
        ...LOCAL_ENV,
        DIRECT_URL: "postgresql://user:pass@localhost:5442/agendai_db",
      }),
    ).toThrow(/bancos diferentes/u);
  });

  it("recusa host de banco externo", () => {
    expect(() =>
      assertDemoShowcaseSeedAllowed({
        ...LOCAL_ENV,
        DATABASE_URL: "postgresql://user:pass@db.externo.example.com:5432/agendai",
        DIRECT_URL: "postgresql://user:pass@db.externo.example.com:5432/agendai",
      }),
    ).toThrow(/Host de banco não permitido/u);
  });

  it("recusa nome de banco fora da lista local", () => {
    expect(() =>
      assertDemoShowcaseSeedAllowed({
        ...LOCAL_ENV,
        DATABASE_URL: "postgresql://user:pass@localhost:5442/outrobanco",
        DIRECT_URL: "postgresql://user:pass@localhost:5442/outrobanco",
      }),
    ).toThrow(/Banco não permitido/u);
  });

  it("aceita banco local agendai com SEED_DEMO=true", () => {
    expect(() => assertDemoShowcaseSeedAllowed({ ...LOCAL_ENV })).not.toThrow();
  });
});
