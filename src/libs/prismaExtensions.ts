import { Prisma } from "@prisma/client";
import { requestContext } from "@/shared/infra/http/requestContext";

/**
 * Extensão Prisma que aplica Row Level Security (RLS) automaticamente.
 * Lê o barbershopId do AsyncLocalStorage e executa SET LOCAL antes de cada query.
 */
export const rlsExtension = Prisma.defineExtension({
  name: "rls",
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        const store = requestContext.getStore();

        if (!store?.barbershopId) {
          return query(args);
        }

        const { prisma } = await import("./prismaClient");

        return prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `SET LOCAL app.current_barbershop_id = $1`,
            store.barbershopId
          );
          return query(args);
        });
      },
    },
  },
});
