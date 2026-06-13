import { FastifyInstance } from "fastify";
import { usersRoutes } from "./users.routes";
import { servicesRoutes } from "./services.routes";
import { barbershopsRoutes } from "./barbershops.routes";
import { queueRoutes } from "./queue.routes";
import { authRoutes } from "./auth.routes";
import { adminRoutes } from "./admin.routes";
import { paymentRoutes } from "./payments.routes";
import { plansRoutes } from "./plans.routes";
import { fiadoRoutes } from "./fiado.routes";

export async function apiRoutes(app: FastifyInstance) {
  await authRoutes(app);
  await usersRoutes(app);
  await servicesRoutes(app);
  await barbershopsRoutes(app);
  await queueRoutes(app);
  await adminRoutes(app);
  await paymentRoutes(app);
  await plansRoutes(app);
  await fiadoRoutes(app); 
}