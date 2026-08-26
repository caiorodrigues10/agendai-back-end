import { AsyncLocalStorage } from "node:async_hooks";

interface RequestContext {
  barbershopId?: string;
}

/**
 * Armazena o barbershopId da request atual via AsyncLocalStorage.
 * A Prisma extension lê esse valor para aplicar RLS automaticamente.
 */
export const requestContext = new AsyncLocalStorage<RequestContext>();
