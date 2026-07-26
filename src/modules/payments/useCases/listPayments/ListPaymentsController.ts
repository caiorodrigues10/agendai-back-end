import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { ListPaymentsUseCase } from "./ListPaymentsUseCase";
import { AppError } from "@/shared/errors/AppError";

export class ListPaymentsController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const {
      barbershopId,
      page = "1",
      limit = "20"
    } = request.query as { barbershopId?: string; page?: string; limit?: string };

    const user = request.user!;

    // Defense in depth: EMPLOYEE não tem acesso a dados financeiros
    if (user.role === "EMPLOYEE") {
      throw new AppError("Acesso negado: apenas proprietários podem visualizar pagamentos", 403);
    }

    let resolvedBarbershopId: string | undefined;

    if (user.role === "MASTER_ADMIN") {
      // FIX-3: admin pode passar ?barbershopId= para filtrar uma barbearia específica,
      // ou omitir para listar todos os pagamentos da plataforma
      resolvedBarbershopId = barbershopId; // pode ser undefined — isso é intencional
    } else {
      // Não-admin: obrigatoriamente usa a barbearia do próprio token
      resolvedBarbershopId = user.barbershopId;
      if (!resolvedBarbershopId) {
        throw new AppError(
          "Usuário não está vinculado a nenhum salão",
          400
        );
      }
    }

    const parsedPage  = Math.max(1, Number(page)  || 1);
    const parsedLimit = Math.max(1, Math.min(Number(limit) || 20, 100));

    const useCase = container.resolve(ListPaymentsUseCase);
    const result = await useCase.execute(
      resolvedBarbershopId,
      parsedPage,
      parsedLimit
    );

    reply.send({
      success: true,
      data: result.data,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: Math.ceil(result.total / result.limit)
      }
    });
  }
}
