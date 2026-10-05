import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { validateSchema } from "@/shared/utils/zodValidation";
import { acceptOwnerInviteSchema } from "../../schemas/authSchemas";
import { AcceptOwnerInviteUseCase } from "./AcceptOwnerInviteUseCase";

export const validateAcceptOwnerInvite = validateSchema(acceptOwnerInviteSchema);

export class AcceptOwnerInviteController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const { token, newPassword } = request.body as { token: string; newPassword: string };
    const useCase = container.resolve(AcceptOwnerInviteUseCase);
    const result = await useCase.execute(token, newPassword);
    return reply.status(200).send({ success: true, ...result });
  }
}
