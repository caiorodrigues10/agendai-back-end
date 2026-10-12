/// <reference types="vitest/globals" />
import type { FastifyRequest } from "fastify";
import { setRlsContext } from "./setRlsContext";

type User = { id?: string; role?: string; barbershopId?: string | null };

const SHOP_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const SHOP_B = "bbbbbbbb-0000-4000-8000-00000000000b";

function runGuard(options: {
  user?: User;
  params?: Record<string, string>;
  config?: { tenantParamGuard?: boolean };
}): { error?: Error; context?: unknown } {
  const request = {
    user: options.user,
    params: options.params ?? {},
    routeOptions: { config: options.config ?? {} },
  } as unknown as FastifyRequest;

  let error: Error | undefined;
  setRlsContext(request, {} as never, (err?: Error) => {
    error = err;
  });

  return { error };
}

describe("guard central de tenant em :barbershopId (setRlsContext)", () => {
  it("recusa 403 quando o :barbershopId da URL não é o salão da sessão", () => {
    const { error } = runGuard({
      user: { id: "u1", role: "OWNER", barbershopId: SHOP_A },
      params: { barbershopId: SHOP_B },
    });

    expect(error).toBeDefined();
    expect((error as { statusCode?: number }).statusCode).toBe(403);
  });

  it("recusa 403 para sessão sem salão tentando acessar um salão pela URL", () => {
    const { error } = runGuard({
      user: { id: "u2", role: "EMPLOYEE", barbershopId: null as never },
      params: { barbershopId: SHOP_A },
    });

    expect(error).toBeDefined();
    expect((error as { statusCode?: number }).statusCode).toBe(403);
  });

  it("permite quando o :barbershopId é o salão da sessão", () => {
    const { error } = runGuard({
      user: { id: "u1", role: "OWNER", barbershopId: SHOP_A },
      params: { barbershopId: SHOP_A },
    });

    expect(error).toBeUndefined();
  });

  it("MASTER_ADMIN continua podendo operar qualquer salão", () => {
    const { error } = runGuard({
      user: { id: "m1", role: "MASTER_ADMIN", barbershopId: null as never },
      params: { barbershopId: SHOP_B },
    });

    expect(error).toBeUndefined();
  });

  it("rota pública (sem usuário) não é bloqueada pelo guard", () => {
    const { error } = runGuard({ params: { barbershopId: SHOP_B } });

    expect(error).toBeUndefined();
  });

  it("rota com config.tenantParamGuard=false fica isenta (ex.: org detach)", () => {
    const { error } = runGuard({
      user: { id: "u1", role: "OWNER", barbershopId: SHOP_A },
      params: { barbershopId: SHOP_B },
      config: { tenantParamGuard: false },
    });

    expect(error).toBeUndefined();
  });

  it("rotas sem :barbershopId seguem inalteradas", () => {
    const { error } = runGuard({
      user: { id: "u1", role: "OWNER", barbershopId: SHOP_A },
      params: { id: "qualquer" },
    });

    expect(error).toBeUndefined();
  });
});
