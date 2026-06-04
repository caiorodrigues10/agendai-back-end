import { FastifyRequest, FastifyReply } from "fastify";
import { authenticate } from "@/shared/infra/http/middlewares/authenticate";
import { UserRepository } from "@/modules/users/infra/repositories/UserRepository";

export async function mePreHandler(request: FastifyRequest, reply: FastifyReply) {
  await authenticate(request, reply);
}

export class MeController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const userRepo = new UserRepository();
    const user = await userRepo.findById(request.user!.id);
    if (!user) return reply.status(404).send({ message: "Usuário não encontrado" });
    return reply.status(200).send({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: mapRole(user.role),
        barbershopId: user.barbershopId ?? undefined
      }
    });
  }
}

function mapRole(role: string): "admin" | "owner" | "employee" | "customer" {
  if (role === "MASTER_ADMIN") return "admin";
  if (role === "OWNER") return "owner";
  if (role === "CUSTOMER") return "customer";
  return "employee";
}
