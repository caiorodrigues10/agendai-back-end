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

// src/shared/infra/http/routes/index.ts
var routes_exports = {};
__export(routes_exports, {
  registerRoutes: () => registerRoutes
});
module.exports = __toCommonJS(routes_exports);

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

// src/shared/infra/http/middlewares/authenticate.ts
var import_jsonwebtoken = require("jsonwebtoken");

// src/config/auth.ts
var auth_default = {
  secret: process.env.JWT_SECRET || "dev-secret",
  refreshSecret: process.env.JWT_REFRESH_SECRET || "dev-refresh-secret",
  expiresIn: process.env.JWT_EXPIRES_IN || "15m",
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d"
};

// src/shared/infra/http/middlewares/authenticate.ts
async function authenticate(request, reply) {
  const authHeader = request.headers.authorization;
  if (!authHeader) {
    throw new AppError("Token ausente", 401);
  }
  const [, token] = authHeader.split(" ");
  if (!token) {
    throw new AppError("Token mal formatado", 401);
  }
  try {
    const decoded = (0, import_jsonwebtoken.verify)(token, auth_default.secret);
    request.user = {
      id: decoded.sub,
      role: decoded.role,
      barbershopId: decoded.barbershopId
    };
  } catch {
    throw new AppError("Token inv\xE1lido", 401);
  }
}

// src/shared/infra/http/middlewares/authorize.ts
function authorize(allowedRoles) {
  return async (request, reply) => {
    const role = request.user?.role;
    if (!role || !allowedRoles.includes(role)) {
      throw new AppError("Acesso negado", 403);
    }
  };
}

// src/modules/services/useCases/createService/CreateServiceController.ts
var import_tsyringe4 = require("tsyringe");

// src/modules/services/schemas/serviceSchemas.ts
var import_zod2 = require("zod");
var createServiceSchema = import_zod2.z.object({
  barbershopId: import_zod2.z.string().uuid(),
  name: import_zod2.z.string().min(2).max(100),
  price: import_zod2.z.number().min(0),
  avgTimeMinutes: import_zod2.z.number().min(1),
  icon: import_zod2.z.string().min(1).max(50)
});
var updateServiceSchema = import_zod2.z.object({
  name: import_zod2.z.string().min(2).max(100).optional(),
  price: import_zod2.z.number().min(0).optional(),
  avgTimeMinutes: import_zod2.z.number().min(1).optional(),
  icon: import_zod2.z.string().min(1).max(50).optional(),
  active: import_zod2.z.boolean().optional()
});

// src/modules/services/useCases/createService/CreateServiceUseCase.ts
var import_tsyringe3 = require("tsyringe");
var CreateServiceUseCase = class {
  constructor(serviceRepository) {
    this.serviceRepository = serviceRepository;
  }
  async execute(data) {
    return this.serviceRepository.create(data);
  }
};
CreateServiceUseCase = __decorateClass([
  (0, import_tsyringe3.injectable)(),
  __decorateParam(0, (0, import_tsyringe3.inject)("ServiceRepository"))
], CreateServiceUseCase);

// src/modules/services/useCases/createService/CreateServiceController.ts
var CreateServiceController = class {
  async handle(request, reply) {
    const data = createServiceSchema.parse(request.body);
    const useCase = import_tsyringe4.container.resolve(CreateServiceUseCase);
    const service = await useCase.execute(data);
    reply.status(201).send({ success: true, data: service });
  }
};

// src/modules/services/useCases/listServices/ListServicesController.ts
var import_tsyringe6 = require("tsyringe");

// src/modules/services/useCases/listServices/ListServicesUseCase.ts
var import_tsyringe5 = require("tsyringe");
var ListServicesUseCase = class {
  constructor(serviceRepository) {
    this.serviceRepository = serviceRepository;
  }
  async execute(barbershopId) {
    return this.serviceRepository.list(barbershopId);
  }
};
ListServicesUseCase = __decorateClass([
  (0, import_tsyringe5.injectable)(),
  __decorateParam(0, (0, import_tsyringe5.inject)("ServiceRepository"))
], ListServicesUseCase);

// src/modules/services/useCases/listServices/ListServicesController.ts
var ListServicesController = class {
  async handle(request, reply) {
    const barbershopId = request.query.barbershopId;
    const useCase = import_tsyringe6.container.resolve(ListServicesUseCase);
    const list = await useCase.execute(barbershopId);
    reply.send({ success: true, data: list });
  }
};

// src/modules/services/useCases/getService/GetServiceController.ts
var import_tsyringe8 = require("tsyringe");

// src/modules/services/useCases/getService/GetServiceUseCase.ts
var import_tsyringe7 = require("tsyringe");
var GetServiceUseCase = class {
  constructor(serviceRepository) {
    this.serviceRepository = serviceRepository;
  }
  async execute(id) {
    const service = await this.serviceRepository.findById(id);
    if (!service) throw new AppError("Servi\xE7o n\xE3o encontrado", 404);
    return service;
  }
};
GetServiceUseCase = __decorateClass([
  (0, import_tsyringe7.injectable)(),
  __decorateParam(0, (0, import_tsyringe7.inject)("ServiceRepository"))
], GetServiceUseCase);

// src/modules/services/useCases/getService/GetServiceController.ts
var GetServiceController = class {
  async handle(request, reply) {
    const { id } = request.params;
    const useCase = import_tsyringe8.container.resolve(GetServiceUseCase);
    const service = await useCase.execute(id);
    reply.send({ success: true, data: service });
  }
};

// src/modules/services/useCases/updateService/UpdateServiceController.ts
var import_tsyringe10 = require("tsyringe");

// src/modules/services/useCases/updateService/UpdateServiceUseCase.ts
var import_tsyringe9 = require("tsyringe");
var UpdateServiceUseCase = class {
  constructor(serviceRepository) {
    this.serviceRepository = serviceRepository;
  }
  async execute(id, data) {
    return this.serviceRepository.update(id, data);
  }
};
UpdateServiceUseCase = __decorateClass([
  (0, import_tsyringe9.injectable)(),
  __decorateParam(0, (0, import_tsyringe9.inject)("ServiceRepository"))
], UpdateServiceUseCase);

// src/modules/services/useCases/updateService/UpdateServiceController.ts
var UpdateServiceController = class {
  async handle(request, reply) {
    const { id } = request.params;
    const data = updateServiceSchema.parse(request.body);
    const useCase = import_tsyringe10.container.resolve(UpdateServiceUseCase);
    const updated = await useCase.execute(id, data);
    reply.send({ success: true, data: updated });
  }
};

// src/modules/services/useCases/deleteService/DeleteServiceController.ts
var import_tsyringe12 = require("tsyringe");

// src/modules/services/useCases/deleteService/DeleteServiceUseCase.ts
var import_tsyringe11 = require("tsyringe");
var DeleteServiceUseCase = class {
  constructor(serviceRepository) {
    this.serviceRepository = serviceRepository;
  }
  async execute(id) {
    await this.serviceRepository.deactivate(id);
  }
};
DeleteServiceUseCase = __decorateClass([
  (0, import_tsyringe11.injectable)(),
  __decorateParam(0, (0, import_tsyringe11.inject)("ServiceRepository"))
], DeleteServiceUseCase);

// src/modules/services/useCases/deleteService/DeleteServiceController.ts
var DeleteServiceController = class {
  async handle(request, reply) {
    const { id } = request.params;
    const useCase = import_tsyringe12.container.resolve(DeleteServiceUseCase);
    await useCase.execute(id);
    reply.status(204).send();
  }
};

// src/shared/infra/http/routes/services.routes.ts
async function servicesRoutes(app) {
  const create = new CreateServiceController();
  const list = new ListServicesController();
  const get = new GetServiceController();
  const update = new UpdateServiceController();
  const del = new DeleteServiceController();
  app.post("/services", { preHandler: [authenticate, authorize(["ADMIN", "OWNER"])] }, create.handle.bind(create));
  app.get("/services", list.handle.bind(list));
  app.get("/services/:id", get.handle.bind(get));
  app.put("/services/:id", { preHandler: [authenticate, authorize(["ADMIN", "OWNER"])] }, update.handle.bind(update));
  app.delete("/services/:id", { preHandler: [authenticate, authorize(["ADMIN", "OWNER"])] }, del.handle.bind(del));
}

// src/modules/barbershops/useCases/createBarbershop/CreateBarbershopController.ts
var import_tsyringe14 = require("tsyringe");

// src/modules/barbershops/schemas/barbershopSchemas.ts
var import_zod3 = require("zod");
var createBarbershopSchema = import_zod3.z.object({
  name: import_zod3.z.string().min(2).max(200),
  whatsapp: import_zod3.z.string().min(8).max(20),
  logoUrl: import_zod3.z.string().url().max(500).optional()
});
var updateBarbershopSchema = import_zod3.z.object({
  name: import_zod3.z.string().min(2).max(200).optional(),
  whatsapp: import_zod3.z.string().min(8).max(20).optional(),
  logoUrl: import_zod3.z.string().url().max(500).nullable().optional(),
  active: import_zod3.z.boolean().optional()
});
var scheduleItemSchema = import_zod3.z.object({
  dayOfWeek: import_zod3.z.number().min(0).max(6),
  isOpen: import_zod3.z.boolean(),
  openTime: import_zod3.z.string().min(4).max(5),
  closeTime: import_zod3.z.string().min(4).max(5)
});
var updateScheduleSchema = import_zod3.z.array(scheduleItemSchema).min(1);

// src/modules/barbershops/useCases/createBarbershop/CreateBarbershopUseCase.ts
var import_tsyringe13 = require("tsyringe");
var CreateBarbershopUseCase = class {
  constructor(barbershopRepository) {
    this.barbershopRepository = barbershopRepository;
  }
  async execute(data) {
    return this.barbershopRepository.create(data);
  }
};
CreateBarbershopUseCase = __decorateClass([
  (0, import_tsyringe13.injectable)(),
  __decorateParam(0, (0, import_tsyringe13.inject)("BarbershopRepository"))
], CreateBarbershopUseCase);

// src/modules/barbershops/useCases/createBarbershop/CreateBarbershopController.ts
var CreateBarbershopController = class {
  async handle(request, reply) {
    const data = createBarbershopSchema.parse(request.body);
    const useCase = import_tsyringe14.container.resolve(CreateBarbershopUseCase);
    const barbershop = await useCase.execute(data);
    reply.status(201).send({ success: true, data: barbershop });
  }
};

// src/modules/barbershops/useCases/listBarbershops/ListBarbershopsController.ts
var import_tsyringe16 = require("tsyringe");

// src/modules/barbershops/useCases/listBarbershops/ListBarbershopsUseCase.ts
var import_tsyringe15 = require("tsyringe");
var ListBarbershopsUseCase = class {
  constructor(barbershopRepository) {
    this.barbershopRepository = barbershopRepository;
  }
  async execute() {
    return this.barbershopRepository.list();
  }
};
ListBarbershopsUseCase = __decorateClass([
  (0, import_tsyringe15.injectable)(),
  __decorateParam(0, (0, import_tsyringe15.inject)("BarbershopRepository"))
], ListBarbershopsUseCase);

// src/modules/barbershops/useCases/listBarbershops/ListBarbershopsController.ts
var ListBarbershopsController = class {
  async handle(request, reply) {
    const useCase = import_tsyringe16.container.resolve(ListBarbershopsUseCase);
    const list = await useCase.execute();
    reply.send({ success: true, data: list });
  }
};

// src/modules/barbershops/useCases/getBarbershop/GetBarbershopController.ts
var import_tsyringe18 = require("tsyringe");

// src/modules/barbershops/useCases/getBarbershop/GetBarbershopUseCase.ts
var import_tsyringe17 = require("tsyringe");
var GetBarbershopUseCase = class {
  constructor(barbershopRepository) {
    this.barbershopRepository = barbershopRepository;
  }
  async execute(id) {
    const entity = await this.barbershopRepository.findById(id);
    if (!entity) throw new AppError("Barbearia n\xE3o encontrada", 404);
    return entity;
  }
};
GetBarbershopUseCase = __decorateClass([
  (0, import_tsyringe17.injectable)(),
  __decorateParam(0, (0, import_tsyringe17.inject)("BarbershopRepository"))
], GetBarbershopUseCase);

// src/modules/barbershops/useCases/getBarbershop/GetBarbershopController.ts
var GetBarbershopController = class {
  async handle(request, reply) {
    const { id } = request.params;
    const useCase = import_tsyringe18.container.resolve(GetBarbershopUseCase);
    const entity = await useCase.execute(id);
    reply.send({ success: true, data: entity });
  }
};

// src/modules/barbershops/useCases/updateBarbershop/UpdateBarbershopController.ts
var import_tsyringe20 = require("tsyringe");

// src/modules/barbershops/useCases/updateBarbershop/UpdateBarbershopUseCase.ts
var import_tsyringe19 = require("tsyringe");
var UpdateBarbershopUseCase = class {
  constructor(barbershopRepository) {
    this.barbershopRepository = barbershopRepository;
  }
  async execute(id, data) {
    return this.barbershopRepository.update(id, data);
  }
};
UpdateBarbershopUseCase = __decorateClass([
  (0, import_tsyringe19.injectable)(),
  __decorateParam(0, (0, import_tsyringe19.inject)("BarbershopRepository"))
], UpdateBarbershopUseCase);

// src/modules/barbershops/useCases/updateBarbershop/UpdateBarbershopController.ts
var UpdateBarbershopController = class {
  async handle(request, reply) {
    const { id } = request.params;
    const data = updateBarbershopSchema.parse(request.body);
    const useCase = import_tsyringe20.container.resolve(UpdateBarbershopUseCase);
    const updated = await useCase.execute(id, data);
    reply.send({ success: true, data: updated });
  }
};

// src/modules/barbershops/useCases/deleteBarbershop/DeleteBarbershopController.ts
var import_tsyringe22 = require("tsyringe");

// src/modules/barbershops/useCases/deleteBarbershop/DeleteBarbershopUseCase.ts
var import_tsyringe21 = require("tsyringe");
var DeleteBarbershopUseCase = class {
  constructor(barbershopRepository) {
    this.barbershopRepository = barbershopRepository;
  }
  async execute(id) {
    await this.barbershopRepository.deactivate(id);
  }
};
DeleteBarbershopUseCase = __decorateClass([
  (0, import_tsyringe21.injectable)(),
  __decorateParam(0, (0, import_tsyringe21.inject)("BarbershopRepository"))
], DeleteBarbershopUseCase);

// src/modules/barbershops/useCases/deleteBarbershop/DeleteBarbershopController.ts
var DeleteBarbershopController = class {
  async handle(request, reply) {
    const { id } = request.params;
    const useCase = import_tsyringe22.container.resolve(DeleteBarbershopUseCase);
    await useCase.execute(id);
    reply.status(204).send();
  }
};

// src/modules/barbershops/useCases/getSchedule/GetScheduleController.ts
var import_tsyringe24 = require("tsyringe");

// src/modules/barbershops/useCases/getSchedule/GetScheduleUseCase.ts
var import_tsyringe23 = require("tsyringe");
var GetScheduleUseCase = class {
  constructor(barbershopRepository) {
    this.barbershopRepository = barbershopRepository;
  }
  async execute(barbershopId) {
    return this.barbershopRepository.getSchedule(barbershopId);
  }
};
GetScheduleUseCase = __decorateClass([
  (0, import_tsyringe23.injectable)(),
  __decorateParam(0, (0, import_tsyringe23.inject)("BarbershopRepository"))
], GetScheduleUseCase);

// src/modules/barbershops/useCases/getSchedule/GetScheduleController.ts
var GetScheduleController = class {
  async handle(request, reply) {
    const { id } = request.params;
    const useCase = import_tsyringe24.container.resolve(GetScheduleUseCase);
    const schedule = await useCase.execute(id);
    reply.send({ success: true, data: schedule });
  }
};

// src/modules/barbershops/useCases/updateSchedule/UpdateScheduleController.ts
var import_tsyringe26 = require("tsyringe");

// src/modules/barbershops/useCases/updateSchedule/UpdateScheduleUseCase.ts
var import_tsyringe25 = require("tsyringe");
var UpdateScheduleUseCase = class {
  constructor(barbershopRepository) {
    this.barbershopRepository = barbershopRepository;
  }
  async execute(barbershopId, schedule) {
    await this.barbershopRepository.updateSchedule(barbershopId, schedule);
    const updated = await this.barbershopRepository.getSchedule(barbershopId);
    return updated;
  }
};
UpdateScheduleUseCase = __decorateClass([
  (0, import_tsyringe25.injectable)(),
  __decorateParam(0, (0, import_tsyringe25.inject)("BarbershopRepository"))
], UpdateScheduleUseCase);

// src/modules/barbershops/useCases/updateSchedule/UpdateScheduleController.ts
var UpdateScheduleController = class {
  async handle(request, reply) {
    const { id } = request.params;
    const data = updateScheduleSchema.parse(request.body);
    const useCase = import_tsyringe26.container.resolve(UpdateScheduleUseCase);
    const updated = await useCase.execute(id, data);
    reply.status(200).send({
      success: true,
      message: "Agenda atualizada com sucesso",
      data: updated
    });
  }
};

// src/shared/infra/http/routes/barbershops.routes.ts
async function barbershopsRoutes(app) {
  const create = new CreateBarbershopController();
  const list = new ListBarbershopsController();
  const get = new GetBarbershopController();
  const update = new UpdateBarbershopController();
  const del = new DeleteBarbershopController();
  const getSchedule = new GetScheduleController();
  const updateSchedule = new UpdateScheduleController();
  app.post("/barbershops", { preHandler: [authenticate, authorize(["ADMIN"])] }, create.handle.bind(create));
  app.get("/barbershops", list.handle.bind(list));
  app.get("/barbershops/:id", get.handle.bind(get));
  app.put("/barbershops/:id", { preHandler: [authenticate, authorize(["ADMIN", "OWNER"])] }, update.handle.bind(update));
  app.delete("/barbershops/:id", { preHandler: [authenticate, authorize(["ADMIN"])] }, del.handle.bind(del));
  app.get("/barbershops/:id/schedule", getSchedule.handle.bind(getSchedule));
  app.put("/barbershops/:id/schedule", { preHandler: [authenticate, authorize(["ADMIN", "OWNER"])] }, updateSchedule.handle.bind(updateSchedule));
}

// src/shared/infra/http/routes/index.ts
async function registerRoutes(app) {
  app.get("/health", async () => ({ status: "ok" }));
  await usersRoutes(app);
  await servicesRoutes(app);
  await barbershopsRoutes(app);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  registerRoutes
});
