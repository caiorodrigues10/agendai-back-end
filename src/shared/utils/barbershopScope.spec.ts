import { describe, expect, it } from "vitest";
import { resolveBarbershopId } from "./barbershopScope";

describe("resolveBarbershopId (escopo de salão em listagens)", () => {
  const master = { role: "MASTER_ADMIN", barbershopId: null };
  const masterComSessao = { role: "MASTER_ADMIN", barbershopId: "shop-sessao" };
  const owner = { role: "OWNER", barbershopId: "shop-a" };
  const employee = { role: "EMPLOYEE", barbershopId: "shop-a" };

  it("MASTER_ADMIN usa barbershopId da query (acesso cross-salão)", () => {
    expect(resolveBarbershopId(master, "shop-b")).toBe("shop-b");
  });

  it("MASTER_ADMIN sem barbershopId na query lança 400", () => {
    expect(() => resolveBarbershopId(master, null)).toThrow(
      "barbershopId é obrigatório",
    );
    expect(() => resolveBarbershopId(master, undefined)).toThrow(
      "barbershopId é obrigatório",
    );
  });

  it("MASTER_ADMIN não cai para o salão da sessão (semântica original)", () => {
    expect(() => resolveBarbershopId(masterComSessao, null)).toThrow(
      "barbershopId é obrigatório",
    );
    expect(resolveBarbershopId(masterComSessao, "shop-b")).toBe("shop-b");
  });

  it("OWNER ignora barbershopId de outro salão na query", () => {
    expect(resolveBarbershopId(owner, "shop-b")).toBe("shop-a");
  });

  it("EMPLOYEE ignora barbershopId de outro salão na query", () => {
    expect(resolveBarbershopId(employee, "shop-b")).toBe("shop-a");
  });

  it("OWNER sem barbershopId na sessão lança 400 mesmo com query", () => {
    const semLoja = { role: "OWNER", barbershopId: null };
    expect(() => resolveBarbershopId(semLoja, "shop-b")).toThrow(
      "barbershopId é obrigatório",
    );
  });

  it("query vazia é tratada como ausente", () => {
    expect(() => resolveBarbershopId(master, "")).toThrow(
      "barbershopId é obrigatório",
    );
  });
});
