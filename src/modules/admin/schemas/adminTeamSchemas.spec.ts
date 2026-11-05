import { describe, expect, it } from "vitest";
import { adminTeamQuerySchema } from "./adminTeamSchemas";

describe("adminTeamQuerySchema", () => {
  it("sem query: página 1 e limite 25 (default da rota, mantido)", () => {
    const parsed = adminTeamQuerySchema.parse({});

    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(25);
    expect(parsed.search).toBeUndefined();
    expect(parsed.status).toBeUndefined();
    expect(parsed.active).toBeUndefined();
    expect(parsed.role).toBeUndefined();
    expect(parsed.sort).toBeUndefined();
  });

  it("aceita page/limit dentro do teto (o front pede limit=100)", () => {
    const parsed = adminTeamQuerySchema.parse({ page: "2", limit: "100" });

    expect(parsed.page).toBe(2);
    expect(parsed.limit).toBe(100);
  });

  it("rejeita page/limit fora do teto", () => {
    expect(() => adminTeamQuerySchema.parse({ page: "0" })).toThrow();
    expect(() => adminTeamQuerySchema.parse({ limit: "101" })).toThrow();
  });

  it("search: recorta espaços e busca vazia vira sem filtro", () => {
    expect(adminTeamQuerySchema.parse({ search: "  Caio  " }).search).toBe("Caio");
    expect(adminTeamQuerySchema.parse({ search: "   " }).search).toBeUndefined();
  });

  it("status aceita apenas active/inactive", () => {
    expect(adminTeamQuerySchema.parse({ status: "active" }).status).toBe("active");
    expect(adminTeamQuerySchema.parse({ status: "inactive" }).status).toBe("inactive");
    expect(() => adminTeamQuerySchema.parse({ status: "pending" })).toThrow();
  });

  it("active aceita apenas true/false", () => {
    expect(adminTeamQuerySchema.parse({ active: "true" }).active).toBe(true);
    expect(adminTeamQuerySchema.parse({ active: "false" }).active).toBe(false);
    expect(() => adminTeamQuerySchema.parse({ active: "1" })).toThrow();
  });

  it("role aceita os papéis da plataforma (o admin vê mais que o dono)", () => {
    expect(adminTeamQuerySchema.parse({ role: "MASTER_ADMIN" }).role).toBe(
      "MASTER_ADMIN",
    );
    expect(adminTeamQuerySchema.parse({ role: "OWNER" }).role).toBe("OWNER");
    expect(adminTeamQuerySchema.parse({ role: "EMPLOYEE" }).role).toBe("EMPLOYEE");
    expect(() => adminTeamQuerySchema.parse({ role: "root" })).toThrow();
  });

  it("role CUSTOMER é recusado (papel reservado, sem uso — só daria lista vazia)", () => {
    expect(() => adminTeamQuerySchema.parse({ role: "CUSTOMER" })).toThrow();
  });

  it("sort aceita apenas os campos da whitelist compartilhada com o dono", () => {
    expect(adminTeamQuerySchema.parse({ sort: "nome:asc" }).sort).toEqual({
      field: "nome",
      dir: "asc",
    });
    expect(adminTeamQuerySchema.parse({ sort: "email:desc" }).sort).toEqual({
      field: "email",
      dir: "desc",
    });
    expect(adminTeamQuerySchema.parse({ sort: "cargo" }).sort).toEqual({
      field: "cargo",
      dir: "asc",
    });
    expect(adminTeamQuerySchema.parse({ sort: "criado:desc" }).sort).toEqual({
      field: "criado",
      dir: "desc",
    });
  });

  it("sort inválido (campo ou direção) é rejeitado", () => {
    expect(() => adminTeamQuerySchema.parse({ sort: "password:asc" })).toThrow();
    expect(() => adminTeamQuerySchema.parse({ sort: "nome:lateral" })).toThrow();
  });
});
