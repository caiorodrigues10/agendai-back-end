import { FastifyReply, FastifyRequest } from "fastify";
import { container } from "tsyringe";
import { DeleteAccountUseCase } from "./DeleteAccountUseCase";

export class DeleteAccountController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const { id: userId } = request.user as { id: string; role: string; barbershopId?: string; cpf?: string };
    const { password } = request.body as { password: string };

    const deleteAccountUseCase = container.resolve(DeleteAccountUseCase);

    const result = await deleteAccountUseCase.execute({ userId, password });

    return reply.status(200).send({
      success: true,
      message: result.message,
    });
  }
}

export const validateDeleteAccount = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const { password } = request.body as { password?: string };

  if (!password || password.length < 1) {
    return reply.status(400).send({
      success: false,
      message: "Senha é obrigatória para confirmar a exclusão",
    });
  }
};