import { FastifyInstance } from "fastify";
import { authenticateClient } from "@/shared/infra/http/middlewares/authenticateClient";
import { WalletController } from "./walletController";

export async function walletRoutes(app: FastifyInstance) {
  const controller = new WalletController();

  app.get(
    "/client/portal/wallet",
    { preHandler: [authenticateClient] },
    controller.getBalance.bind(controller)
  );

  app.post(
    "/client/portal/wallet/credit",
    { preHandler: [authenticateClient] },
    controller.credit.bind(controller)
  );

  app.post(
    "/client/portal/wallet/debit",
    { preHandler: [authenticateClient] },
    controller.debit.bind(controller)
  );

  app.get(
    "/client/portal/wallet/entries",
    { preHandler: [authenticateClient] },
    controller.listEntries.bind(controller)
  );

  app.post(
    "/client/portal/wallet/transfer",
    { preHandler: [authenticateClient] },
    controller.transfer.bind(controller)
  );
}
