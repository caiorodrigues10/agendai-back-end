import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { createAuditLog } from "@/shared/services/auditLogService";

const requestSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export class AccountDeletionRequestController {
  async create(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const body = requestSchema.parse(request.body ?? {});
    const existing = await prisma.accountDeletionRequest.findFirst({
      where: { userId, status: { in: ["PENDING", "PROCESSING"] } },
      orderBy: { requestedAt: "desc" },
    });
    if (existing) {
      return reply.send({ success: true, data: existing, message: "Sua solicitação já está em análise" });
    }

    const deletionRequest = await prisma.accountDeletionRequest.create({
      data: { userId, reason: body.reason || null },
    });
    await createAuditLog({
      userId,
      action: "ACCOUNT_DELETION_REQUESTED",
      resource: "User",
      resourceId: userId,
      details: JSON.stringify({ requestId: deletionRequest.id }),
    });
    if (!deletionRequest) throw new AppError("Não foi possível registrar a solicitação", 500);
    return reply.status(202).send({
      success: true,
      data: deletionRequest,
      message: "Solicitação registrada. A equipe analisará a exclusão dos dados.",
    });
  }
}
