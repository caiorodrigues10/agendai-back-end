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

// src/modules/queue/useCases/updateQueueItem/UpdateQueueItemController.ts
var UpdateQueueItemController_exports = {};
__export(UpdateQueueItemController_exports, {
  UpdateQueueItemController: () => UpdateQueueItemController
});
module.exports = __toCommonJS(UpdateQueueItemController_exports);
var import_tsyringe2 = require("tsyringe");

// src/modules/queue/useCases/updateQueueItem/UpdateQueueItemUseCase.ts
var import_tsyringe = require("tsyringe");
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
  (0, import_tsyringe.injectable)(),
  __decorateParam(0, (0, import_tsyringe.inject)("QueueRepository"))
], UpdateQueueItemUseCase);

// src/modules/queue/useCases/updateQueueItem/UpdateQueueItemController.ts
var UpdateQueueItemController = class {
  async handle(request, reply) {
    const { id } = request.params;
    const { status, ...details } = request.body;
    const useCase = import_tsyringe2.container.resolve(UpdateQueueItemUseCase);
    const item = await useCase.execute(id, status, details);
    return reply.status(200).send(item);
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  UpdateQueueItemController
});
