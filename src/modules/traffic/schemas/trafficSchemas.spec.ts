/// <reference types="vitest/globals" />
import { validateSchema } from "@/shared/infra/http/middlewares/validateSchema";
import {
  hasSalonAttribution,
  salonTrafficQuerySchema,
  trafficBeaconBodySchema,
  trafficReportQuerySchema,
} from "./trafficSchemas";

const NOW = new Date("2026-11-15T12:00:00.000Z");
const SHOP_UUID = "0f9d4a1c-6f6f-4d0e-9d1e-2b7a5c8e1f33";

function issuesFor(input: unknown) {
  const result = trafficReportQuerySchema.safeParse(input);
  expect(result.success).toBe(false);
  if (result.success) throw new Error("expected query validation to fail");
  return result.error.issues;
}

describe("trafficReportQuerySchema", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("preserva os defaults atuais e rejeita query desconhecida", () => {
    expect(trafficReportQuerySchema.parse({})).toEqual({
      period: "week",
      area: "all",
    });

    expect(issuesFor({ period: "day", unexpected: "value" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unrecognized_keys",
          keys: ["unexpected"],
        }),
      ]),
    );
  });

  it("aceita âncoras históricas válidas para o período correspondente", () => {
    expect(
      trafficReportQuerySchema.parse({
        period: "day",
        date: "2026-11-10",
      }),
    ).toMatchObject({ period: "day", date: "2026-11-10" });

    expect(
      trafficReportQuerySchema.parse({
        period: "month",
        month: "2026-10",
      }),
    ).toMatchObject({ period: "month", month: "2026-10" });

    expect(
      trafficReportQuerySchema.parse({
        period: "day",
        date: "2026-11-15",
      }),
    ).toMatchObject({ period: "day", date: "2026-11-15" });

    expect(
      trafficReportQuerySchema.parse({
        period: "month",
        month: "2026-11",
      }),
    ).toMatchObject({ period: "month", month: "2026-11" });
  });

  it("rejeita datas e meses que não existem no calendário", () => {
    expect(issuesFor({ period: "day", date: "2026-02-30" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["date"],
          message: "date deve ser uma data de calendário válida",
        }),
      ]),
    );

    expect(issuesFor({ period: "day", date: "2026-1-01" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["date"],
          message: "date deve estar no formato YYYY-MM-DD",
        }),
      ]),
    );

    expect(issuesFor({ period: "month", month: "2026-13" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["month"],
          message: "month deve ser um mês de calendário válido",
        }),
      ]),
    );

    expect(issuesFor({ period: "month", month: "2026-00" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["month"],
          message: "month deve ser um mês de calendário válido",
        }),
      ]),
    );
  });

  it("rejeita data e mês futuros em São Paulo", () => {
    expect(issuesFor({ period: "day", date: "2026-11-16" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["date"],
          message: "date não pode ser uma data futura",
        }),
      ]),
    );

    expect(issuesFor({ period: "month", month: "2026-12" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["month"],
          message: "month não pode ser um mês futuro",
        }),
      ]),
    );
  });

  it("converte âncora inválida em resposta de validação 400", async () => {
    const request = { query: { period: "day", date: "2026-02-30" } };
    const reply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    await validateSchema(trafficReportQuerySchema, "query")(
      request as never,
      reply as never,
    );

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: "Dados inválidos",
        details: expect.arrayContaining([
          expect.objectContaining({
            field: "date",
            message: "date deve ser uma data de calendário válida",
          }),
        ]),
      }),
    );
  });

  it("rejeita âncoras mutuamente exclusivas ou ligadas ao período errado", () => {
    expect(
      issuesFor({
        period: "day",
        date: "2026-11-10",
        month: "2026-10",
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["date"],
          message: "date e month são mutuamente exclusivos",
        }),
        expect.objectContaining({
          path: ["month"],
          message: "month só pode ser usado com period=month",
        }),
      ]),
    );

    expect(issuesFor({ period: "week", date: "2026-11-10" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["date"],
          message: "date só pode ser usado com period=day",
        }),
      ]),
    );

    expect(issuesFor({ period: "day", month: "2026-10" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["month"],
          message: "month só pode ser usado com period=month",
        }),
      ]),
    );
  });
});

describe("trafficBeaconBodySchema", () => {
  function beaconIssues(input: unknown) {
    const result = trafficBeaconBodySchema.safeParse(input);
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected beacon validation to fail");
    return result.error.issues;
  }

  it("mantém o ping global legado {p,r} e remove campos desconhecidos", () => {
    const result = trafficBeaconBodySchema.parse({
      p: "/app-para-agendamento-de-salao",
      r: "www.google.com.br",
      token: "secret",
      manageToken: "secret",
      userId: "abc",
    });

    expect(result).toEqual({ p: "/app-para-agendamento-de-salao", r: "www.google.com.br" });
    expect(hasSalonAttribution(result)).toBe(false);
  });

  it("aceita o ping de salão completo e o marca como atribuição", () => {
    const result = trafficBeaconBodySchema.parse({
      p: "/queue/:id",
      salon: SHOP_UUID,
      salonType: "id",
      kind: "visit",
      tab: "queue",
    });

    expect(result).toMatchObject({
      p: "/queue/:id",
      salon: SHOP_UUID,
      salonType: "id",
      kind: "visit",
      tab: "queue",
    });
    expect(hasSalonAttribution(result)).toBe(true);
  });

  it("aceita as três rotas públicas de salão", () => {
    for (const p of ["/queue/:id", "/queue/:id/produtos/:productId", "/s/:slug"]) {
      const result = trafficBeaconBodySchema.safeParse({
        p,
        salon: SHOP_UUID,
        salonType: "id",
        kind: "visit",
      });
      expect(result.success).toBe(true);
    }
  });

  it("exige salon, salonType e kind juntos", () => {
    expect(beaconIssues({ p: "/queue/:id", salonType: "id", kind: "visit" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["salon"] }),
      ]),
    );
    expect(beaconIssues({ p: "/queue/:id", salon: SHOP_UUID, kind: "visit" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["salonType"] }),
      ]),
    );
    expect(beaconIssues({ p: "/queue/:id", salon: SHOP_UUID, salonType: "id" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["kind"] }),
      ]),
    );
  });

  it("descarta o ping quando o kind está fora da allowlist", () => {
    expect(beaconIssues({ p: "/queue/:id", salon: SHOP_UUID, salonType: "id", kind: "VIEW" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["kind"] }),
      ]),
    );
  });

  it("descarta o ping quando salonType está fora da allowlist", () => {
    expect(beaconIssues({ p: "/queue/:id", salon: SHOP_UUID, salonType: "uuid", kind: "visit" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["salonType"] }),
      ]),
    );
  });

  it("descarta o ping quando o salon não corresponde à forma do salonType", () => {
    // slug declarado, UUID enviado
    expect(beaconIssues({ p: "/s/:slug", salon: SHOP_UUID, salonType: "slug", kind: "visit" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["salon"] }),
      ]),
    );
    // id declarado, slug enviado
    expect(beaconIssues({ p: "/queue/:id", salon: "acme-barbearia", salonType: "id", kind: "visit" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["salon"] }),
      ]),
    );
  });

  it("descarta o ping com salon fora do charset ou do tamanho máximo", () => {
    expect(beaconIssues({ p: "/queue/:id", salon: "acme barbearia", salonType: "slug", kind: "visit" })).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ["salon"] })]),
    );
    expect(beaconIssues({ p: "/queue/:id", salon: "a".repeat(101), salonType: "slug", kind: "visit" })).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ["salon"] })]),
    );
  });

  it("descarta o ping de salão em rota que não é de salão", () => {
    expect(beaconIssues({ p: "/planos", salon: SHOP_UUID, salonType: "id", kind: "visit" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["p"] }),
      ]),
    );
  });

  it("descarta /queue/:id sem atribuição (rota de salão sem salon)", () => {
    expect(beaconIssues({ p: "/queue/:id" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["p"] }),
      ]),
    );
    expect(beaconIssues({ p: "/queue/:id/produtos/:productId" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["p"] }),
      ]),
    );
  });

  it("mantém /s/:slug sem atribuição como ping anônimo legado", () => {
    const result = trafficBeaconBodySchema.parse({ p: "/s/:slug" });
    expect(result).toEqual({ p: "/s/:slug" });
    expect(hasSalonAttribution(result)).toBe(false);
  });

  it("trata tab fora da allowlist como ausente (sem descartar o ping)", () => {
    const result = trafficBeaconBodySchema.parse({
      p: "/queue/:id",
      salon: SHOP_UUID,
      salonType: "id",
      kind: "visit",
      tab: "admin",
    });

    expect(result.tab).toBeUndefined();
    expect(hasSalonAttribution(result)).toBe(true);
  });
});

describe("salonTrafficQuerySchema", () => {
  it("aceita apenas o período do contrato", () => {
    for (const period of ["day", "week", "month", "3m", "year"]) {
      expect(salonTrafficQuerySchema.parse({ period })).toEqual({ period });
    }
  });

  it("rejeita período inválido, ausente ou com parâmetros extras", () => {
    expect(salonTrafficQuerySchema.safeParse({ period: "all" }).success).toBe(false);
    expect(salonTrafficQuerySchema.safeParse({ period: "6m" }).success).toBe(false);
    expect(salonTrafficQuerySchema.safeParse({}).success).toBe(false);
    expect(
      salonTrafficQuerySchema.safeParse({ period: "week", date: "2026-11-10" }).success,
    ).toBe(false);
    expect(
      salonTrafficQuerySchema.safeParse({ period: "week", area: "all" }).success,
    ).toBe(false);
  });

  it("converte query inválida em resposta de validação 400", async () => {
    const request = { query: { period: "all" } };
    const reply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    await validateSchema(salonTrafficQuerySchema, "query")(
      request as never,
      reply as never,
    );

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: "Dados inválidos",
        details: expect.arrayContaining([
          expect.objectContaining({ field: "period" }),
        ]),
      }),
    );
  });
});
