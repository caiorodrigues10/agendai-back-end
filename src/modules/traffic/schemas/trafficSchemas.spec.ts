/// <reference types="vitest/globals" />
import { validateSchema } from "@/shared/infra/http/middlewares/validateSchema";
import { trafficReportQuerySchema } from "./trafficSchemas";

const NOW = new Date("2026-11-15T12:00:00.000Z");

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
