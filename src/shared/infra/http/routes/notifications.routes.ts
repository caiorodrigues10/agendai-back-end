import { FastifyInstance } from "fastify";
import { z } from "zod";
import { container } from "tsyringe";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { checkSubscription } from "../middlewares/checkSubscription";
import { enqueueWhatsApp } from "@/shared/infra/queue";
import { SendAppointmentRemindersUseCase } from "@/modules/appointments/useCases/appointmentUseCases";
import { IBarbershopRepository } from "@/modules/barbershops/repositories/IBarbershopRepository";

const whatsappBodySchema = z.object({
  phone: z.string().min(8).max(20),
  message: z.string().min(1).max(2000),
  /** Opcional: se informado, usa a instanceName da Evolution API da barbearia. */
  barbershopId: z.string().uuid().optional(),
});

export async function notificationsRoutes(app: FastifyInstance) {
  const staffGuard = [
    authenticate,
    authorize(["MASTER_ADMIN", "OWNER", "EMPLOYEE"]),
    checkSubscription,
  ];

  /** POST /notifications/whatsapp — envio manual pelo staff (ex.: aviso ao cliente). */
  app.post("/notifications/whatsapp", { preHandler: staffGuard }, async (request, reply) => {
    const { phone, message, barbershopId } = whatsappBodySchema.parse(request.body);

    let instanceName: string | undefined;
    if (barbershopId) {
      const shop = await container
        .resolve<IBarbershopRepository>("BarbershopRepository")
        .findById(barbershopId);
      instanceName = shop?.evolutionInstanceName?.trim() || undefined;
    }

    await enqueueWhatsApp({
      phone,
      message,
      instanceName,
      deduplicationKey: `manual:${phone}:${Date.now()}`,
    });
    return reply.send({ success: true, data: { sent: true } });
  });

  /**
   * POST /notifications/appointment-reminders/run
   * Disparo manual do job de lembretes (debug/produção sem esperar o cron).
   * Apenas MASTER_ADMIN.
   */
  app.post(
    "/notifications/appointment-reminders/run",
    { preHandler: [authenticate, authorize(["MASTER_ADMIN"])] },
    async (_request, reply) => {
      const useCase = container.resolve(SendAppointmentRemindersUseCase);
      const result = await useCase.execute();
      return reply.send({ success: true, data: result });
    }
  );
}
