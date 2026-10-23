import { FastifyReply, FastifyRequest } from "fastify";
import { container } from "tsyringe";
import { z } from "zod";
import { SignImageUploadUseCase } from "./SignImageUploadUseCase";

const signUploadBodySchema = z.object({
  kind: z.enum(["cover", "logo"], {
    errorMap: () => ({ message: 'kind deve ser "cover" ou "logo"' }),
  }),
});

/**
 * POST /barbershops/:id/uploads/sign
 * Body: { kind: "cover" | "logo" }
 * → credenciais de upload direto ao Cloudinary (o back só assina; o arquivo
 *   nunca passa pelo servidor).
 */
export class SignImageUploadController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id: barbershopId } = request.params as { id: string };
    const { kind } = signUploadBodySchema.parse(request.body);

    const useCase = container.resolve(SignImageUploadUseCase);
    const upload = await useCase.execute({ barbershopId, kind }, request.user!);

    reply.send({ success: true, data: upload });
  }
}
