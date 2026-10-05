import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { authenticateOptional } from "@/shared/infra/http/middlewares/authenticateOptional";
import { authenticateClient } from "@/shared/infra/http/middlewares/authenticateClient";
import { SocialController } from "./socialController";

// The client portal uses opaque OTP sessions; salon staff use the existing JWT.
async function authenticateSocialActor(req: FastifyRequest, reply: FastifyReply) {
  await authenticateOptional(req, reply);
  if (!req.user) await authenticateClient(req, reply);
}

export async function socialRoutes(app: FastifyInstance) {
  const controller = new SocialController();
  const base = "/salons/:salonId";
  app.get(`${base}/posts/:postId`, controller.post.bind(controller));
  app.get(`${base}/stories`, controller.stories.bind(controller));
  app.get(`${base}/posts/:postId/comments`, controller.comments.bind(controller));
  app.post(`${base}/posts/:postId/comments`, {
    preHandler: [authenticateSocialActor], config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, controller.comment.bind(controller));
  app.delete(`${base}/posts/:postId/comments/:commentId`, { preHandler: [authenticateSocialActor] }, controller.deleteComment.bind(controller));
  app.get(`${base}/tagged`, { preHandler: [authenticateOptional] }, controller.tagged.bind(controller));
  app.post(`${base}/posts/:postId/tags`, {
    preHandler: [authenticateSocialActor], config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, controller.requestTag.bind(controller));
  app.patch(`${base}/tags/:tagId`, { preHandler: [authenticateSocialActor] }, controller.moderateTag.bind(controller));
}
