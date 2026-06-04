import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { CreateCardPaymentController } from "@/modules/payments/useCases/createCardPayment/CreateCardPaymentController";
import { CreatePixPaymentController } from "@/modules/payments/useCases/createPixPayment/CreatePixPaymentController";
import { GetPaymentStatusController } from "@/modules/payments/useCases/getPaymentStatus/GetPaymentStatusController";
import { ListPaymentsController } from "@/modules/payments/useCases/listPayments/ListPaymentsController";
import { ProcessWebhookController } from "@/modules/payments/useCases/processWebhook/ProcessWebhookController";

export async function paymentRoutes(app: FastifyInstance) {
  const cardPayment = new CreateCardPaymentController();
  const pixPayment = new CreatePixPaymentController();
  const getStatus = new GetPaymentStatusController();
  const listPayments = new ListPaymentsController();
  const webhook = new ProcessWebhookController();

  // Público — o Mercado Pago não envia Bearer token
  app.post("/payments/webhook", webhook.handle.bind(webhook));

  app.post(
    "/payments/card",
    { preHandler: [authenticate] },
    cardPayment.handle.bind(cardPayment)
  );

  app.post(
    "/payments/pix",
    { preHandler: [authenticate] },
    pixPayment.handle.bind(pixPayment)
  );

  app.get(
    "/payments/:id",
    { preHandler: [authenticate] },
    getStatus.handle.bind(getStatus)
  );

  app.get(
    "/payments",
    {
      preHandler: [
        authenticate,
        authorize(["MASTER_ADMIN", "OWNER", "EMPLOYEE"])
      ]
    },
    listPayments.handle.bind(listPayments)
  );
}