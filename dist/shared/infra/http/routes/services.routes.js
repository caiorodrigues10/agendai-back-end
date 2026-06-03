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

// src/shared/infra/http/routes/services.routes.ts
var services_routes_exports = {};
__export(services_routes_exports, {
  servicesRoutes: () => servicesRoutes
});
module.exports = __toCommonJS(services_routes_exports);

// src/shared/infra/http/middlewares/authenticate.ts
var import_jsonwebtoken = require("jsonwebtoken");

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
var import_tsyringe2 = require("tsyringe");

// src/modules/services/schemas/serviceSchemas.ts
var import_zod = require("zod");
var createServiceSchema = import_zod.z.object({
  barbershopId: import_zod.z.string().uuid(),
  name: import_zod.z.string().min(2).max(100),
  price: import_zod.z.number().min(0),
  avgTimeMinutes: import_zod.z.number().min(1),
  icon: import_zod.z.string().min(1).max(50)
});
var updateServiceSchema = import_zod.z.object({
  name: import_zod.z.string().min(2).max(100).optional(),
  price: import_zod.z.number().min(0).optional(),
  avgTimeMinutes: import_zod.z.number().min(1).optional(),
  icon: import_zod.z.string().min(1).max(50).optional(),
  active: import_zod.z.boolean().optional()
});

// src/modules/services/useCases/createService/CreateServiceUseCase.ts
var import_tsyringe = require("tsyringe");
var CreateServiceUseCase = class {
  constructor(serviceRepository) {
    this.serviceRepository = serviceRepository;
  }
  async execute(data) {
    return this.serviceRepository.create(data);
  }
};
CreateServiceUseCase = __decorateClass([
  (0, import_tsyringe.injectable)(),
  __decorateParam(0, (0, import_tsyringe.inject)("ServiceRepository"))
], CreateServiceUseCase);

// src/modules/services/useCases/createService/CreateServiceController.ts
var CreateServiceController = class {
  async handle(request, reply) {
    const data = createServiceSchema.parse(request.body);
    const useCase = import_tsyringe2.container.resolve(CreateServiceUseCase);
    const service = await useCase.execute(data);
    reply.status(201).send({ success: true, data: service });
  }
};

// src/modules/services/useCases/listServices/ListServicesController.ts
var import_tsyringe4 = require("tsyringe");

// src/modules/services/useCases/listServices/ListServicesUseCase.ts
var import_tsyringe3 = require("tsyringe");
var ListServicesUseCase = class {
  constructor(serviceRepository) {
    this.serviceRepository = serviceRepository;
  }
  async execute(barbershopId) {
    return this.serviceRepository.list(barbershopId);
  }
};
ListServicesUseCase = __decorateClass([
  (0, import_tsyringe3.injectable)(),
  __decorateParam(0, (0, import_tsyringe3.inject)("ServiceRepository"))
], ListServicesUseCase);

// src/modules/services/useCases/listServices/ListServicesController.ts
var ListServicesController = class {
  async handle(request, reply) {
    const barbershopId = request.query.barbershopId;
    const useCase = import_tsyringe4.container.resolve(ListServicesUseCase);
    const list = await useCase.execute(barbershopId);
    reply.send({ success: true, data: list });
  }
};

// src/modules/services/useCases/getService/GetServiceController.ts
var import_tsyringe6 = require("tsyringe");

// src/modules/services/useCases/getService/GetServiceUseCase.ts
var import_tsyringe5 = require("tsyringe");
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
  (0, import_tsyringe5.injectable)(),
  __decorateParam(0, (0, import_tsyringe5.inject)("ServiceRepository"))
], GetServiceUseCase);

// src/modules/services/useCases/getService/GetServiceController.ts
var GetServiceController = class {
  async handle(request, reply) {
    const { id } = request.params;
    const useCase = import_tsyringe6.container.resolve(GetServiceUseCase);
    const service = await useCase.execute(id);
    reply.send({ success: true, data: service });
  }
};

// src/modules/services/useCases/updateService/UpdateServiceController.ts
var import_tsyringe8 = require("tsyringe");

// src/modules/services/useCases/updateService/UpdateServiceUseCase.ts
var import_tsyringe7 = require("tsyringe");
var UpdateServiceUseCase = class {
  constructor(serviceRepository) {
    this.serviceRepository = serviceRepository;
  }
  async execute(id, data) {
    return this.serviceRepository.update(id, data);
  }
};
UpdateServiceUseCase = __decorateClass([
  (0, import_tsyringe7.injectable)(),
  __decorateParam(0, (0, import_tsyringe7.inject)("ServiceRepository"))
], UpdateServiceUseCase);

// src/modules/services/useCases/updateService/UpdateServiceController.ts
var UpdateServiceController = class {
  async handle(request, reply) {
    const { id } = request.params;
    const data = updateServiceSchema.parse(request.body);
    const useCase = import_tsyringe8.container.resolve(UpdateServiceUseCase);
    const updated = await useCase.execute(id, data);
    reply.send({ success: true, data: updated });
  }
};

// src/modules/services/useCases/deleteService/DeleteServiceController.ts
var import_tsyringe10 = require("tsyringe");

// src/modules/services/useCases/deleteService/DeleteServiceUseCase.ts
var import_tsyringe9 = require("tsyringe");
var DeleteServiceUseCase = class {
  constructor(serviceRepository) {
    this.serviceRepository = serviceRepository;
  }
  async execute(id) {
    await this.serviceRepository.deactivate(id);
  }
};
DeleteServiceUseCase = __decorateClass([
  (0, import_tsyringe9.injectable)(),
  __decorateParam(0, (0, import_tsyringe9.inject)("ServiceRepository"))
], DeleteServiceUseCase);

// src/modules/services/useCases/deleteService/DeleteServiceController.ts
var DeleteServiceController = class {
  async handle(request, reply) {
    const { id } = request.params;
    const useCase = import_tsyringe10.container.resolve(DeleteServiceUseCase);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  servicesRoutes
});
