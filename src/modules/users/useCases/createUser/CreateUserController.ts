import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { CreateUserUseCase } from "./CreateUserUseCase";
import { createUserSchema } from "../../schemas/userSchemas";
import { ICreateUserDTO } from "../../dtos/ICreateUserDTO";
import { AppError } from "@/shared/errors/AppError";

export class CreateUserController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const data: ICreateUserDTO = createUserSchema.parse(request.body);
    const requester = request.user;

    if (!requester) {
      throw new AppError("Não autenticado", 401);
    }

    // OWNER só cria funcionários no próprio salão
    if (requester.role === "OWNER") {
      if (!requester.barbershopId) {
        throw new AppError("Usuário não vinculado a nenhum salão", 400);
      }
      if (data.role && data.role !== "EMPLOYEE") {
        throw new AppError("Owners só podem criar funcionários", 403);
      }
      data.role = "EMPLOYEE";
      data.barbershopId = requester.barbershopId;
    }

    if (requester.role === "MASTER_ADMIN" && data.role === "EMPLOYEE" && !data.barbershopId) {
      throw new AppError("barbershopId é obrigatório para criar funcionário", 400);
    }

    const createUserUseCase = container.resolve(CreateUserUseCase);
    const user = await createUserUseCase.execute(data);
    return reply.status(201).send({
      success: true,
      message: "Usuário criado com sucesso",
      data: user
    });
  }
}
