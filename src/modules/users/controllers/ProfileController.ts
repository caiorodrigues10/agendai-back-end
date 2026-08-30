import { FastifyReply, FastifyRequest } from "fastify";
import { inject, injectable } from "tsyringe";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { IHashProvider } from "@/shared/container/providers/HashProvider/IHashProvider";
import { z } from "zod";

const profileSchema = z.object({
  name: z.string().min(3).max(200).optional(),
  email: z.string().email().max(100).optional(),
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(6).max(100).optional(),
}).refine(data => !data.newPassword || data.currentPassword, {
  message: "A senha atual é obrigatória para trocar a senha",
  path: ["currentPassword"],
});

@injectable()
export class ProfileController {
  constructor(@inject("HashProvider") private hashProvider: IHashProvider) {}

  async update(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const data = profileSchema.parse(request.body);
    const current = await prisma.user.findUnique({ where: { id: userId } });
    if (!current) throw new AppError("Usuário não encontrado", 404);

    if (data.email && data.email.toLowerCase() !== current.email.toLowerCase()) {
      const duplicate = await prisma.user.findFirst({
        where: { email: { equals: data.email.toLowerCase(), mode: "insensitive" }, id: { not: userId } },
      });
      if (duplicate) throw new AppError("E-mail já está em uso", 400);
    }

    let password: string | undefined;
    if (data.newPassword) {
      const valid = await this.hashProvider.compare(data.currentPassword!, current.password);
      if (!valid) throw new AppError("Senha atual inválida", 400);
      password = await this.hashProvider.hash(data.newPassword);
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.name ? { name: data.name.trim() } : {}),
        ...(data.email ? { email: data.email.trim().toLowerCase() } : {}),
        ...(password ? { password } : {}),
      },
      select: { id: true, name: true, email: true, role: true, barbershopId: true, active: true, avatarUrl: true, permissions: true },
    });
    return reply.send({ success: true, data: updated });
  }
}
