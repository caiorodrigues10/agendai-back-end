import { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { container } from "tsyringe";
import { validateSchema } from "@/shared/infra/http/middlewares/validateSchema";
import { CheckCpfUseCase } from "./CheckCpfUseCase";

export const checkCpfQuerySchema = z.object({
  cpf: z.string().min(1, "CPF é obrigatório").max(20, "CPF inválido"),
});

export const validateCheckCpf = validateSchema(checkCpfQuerySchema, "query");

export class CheckCpfController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const { cpf } = request.query as { cpf: string };
    const useCase = container.resolve(CheckCpfUseCase);
    const result = await useCase.execute(cpf);
    return reply.status(200).send({ success: true, data: result });
  }
}
