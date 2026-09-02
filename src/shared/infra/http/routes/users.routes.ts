import { FastifyInstance } from "fastify";
import { container } from "tsyringe";
import { CreateUserController } from "@/modules/users/useCases/createUser/CreateUserController";
import { StaffUserController } from "@/modules/users/controllers/StaffUserController";
import { DeleteAccountController, validateDeleteAccount } from "@/modules/users/useCases/deleteAccount/DeleteAccountController";
import { ExportUserDataController } from "@/modules/users/useCases/exportData/ExportUserDataController";
import { AvatarController } from "@/modules/users/useCases/uploadAvatar/AvatarController";
import { ProfileController } from "@/modules/users/controllers/ProfileController";
import { AccountDeletionRequestController } from "@/modules/users/controllers/AccountDeletionRequestController";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { checkSubscription } from "../middlewares/checkSubscription";
import { setRlsContext } from "../middlewares/setRlsContext";

export async function usersRoutes(app: FastifyInstance) {
  const createUserController = new CreateUserController();
  const staff = new StaffUserController();
  const deleteAccountController = new DeleteAccountController();
  const exportUserDataController = new ExportUserDataController();
  const avatarController = new AvatarController();
  const profileController = container.resolve(ProfileController);
  const deletionRequestController = new AccountDeletionRequestController();

  // ─── Gestão de equipe (OWNER da barbearia; MASTER_ADMIN via ?barbershopId=) ─
  const ownerGuard = [authenticate, authorize(["MASTER_ADMIN", "OWNER"]), checkSubscription, setRlsContext];
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

  // ─── LGPD: Exclusão de conta (Art. 18) ─
  const authGuard = [authenticate, setRlsContext];
  app.patch("/users/me", { preHandler: authGuard }, profileController.update.bind(profileController));
  app.post("/users/me/deletion-request", {
    preHandler: authGuard,
    schema: {
      tags: ["Users"],
      summary: "Solicitar exclusão da conta e dos dados pessoais (LGPD)",
      body: {
        type: "object",
        properties: { reason: { type: "string", maxLength: 500 } },
      },
    },
  }, deletionRequestController.create.bind(deletionRequestController));
  app.delete("/users/me", {
    preHandler: [...authGuard, validateDeleteAccount],
    schema: {
      tags: ["Users"],
      summary: "Excluir própria conta (LGPD - Direito ao Esquecimento)",
      body: {
        type: "object",
        required: ["password"],
        properties: {
          password: { type: "string", minLength: 1 },
        },
      },
      response: {
        200: {
          description: "Conta excluída com sucesso",
          type: "object",
          properties: {
            success: { type: "boolean" },
            message: { type: "string" },
          },
        },
      },
    },
  }, deleteAccountController.handle.bind(deleteAccountController));

  // ─── LGPD: Exportação de dados (Art. 18 - Portabilidade) ─
  app.get("/users/me/export", {
    preHandler: authGuard,
    schema: {
      tags: ["Users"],
      summary: "Exportar todos os dados do usuário (LGPD - Portabilidade)",
      querystring: {
        type: "object",
        properties: {
          format: { type: "string", enum: ["json", "csv"], default: "json" },
        },
      },
      response: {
        200: {
          description: "Dados exportados com sucesso",
          content: {
            "application/json": { schema: { type: "object" } },
            "text/csv": { schema: { type: "string" } },
          },
        },
      },
    },
  }, exportUserDataController.handle.bind(exportUserDataController));

  // ─── Avatar: upload, confirm, delete ──────────────────────────────────────
  // Owner/Admin pode alterar qualquer usuário; employee só a si mesmo
  const avatarGuard = [authenticate, setRlsContext];
  app.get("/users/:id/avatar/upload-url", { preHandler: avatarGuard }, avatarController.getUploadUrl.bind(avatarController));
  app.patch("/users/:id/avatar", { preHandler: avatarGuard }, avatarController.confirmAvatar.bind(avatarController));
  app.delete("/users/:id/avatar", { preHandler: avatarGuard }, avatarController.deleteAvatar.bind(avatarController));
  app.post("/users/:id/avatar/upload", { preHandler: avatarGuard }, avatarController.uploadDirect.bind(avatarController));
}
