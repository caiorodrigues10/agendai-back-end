import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { authenticateOptional } from "../middlewares/authenticateOptional";
import { authorize } from "../middlewares/authorize";
import { checkSubscription } from "../middlewares/checkSubscription";
import { setRlsContext } from "../middlewares/setRlsContext";
import { FeedController } from "@/modules/feed/controllers/FeedController";
import { UploadVideoController } from "@/modules/feed/useCases/uploadVideo";

export async function feedRoutes(app: FastifyInstance) {
  const feed = new FeedController();
  const uploadVideoController = new UploadVideoController();

  const staffGuard = [
    authenticate,
    authorize(["MASTER_ADMIN", "OWNER", "EMPLOYEE"]),
    checkSubscription,
    setRlsContext,
  ];

  // Leitura pública — o perfil da barbearia exibe o feed para visitantes
  app.get("/feed", feed.list.bind(feed));

  // Criação/remoção — staff da barbearia
  app.post("/feed", { preHandler: staffGuard }, feed.create.bind(feed));
  app.delete("/feed/:id", { preHandler: staffGuard }, feed.delete.bind(feed));

  // PATCH: curtir é público (só campo likes); edição de conteúdo exige staff.
  // O controller decide com base nos campos enviados e em request.user.
  app.patch("/feed/:id", { preHandler: [authenticateOptional] }, feed.update.bind(feed));

  // Upload de vídeo para posts
  app.post(
    "/feed/:barbershopId/video",
    { preHandler: staffGuard },
    (req, rep) => uploadVideoController.upload(req, rep)
  );
}
