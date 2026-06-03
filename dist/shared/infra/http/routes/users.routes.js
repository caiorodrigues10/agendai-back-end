"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);

// src/shared/infra/http/routes/users.routes.ts
var users_routes_exports = {};
__export(users_routes_exports, {
  usersRoutes: () => usersRoutes
});
module.exports = __toCommonJS(users_routes_exports);

// src/modules/users/useCases/createUser/CreateUserController.ts
var import_tsyringe2 = require("tsyringe");

// src/modules/users/useCases/createUser/CreateUserUseCase.ts
var import_tsyringe = require("tsyringe");

// src/shared/errors/AppError.ts
var AppError = class extends Error {
  statusCode;
  errors;
  constructor(message, statusCode = 400, errors) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
  }
};

// src/modules/users/useCases/createUser/CreateUserUseCase.ts
var CreateUserUseCase = class {
  constructor(userRepository, hashProvider) {
    this.userRepository = userRepository;
    this.hashProvider = hashProvider;
  }
  async execute(data) {
    const emailExists = await this.userRepository.findByEmail(data.email);
    if (emailExists) {
      throw new AppError("E-mail j\xE1 cadastrado", 400);
    }
    const hashedPassword = await this.hashProvider.hash(data.password);
    const user = await this.userRepository.create({
      ...data,
      password: hashedPassword
    });
    return user;
  }
};
CreateUserUseCase = __decorateClass([
  (0, import_tsyringe.injectable)(),
  __decorateParam(0, (0, import_tsyringe.inject)("UserRepository")),
  __decorateParam(1, (0, import_tsyringe.inject)("HashProvider"))
], CreateUserUseCase);

// src/modules/users/schemas/userSchemas.ts
var import_zod = require("zod");
var createUserSchema = import_zod.z.object({
  name: import_zod.z.string().min(3, "Nome deve ter no m\xEDnimo 3 caracteres").max(200, "Nome muito longo"),
  email: import_zod.z.string().email("E-mail inv\xE1lido").max(100, "E-mail muito longo"),
  password: import_zod.z.string().min(6, "Senha deve ter no m\xEDnimo 6 caracteres").max(100, "Senha muito longa"),
  role: import_zod.z.enum(["ADMIN", "OWNER", "EMPLOYEE"]).optional(),
  barbershopId: import_zod.z.string().uuid("ID de barbearia inv\xE1lido").optional()
});
var updateUserSchema = createUserSchema.partial();
var loginSchema = import_zod.z.object({
  email: import_zod.z.string().email("E-mail inv\xE1lido"),
  password: import_zod.z.string().min(1, "Senha obrigat\xF3ria")
});

// src/modules/users/useCases/createUser/CreateUserController.ts
var CreateUserController = class {
  async handle(request, reply) {
    const data = createUserSchema.parse(request.body);
    const createUserUseCase = import_tsyringe2.container.resolve(CreateUserUseCase);
    const user = await createUserUseCase.execute(data);
    return reply.status(201).send({
      success: true,
      message: "Usu\xE1rio criado com sucesso",
      data: user
    });
  }
};

// src/shared/infra/http/routes/users.routes.ts
async function usersRoutes(app) {
  const createUserController = new CreateUserController();
  app.post("/users", {
    schema: {
      tags: ["Users"],
      summary: "Criar novo usu\xE1rio",
      body: {
        type: "object",
        required: ["name", "email", "password"],
        properties: {
          name: { type: "string", minLength: 3, maxLength: 200 },
          email: { type: "string", format: "email", maxLength: 100 },
          password: { type: "string", minLength: 6, maxLength: 100 },
          role: { type: "string", enum: ["ADMIN", "OWNER", "EMPLOYEE"] },
          barbershopId: { type: "string", format: "uuid" }
        }
      },
      response: {
        201: {
          description: "Usu\xE1rio criado com sucesso",
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
                barbershopId: { type: "string", format: "uuid", nullable: true },
                createdAt: { type: "string", format: "date-time" }
              }
            }
          }
        }
      }
    }
  }, createUserController.handle);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  usersRoutes
});
