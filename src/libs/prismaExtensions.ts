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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const rlsExtension: any = Prisma.defineExtension({
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

/**
 * Transação de negócio com RLS habilitado na MESMA conexão.
 *
 * A extensão acima roteia cada operação de modelo para um `prisma.$transaction`
 * próprio (outra conexão do pool). Isso é seguro para operações isoladas, mas
 * dentro de uma transação interativa que segura `SELECT ... FOR UPDATE` causa
 * deadlock: a escrita roteada espera pela trava desta transação, o timeout de 5s
 * estoura e o commit vira P2028 "Transaction already closed" (verificado em
 * 2026-10-01: adjust/sale/receipt retornando 500; mesmo motivo documentado em
 * `productReservationRepository.createReserved`).
 *
 * Usa `insideRlsTx` para a extensão NÃO rerotear as operações do `tx` e seta o
 * GUC de RLS uma única vez no início da transação (escopo local ao tx).
 * Uso: `rlsTransaction(async (tx) => { ... })` — sempre com `tx.*` por dentro;
 * qualquer uso do `prisma` global dentro do callback escapa da transação.
 */
export async function rlsTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  const barbershopId = requestContext.getStore()?.barbershopId ?? "";
  const { prisma } = await import("./prismaClient");

  return insideRlsTx.run(true, () =>
    prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`
        SELECT set_config('app.current_barbershop_id', ${barbershopId}, TRUE)
      `;
      return fn(tx);
    })
  );
}
