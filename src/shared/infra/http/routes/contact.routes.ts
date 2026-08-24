import { FastifyInstance } from "fastify";
import { ContactController } from "@/modules/contact/controllers/ContactController";

export async function contactRoutes(app: FastifyInstance) {
  const controller = new ContactController();

  /** POST /contact — formulário público da landing/marketing. */
  app.post("/contact", controller.submit.bind(controller));
}
