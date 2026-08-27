import { Prisma } from "@prisma/client";
import { requestContext } from "@/shared/infra/http/requestContext";

/**
 * Extensão Prisma que aplica Row Level Security (RLS) automaticamente.
 * Lê o barbershopId do AsyncLocalStorage e executa SET LOCAL antes de cada query.
 *
 * - OWNER/EMPLOYEE: seta o UUID da barbearia → RLS filtra por tenant.
 * - MASTER_ADMIN / crons (sem barbershopId): seta '' → policy permite todas as linhas.
 */
export const rlsExtension = Prisma.defineExtension({
  name: "rls",
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        const store = requestContext.getStore();
        const barbershopId = store?.barbershopId ?? "";

        const { prisma } = await import("./prismaClient");

        return prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `SELECT set_config('app.current_barbershop_id', $1, true)`,
            barbershopId
          );
          return query(args);
        });
      },
    },
  },
});
