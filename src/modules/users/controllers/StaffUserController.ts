import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";

const publicSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  barbershopId: true,
  createdAt: true,
} as const;

/**
 * Gestão de equipe pelo OWNER (escopada à própria barbearia).
 * MASTER_ADMIN pode informar ?barbershopId= para operar qualquer salão.
 */
export class StaffUserController {
  private resolveBarbershopId(request: FastifyRequest): string {
    const user = request.user!;
    const { barbershopId } = request.query as { barbershopId?: string };

    if (user.role === "MASTER_ADMIN") {
      if (!barbershopId) throw new AppError("barbershopId é obrigatório para MASTER_ADMIN", 400);
      return barbershopId;
    }
    if (!user.barbershopId) {
      throw new AppError("Usuário não vinculado a nenhum salão", 400);
    }
    // OWNER não pode operar outro salão
    if (barbershopId && barbershopId !== user.barbershopId) {
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }
    return user.barbershopId;
  }

  /** Garante que o usuário-alvo pertence ao salão do solicitante. */
  private async findScopedUser(request: FastifyRequest, id: string) {
    const user = request.user!;
    const target = await prisma.user.findUnique({ where: { id }, select: publicSelect });
    if (!target) throw new AppError("Usuário não encontrado", 404);

    if (user.role !== "MASTER_ADMIN" && target.barbershopId !== user.barbershopId) {
      throw new AppError("Acesso negado: usuário não pertence ao seu salão", 403);
    }
    return target;
  }

  async list(request: FastifyRequest, reply: FastifyReply) {
    const barbershopId = this.resolveBarbershopId(request);

    const users = await prisma.user.findMany({
      where: { barbershopId },
      select: publicSelect,
      orderBy: { createdAt: "asc" },
    });

    return reply.status(200).send({ success: true, data: users });
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const requester = request.user!;
    const target = await this.findScopedUser(request, id);

    const { name, email, role, active } = request.body as {
      name?: string;
      email?: string;
      role?: string;
      active?: boolean;
    };

    // OWNER só gerencia papéis internos do salão
    if (role && !["OWNER", "EMPLOYEE"].includes(role)) {
      throw new AppError("Role inválida para gestão de equipe", 400);
    }
    // OWNER não pode rebaixar/alterar outro OWNER (evita golpe de acesso)
    if (requester.role === "OWNER" && target.role === "OWNER" && target.id !== requester.id && role) {
      throw new AppError("Você não pode alterar o papel de outro proprietário", 403);
    }

    if (email) {
      const emailInUse = await prisma.user.findFirst({ where: { email, id: { not: id } } });
      if (emailInUse) throw new AppError("E-mail já está em uso", 400);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(email && { email }),
        ...(role && { role: role as any }),
        ...(active !== undefined && { active }),
      },
      select: publicSelect,
    });

    return reply.status(200).send({ success: true, data: updated });
  }

  async delete(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const requester = request.user!;
    const target = await this.findScopedUser(request, id);

    if (target.id === requester.id) {
      throw new AppError("Você não pode remover a si mesmo", 400);
    }
    if (requester.role === "OWNER" && target.role === "OWNER") {
      throw new AppError("Você não pode remover outro proprietário", 403);
    }

    await prisma.user.delete({ where: { id } });

    return reply.status(200).send({ success: true, message: "Usuário removido com sucesso" });
  }
}
