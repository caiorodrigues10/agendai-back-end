import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { CreateCardPaymentController } from "@/modules/payments/useCases/createCardPayment/CreateCardPaymentController";
import { CreatePixPaymentController } from "@/modules/payments/useCases/createPixPayment/CreatePixPaymentController";
import { GetPaymentStatusController } from "@/modules/payments/useCases/getPaymentStatus/GetPaymentStatusController";
import { ListPaymentsController } from "@/modules/payments/useCases/listPayments/ListPaymentsController";
import { ProcessWebhookController } from "@/modules/payments/useCases/processWebhook/ProcessWebhookController";
import {
  ProcessAbacateWebhookController,
  abacateWebhookPreParsing,
} from "@/modules/payments/useCases/processAbacateWebhook/ProcessAbacateWebhookController";
import { ProcessAsaasWebhookController } from "@/modules/payments/useCases/processAsaasWebhook/ProcessAsaasWebhookController";
import { CancelPaymentController } from "@/modules/payments/useCases/cancelPayment/CancelPaymentController";
import { RefundPaymentController } from "@/modules/payments/useCases/refundPayment/RefundPaymentController";
import { ListRefundsController } from "@/modules/payments/useCases/refundPayment/ListRefundsController";

export async function paymentRoutes(app: FastifyInstance) {
  const cardPayment   = new CreateCardPaymentController();
  const pixPayment    = new CreatePixPaymentController();
  const getStatus     = new GetPaymentStatusController();
  const listPayments  = new ListPaymentsController();
  const webhook       = new ProcessWebhookController();
  const abacateWebhook = new ProcessAbacateWebhookController();
  const asaasWebhook = new ProcessAsaasWebhookController();
  const cancelPayment = new CancelPaymentController();
  const refundPayment = new RefundPaymentController();
  const listRefunds   = new ListRefundsController();

  // BUG-4: Rate-limit mais restritivo no webhook público
  // O MP envia no máximo poucos eventos por segundo — 30/min é mais que suficiente
  app.post("/payments/webhook", {
    config: {
      rateLimit: {
        max: 30,
        timeWindow: "1 minute"
      }
    }
  }, webhook.handle.bind(webhook));

  // AbacatePay — URL: /api/payments/webhook/abacate?webhookSecret=...
  app.post(
    "/payments/webhook/abacate",
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 minute",
        },
      },
      preParsing: abacateWebhookPreParsing,
    },
    abacateWebhook.handle.bind(abacateWebhook)
  );

  // Asaas — URL: /api/payments/webhook/asaas (header asaas-access-token)
  app.post(
    "/payments/webhook/asaas",
    {
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute",
        },
      },
    },
    asaasWebhook.handle.bind(asaasWebhook)
  );

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
    { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER", "EMPLOYEE"])] },
    getStatus.handle.bind(getStatus)
  );

  app.patch(
    "/payments/:id/cancel",
    { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"])] },
    cancelPayment.handle.bind(cancelPayment)
  );

  app.post(
    "/payments/:id/refund",
    { preHandler: [authenticate, authorize(["MASTER_ADMIN"])] },
    refundPayment.handle.bind(refundPayment)
  );

  app.get(
    "/refunds",
    { preHandler: [authenticate, authorize(["MASTER_ADMIN"])] },
    listRefunds.handle.bind(listRefunds)
  );

  app.get(
    "/payments",
    { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"])] },
    listPayments.handle.bind(listPayments)
  );
}
