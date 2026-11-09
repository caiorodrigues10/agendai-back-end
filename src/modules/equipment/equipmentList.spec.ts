import { describe, expect, it } from "vitest";
import {
  equipmentListQuerySchema,
  movementListQuerySchema,
  needListQuerySchema,
} from "./equipmentSchema";

const listSchemas = [
  { nome: "equipmentListQuerySchema", schema: equipmentListQuerySchema },
  { nome: "movementListQuerySchema", schema: movementListQuerySchema },
  { nome: "needListQuerySchema", schema: needListQuerySchema },
];

describe.each(listSchemas)("modules/equipment — $nome (paginação opcional)", ({ schema }) => {
  it("sem page/limit: aceito (comportamento atual preservado)", () => {
    expect(schema.parse({}).page).toBeUndefined();
    expect(schema.parse({}).limit).toBeUndefined();
  });

  it("com page e limit: aceito", () => {
    const parsed = schema.parse({ page: 2, limit: 25 });
    expect(parsed.page).toBe(2);
    expect(parsed.limit).toBe(25);
  });

  it("apenas limit: aceito", () => {
    expect(schema.parse({ limit: 50 }).limit).toBe(50);
  });

  it("rejeita limit acima do teto (101) → 400", () => {
    expect(() => schema.parse({ limit: 101 })).toThrow();
  });

  it("rejeita page abaixo de 1", () => {
    expect(() => schema.parse({ page: 0 })).toThrow();
  });

  it("coerce strings para número", () => {
    expect(schema.parse({ page: "3", limit: "10" })).toEqual({ page: 3, limit: 10 });
  });
});
