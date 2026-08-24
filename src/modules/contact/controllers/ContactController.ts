import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { submitContactSchema } from "../schemas/contactSchema";
import { SubmitContactMessageUseCase } from "../useCases/SubmitContactMessageUseCase";

/** Rate limit simples em memória: 5 envios / IP / hora. */
const hits = new Map<string, number[]>();
const MAX_HITS = 5;
const WINDOW_MS = 60 * 60 * 1000;

function assertRateLimit(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_HITS) {
    throw new AppError(
      "Muitas mensagens enviadas. Tente novamente mais tarde.",
      429,
    );
  }
  recent.push(now);
  hits.set(ip, recent);
}

export class ContactController {
  async submit(request: FastifyRequest, reply: FastifyReply) {
    const ip =
      (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      request.ip ||
      "unknown";

    assertRateLimit(ip);

    const data = submitContactSchema.parse(request.body);
    const useCase = container.resolve(SubmitContactMessageUseCase);
    const result = await useCase.execute(data);

    return reply.status(201).send({
      success: true,
      data: result,
      message: "Mensagem recebida. Retornamos em até 1 dia útil.",
    });
  }
}
