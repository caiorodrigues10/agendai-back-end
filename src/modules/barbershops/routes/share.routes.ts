import { FastifyInstance } from "fastify";
import { validateSchema } from "@/shared/infra/http/middlewares/validateSchema";
import { pageThemeIdParamsSchema } from "../schemas/pageThemeSchemas";
import { ShareSalonController } from "../useCases/share/ShareSalonController";

/**
 * Página de compartilhamento do salão. Registrada em `app.ts` FORA do prefixo
 * `/api`: o crawler espera HTML, não JSON (contrato `GET /s/salon/:id`).
 */
export async function shareRoutes(app: FastifyInstance) {
  const share = new ShareSalonController();

  app.get(
    "/s/salon/:id",
    { preHandler: [validateSchema(pageThemeIdParamsSchema, "params")] },
    share.render.bind(share),
  );
}
