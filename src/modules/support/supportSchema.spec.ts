/// <reference types="vitest/globals" />
import {
  createReportSchema,
  listMyReportsQuerySchema,
  addCommentSchema,
} from "./supportSchema";

const validCreatePayload = {
  title: "Erro ao agendar horário",
  description: "Ao confirmar o agendamento a tela fica em branco e nada é salvo.",
  category: "ERROR" as const,
};

describe("supportSchema", () => {
  it("accepts a valid create payload and applies priority default", () => {
    expect(createReportSchema.parse(validCreatePayload)).toMatchObject({
      title: validCreatePayload.title,
      category: "ERROR",
      priority: "NORMAL",
    });
  });

  it("rejects a title shorter than 5 characters", () => {
    expect(() =>
      createReportSchema.parse({ ...validCreatePayload, title: "Bug" })
    ).toThrow();
  });

  it("rejects an invalid category", () => {
    expect(() =>
      createReportSchema.parse({ ...validCreatePayload, category: "INVALID" })
    ).toThrow();
  });

  it("rejects a description longer than 4000 characters", () => {
    expect(() =>
      createReportSchema.parse({
        ...validCreatePayload,
        description: "x".repeat(4001),
      })
    ).toThrow();
  });

  it("accepts the extended user-facing categories", () => {
    for (const category of ["SUGGESTION", "FEEDBACK", "QUESTION", "BILLING", "ACCESS", "SCHEDULE"] as const) {
      expect(createReportSchema.parse({ ...validCreatePayload, category }).category).toBe(category);
    }
  });

  it("coerces list query params and applies pagination defaults", () => {
    expect(listMyReportsQuerySchema.parse({})).toMatchObject({ page: 1, limit: 10 });
    expect(listMyReportsQuerySchema.parse({ page: "2", limit: "25", status: "OPEN" })).toMatchObject({
      page: 2,
      limit: 25,
      status: "OPEN",
    });
    expect(() => listMyReportsQuerySchema.parse({ limit: 51 })).toThrow();
    expect(() => listMyReportsQuerySchema.parse({ status: "DONE" })).toThrow();
  });

  it("validates comment text bounds", () => {
    expect(addCommentSchema.parse({ text: "Poderia verificar isso?" })).toEqual({
      text: "Poderia verificar isso?",
    });
    expect(() => addCommentSchema.parse({ text: "" })).toThrow();
    expect(() => addCommentSchema.parse({ text: "x".repeat(2001) })).toThrow();
  });
});
