import { FastifyReply, FastifyRequest } from "fastify";
import { SocialUseCases } from "./socialUseCases";
import { commentParamsSchema, commentQuerySchema, commentSchema, moderateTagSchema, salonParamsSchema, socialPostParamsSchema, tagParamsSchema, taggedQuerySchema, tagSchema } from "./socialSchemas";

export class SocialController {
  constructor(private readonly useCases = new SocialUseCases()) {}

  async post(req: FastifyRequest, reply: FastifyReply) {
    const { salonId, postId } = socialPostParamsSchema.parse(req.params);
    return reply.send({ success: true, data: await this.useCases.getPost(salonId, postId) });
  }
  async stories(req: FastifyRequest, reply: FastifyReply) {
    const { salonId } = salonParamsSchema.parse(req.params);
    return reply.send({ success: true, data: await this.useCases.stories(salonId) });
  }
  async comments(req: FastifyRequest, reply: FastifyReply) {
    const { salonId, postId } = socialPostParamsSchema.parse(req.params);
    const { page } = commentQuerySchema.parse(req.query);
    return reply.send({ success: true, ...await this.useCases.comments(salonId, postId, page) });
  }
  async comment(req: FastifyRequest, reply: FastifyReply) {
    const { salonId, postId } = socialPostParamsSchema.parse(req.params);
    const { content } = commentSchema.parse(req.body);
    return reply.status(201).send({ success: true, data: await this.useCases.comment(salonId, postId, content, req.user) });
  }
  async deleteComment(req: FastifyRequest, reply: FastifyReply) {
    const { salonId, postId, commentId } = commentParamsSchema.parse(req.params);
    await this.useCases.deleteComment(salonId, postId, commentId, req.user);
    return reply.send({ success: true });
  }
  async tagged(req: FastifyRequest, reply: FastifyReply) {
    const { salonId } = salonParamsSchema.parse(req.params);
    const { pending } = taggedQuerySchema.parse(req.query);
    return reply.send({ success: true, data: await this.useCases.tagged(salonId, pending === "true", req.user) });
  }
  async requestTag(req: FastifyRequest, reply: FastifyReply) {
    const { salonId, postId } = socialPostParamsSchema.parse(req.params);
    const { targetBarbershopId } = tagSchema.parse(req.body);
    await this.useCases.requestTag(salonId, postId, targetBarbershopId, req.user);
    return reply.status(201).send({ success: true });
  }
  async moderateTag(req: FastifyRequest, reply: FastifyReply) {
    const { salonId, tagId } = tagParamsSchema.parse(req.params);
    const { approve } = moderateTagSchema.parse(req.body);
    await this.useCases.moderateTag(salonId, tagId, approve, req.user);
    return reply.send({ success: true });
  }
}
