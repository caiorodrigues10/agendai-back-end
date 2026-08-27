import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma } from "@prisma/client";
import { requestContext } from "@/shared/infra/http/requestContext";

function modelDelegateKey(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/** Evita reentrar a extensão quando a query já roda no `tx` (loop infinito). */
const insideRlsTx = new AsyncLocalStorage<boolean>();

/**
 * Extensão Prisma que aplica Row Level Security (RLS) automaticamente.
 * Lê o barbershopId do AsyncLocalStorage e executa SET LOCAL na mesma
 * transação da query (connection pool + adapter-pg).
 *
 * - OWNER/EMPLOYEE: UUID da barbearia → RLS filtra por tenant.
 * - Login / público / MASTER_ADMIN / crons (sem barbershopId): '' → policy libera.
 *
 * NÃO usar `query(args)` solto dentro de `$transaction(async tx => …)`:
 * isso roda em outra conexão do pool e o SET LOCAL não vale — login de OWNER
 * vira 401 "Credenciais inválidas" (usuário invisível).
 */
export const rlsExtension = Prisma.defineExtension({
  name: "rls",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (insideRlsTx.getStore()) {
          return query(args);
        }

        const barbershopId = requestContext.getStore()?.barbershopId ?? "";
        const { prisma } = await import("./prismaClient");

        return insideRlsTx.run(true, () =>
          prisma.$transaction(async (tx: any) => {
            await tx.$executeRaw`
              SELECT set_config('app.current_barbershop_id', ${barbershopId}, TRUE)
            `;
            const key = modelDelegateKey(String(model));
            const delegate = tx[key];
            if (!delegate || typeof delegate[operation] !== "function") {
              return query(args);
            }
            return delegate[operation](args);
          })
        );
      },
    },
  },
});
