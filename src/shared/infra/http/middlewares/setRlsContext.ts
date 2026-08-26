import { FastifyRequest } from "fastify";
import { requestContext } from "../requestContext";

/**
 * PreHandler que injeta o barbershopId no AsyncLocalStorage.
 * Deve rodar DEPOIS do authenticate middleware.
 * A Prisma extension lê esse valor para aplicar RLS.
 */
export function setRlsContext(request: FastifyRequest, _reply: unknown, done: () => void) {
  const barbershopId = request.user?.barbershopId;

  if (barbershopId) {
    requestContext.run({ barbershopId }, () => {
      done();
    });
  } else {
    done();
  }
}
