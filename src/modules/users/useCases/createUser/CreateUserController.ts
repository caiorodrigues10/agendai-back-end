import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { CreateUserUseCase } from "./CreateUserUseCase";
import { createUserSchema } from "../../schemas/userSchemas";
import { ICreateUserDTO } from "../../dtos/ICreateUserDTO";

export class CreateUserController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const data: ICreateUserDTO = createUserSchema.parse(request.body);
    const createUserUseCase = container.resolve(CreateUserUseCase);
    const user = await createUserUseCase.execute(data);
    return reply.status(201).send({
      success: true,
      message: "Usuário criado com sucesso",
      data: user
    });
  }
}
