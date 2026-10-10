import { FastifyRequest } from "fastify";
import { requestContext } from "../requestContext";
import { assertTenantParam } from "./tenantParamGuard";

/**
 * PreHandler que valida o tenant da rota e injeta o barbershopId no
 * AsyncLocalStorage.
 * Deve rodar DEPOIS do authenticate middleware.
 * A Prisma extension lê esse valor para aplicar RLS.
 *
 * Também é o ponto do guard central de `:barbershopId` (assertTenantParam):
 * todo guard de rota (ownerGuard/staffGuard/admin) já traz este middleware,
 * então a checagem de ownership passa a valer para a rota inteira sem repetir
 * o teste em cada controller.
 */
export function setRlsContext(
  request: FastifyRequest,
  _reply: unknown,
  done: (err?: Error) => void
) {
  try {
    assertTenantParam(request);
  } catch (err) {
    done(err as Error);
    return;
  }

  const barbershopId = request.user?.barbershopId;

  if (barbershopId) {
    requestContext.run({ barbershopId }, () => {
      done();
    });
  } else {
    done();
  }
}
