import { FastifyInstance } from "fastify";
import { CreateUserController } from "@/modules/users/useCases/createUser/CreateUserController";
import { StaffUserController } from "@/modules/users/controllers/StaffUserController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { checkSubscription } from "../middlewares/checkSubscription";

export async function usersRoutes(app: FastifyInstance) {
  const createUserController = new CreateUserController();
  const staff = new StaffUserController();

  // ─── Gestão de equipe (OWNER da barbearia; MASTER_ADMIN via ?barbershopId=) ─
  const ownerGuard = [authenticate, authorize(["MASTER_ADMIN", "OWNER"]), checkSubscription];
  app.get("/users", { preHandler: ownerGuard }, staff.list.bind(staff));
  app.patch("/users/:id", { preHandler: ownerGuard }, staff.update.bind(staff));
  app.delete("/users/:id", { preHandler: ownerGuard }, staff.delete.bind(staff));

  app.post("/users", {
    preHandler: ownerGuard,
    schema: {
      tags: ["Users"],
      summary: "Criar novo usuário",
      body: {
        type: "object",
        required: ["name", "email", "password"],
        properties: {
          name: { type: "string", minLength: 3, maxLength: 200 },
          email: { type: "string", format: "email", maxLength: 100 },
          password: { type: "string", minLength: 6, maxLength: 100 },
          role: {
            type: "string",
            enum: ["MASTER_ADMIN", "OWNER", "EMPLOYEE"],
          },
          barbershopId: { type: "string", format: "uuid" },
          cpf: { type: "string" },
        },
      },
      response: {
        201: {
          description: "Usuário criado com sucesso",
          type: "object",
          properties: {
            success: { type: "boolean" },
            message: { type: "string" },
            data: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                name: { type: "string" },
                email: { type: "string" },
                role: { type: "string" },
                barbershopId: {
                  type: "string",
                  format: "uuid",
                  nullable: true,
                },
                createdAt: { type: "string", format: "date-time" },
              },
            },
          },
        },
      },
    },
  }, createUserController.handle.bind(createUserController));
}
