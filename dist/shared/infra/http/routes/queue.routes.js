"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
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

// src/shared/errors/AppError.ts
var AppError_exports = {};
__export(AppError_exports, {
  AppError: () => AppError
});
var AppError;
var init_AppError = __esm({
  "src/shared/errors/AppError.ts"() {
    "use strict";
    AppError = class extends Error {
      statusCode;
      errors;
      constructor(message, statusCode = 400, errors) {
        super(message);
        this.statusCode = statusCode;
        this.errors = errors;
      }
    };
  }
});

// src/shared/infra/http/routes/queue.routes.ts
var queue_routes_exports = {};
__export(queue_routes_exports, {
  queueRoutes: () => queueRoutes
});
module.exports = __toCommonJS(queue_routes_exports);

// src/shared/infra/http/middlewares/authenticate.ts
var import_jsonwebtoken = require("jsonwebtoken");
init_AppError();

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

// src/modules/queue/useCases/listQueue/ListQueueController.ts
var import_tsyringe2 = require("tsyringe");

// src/modules/queue/useCases/listQueue/ListQueueUseCase.ts
var import_tsyringe = require("tsyringe");
var ListQueueUseCase = class {
  constructor(queueRepository) {
    this.queueRepository = queueRepository;
  }
  async execute(barbershopId) {
    return this.queueRepository.list(barbershopId);
  }
};
ListQueueUseCase = __decorateClass([
  (0, import_tsyringe.injectable)(),
  __decorateParam(0, (0, import_tsyringe.inject)("QueueRepository"))
], ListQueueUseCase);

// src/modules/queue/useCases/listQueue/ListQueueController.ts
var ListQueueController = class {
  async handle(request, reply) {
    const { barbershopId } = request.query;
    const listQueueUseCase = import_tsyringe2.container.resolve(ListQueueUseCase);
    const queue = await listQueueUseCase.execute(barbershopId);
    return reply.status(200).send(queue);
  }
};

// src/modules/queue/useCases/joinQueue/JoinQueueController.ts
var import_tsyringe4 = require("tsyringe");

// src/modules/queue/useCases/joinQueue/JoinQueueUseCase.ts
var import_tsyringe3 = require("tsyringe");
var JoinQueueUseCase = class {
  constructor(queueRepository) {
    this.queueRepository = queueRepository;
  }
  async execute(data) {
    return this.queueRepository.create(data);
  }
};
JoinQueueUseCase = __decorateClass([
  (0, import_tsyringe3.injectable)(),
  __decorateParam(0, (0, import_tsyringe3.inject)("QueueRepository"))
], JoinQueueUseCase);

// src/modules/queue/useCases/joinQueue/JoinQueueController.ts
var import_zod = require("zod");
var JoinQueueController = class {
  async handle(request, reply) {
    const schema = import_zod.z.object({
      barbershopId: import_zod.z.string().uuid(),
      serviceId: import_zod.z.string().uuid(),
      customerId: import_zod.z.string(),
      customerName: import_zod.z.string(),
      whatsapp: import_zod.z.string(),
      addedByStaff: import_zod.z.boolean().optional()
    });
    const data = schema.parse(request.body);
    const useCase = import_tsyringe4.container.resolve(JoinQueueUseCase);
    const item = await useCase.execute(data);
    return reply.status(201).send(item);
  }
};

// src/modules/queue/useCases/updateQueueItem/UpdateQueueItemController.ts
var import_tsyringe6 = require("tsyringe");

// src/modules/queue/useCases/updateQueueItem/UpdateQueueItemUseCase.ts
var import_tsyringe5 = require("tsyringe");
var UpdateQueueItemUseCase = class {
  constructor(queueRepository) {
    this.queueRepository = queueRepository;
  }
  async execute(id, status, details) {
    const item = await this.queueRepository.findById(id);
    if (!item) throw new (await Promise.resolve().then(() => (init_AppError(), AppError_exports))).AppError("Item de fila n\xE3o encontrado", 404);
    return this.queueRepository.updateStatus(id, status, details);
  }
};
UpdateQueueItemUseCase = __decorateClass([
  (0, import_tsyringe5.injectable)(),
  __decorateParam(0, (0, import_tsyringe5.inject)("QueueRepository"))
], UpdateQueueItemUseCase);

// src/modules/queue/useCases/updateQueueItem/UpdateQueueItemController.ts
var UpdateQueueItemController = class {
  async handle(request, reply) {
    const { id } = request.params;
    const { status, ...details } = request.body;
    const useCase = import_tsyringe6.container.resolve(UpdateQueueItemUseCase);
    const item = await useCase.execute(id, status, details);
    return reply.status(200).send(item);
  }
};

// src/modules/queue/useCases/deleteQueueItem/DeleteQueueItemController.ts
var import_tsyringe8 = require("tsyringe");

// src/modules/queue/useCases/deleteQueueItem/DeleteQueueItemUseCase.ts
var import_tsyringe7 = require("tsyringe");
var DeleteQueueItemUseCase = class {
  constructor(queueRepository) {
    this.queueRepository = queueRepository;
  }
  async execute(id) {
    await this.queueRepository.delete(id);
  }
};
DeleteQueueItemUseCase = __decorateClass([
  (0, import_tsyringe7.injectable)(),
  __decorateParam(0, (0, import_tsyringe7.inject)("QueueRepository"))
], DeleteQueueItemUseCase);

// src/modules/queue/useCases/deleteQueueItem/DeleteQueueItemController.ts
var DeleteQueueItemController = class {
  async handle(request, reply) {
    const { id } = request.params;
    const useCase = import_tsyringe8.container.resolve(DeleteQueueItemUseCase);
    await useCase.execute(id);
    return reply.status(204).send();
  }
};

// src/modules/queue/useCases/getQueueMetrics/GetQueueMetricsController.ts
var import_tsyringe10 = require("tsyringe");

// src/modules/queue/useCases/getQueueMetrics/GetQueueMetricsUseCase.ts
var import_tsyringe9 = require("tsyringe");
var GetQueueMetricsUseCase = class {
  constructor(queueRepository) {
    this.queueRepository = queueRepository;
  }
  async execute(barbershopId) {
    const count = await this.queueRepository.countCompleted(barbershopId);
    return { completedCount: count };
  }
};
GetQueueMetricsUseCase = __decorateClass([
  (0, import_tsyringe9.injectable)(),
  __decorateParam(0, (0, import_tsyringe9.inject)("QueueRepository"))
], GetQueueMetricsUseCase);

// src/modules/queue/useCases/getQueueMetrics/GetQueueMetricsController.ts
var GetQueueMetricsController = class {
  async handle(request, reply) {
    const { barbershopId } = request.query;
    const getQueueMetricsUseCase = import_tsyringe10.container.resolve(GetQueueMetricsUseCase);
    const metrics = await getQueueMetricsUseCase.execute(barbershopId);
    return reply.status(200).send(metrics);
  }
};

// src/shared/infra/http/routes/queue.routes.ts
async function queueRoutes(app) {
  const list = new ListQueueController();
  const join = new JoinQueueController();
  const update = new UpdateQueueItemController();
  const del = new DeleteQueueItemController();
  const metrics = new GetQueueMetricsController();
  app.get("/queue", list.handle.bind(list));
  app.post("/queue", join.handle.bind(join));
  app.patch("/queue/:id", { preHandler: [authenticate] }, update.handle.bind(update));
  app.delete("/queue/:id", { preHandler: [authenticate] }, del.handle.bind(del));
  app.get("/queue/metrics", metrics.handle.bind(metrics));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  queueRoutes
});
