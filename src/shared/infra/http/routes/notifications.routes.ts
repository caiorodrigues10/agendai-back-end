import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { checkSubscription } from "../middlewares/checkSubscription";
import { sendWhatsAppMessage } from "@/shared/services/whatsappNotificationService";

const whatsappBodySchema = z.object({
  phone: z.string().min(8).max(20),
  message: z.string().min(1).max(2000),
});

export async function notificationsRoutes(app: FastifyInstance) {
  const staffGuard = [
    authenticate,
    authorize(["MASTER_ADMIN", "OWNER", "EMPLOYEE"]),
    checkSubscription,
  ];

  /** POST /notifications/whatsapp — envio manual pelo staff (ex.: aviso ao cliente). */
  app.post("/notifications/whatsapp", { preHandler: staffGuard }, async (request, reply) => {
    const { phone, message } = whatsappBodySchema.parse(request.body);
    const sent = await sendWhatsAppMessage(phone, message, request.log);
    return reply.send({ success: true, data: { sent } });
  });
}
