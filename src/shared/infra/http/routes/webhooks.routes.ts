import type { FastifyInstance } from "fastify";
import {
  ResendWebhookController,
  resendWebhookPreParsing,
} from "@/modules/notifications/controllers/ResendWebhookController";

export async function webhooksRoutes(app: FastifyInstance): Promise<void> {
  const resend = new ResendWebhookController();
  app.post(
    "/webhooks/resend",
    {
      config: { rateLimit: { max: 150, timeWindow: "1 minute" } },
      preParsing: resendWebhookPreParsing,
    },
    resend.handle.bind(resend),
  );
}

