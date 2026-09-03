import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { checkSubscription } from "../middlewares/checkSubscription";
import { setRlsContext } from "../middlewares/setRlsContext";
import { PostsController } from "@/modules/posts/controllers/PostsController";
import { PostMediaController } from "@/modules/posts/controllers/PostMediaController";

export async function postsRoutes(app: FastifyInstance) {
  const posts = new PostsController();
  const media = new PostMediaController();

  const staffGuard = [
    authenticate,
    authorize(["MASTER_ADMIN", "OWNER", "EMPLOYEE"]),
    checkSubscription,
    setRlsContext,
  ];

  app.get("/posts/preview", { preHandler: staffGuard }, posts.preview.bind(posts));
  app.get("/posts/templates", { preHandler: staffGuard }, posts.templates.bind(posts));
  app.get("/posts/media", { preHandler: staffGuard }, media.list.bind(media));
  app.post("/posts/media/:barbershopId", { preHandler: staffGuard }, media.upload.bind(media));
  app.delete("/posts/media/:id", { preHandler: staffGuard }, media.remove.bind(media));
  app.post("/posts/generate", { preHandler: staffGuard }, posts.generate.bind(posts));
  app.post("/posts", { preHandler: staffGuard }, posts.create.bind(posts));
  app.patch("/posts/:id", { preHandler: staffGuard }, posts.update.bind(posts));
  app.delete("/posts/:id", { preHandler: staffGuard }, posts.delete.bind(posts));
  app.get("/posts/scheduled", { preHandler: staffGuard }, posts.listScheduled.bind(posts));
  app.get("/posts/config", { preHandler: staffGuard }, posts.getConfig.bind(posts));
  app.put("/posts/config", { preHandler: staffGuard }, posts.saveConfig.bind(posts));
}
