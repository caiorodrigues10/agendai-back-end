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

// src/modules/queue/useCases/deleteQueueItem/DeleteQueueItemController.ts
var DeleteQueueItemController_exports = {};
__export(DeleteQueueItemController_exports, {
  DeleteQueueItemController: () => DeleteQueueItemController
});
module.exports = __toCommonJS(DeleteQueueItemController_exports);
var import_tsyringe2 = require("tsyringe");

// src/modules/queue/useCases/deleteQueueItem/DeleteQueueItemUseCase.ts
var import_tsyringe = require("tsyringe");
var DeleteQueueItemUseCase = class {
  constructor(queueRepository) {
    this.queueRepository = queueRepository;
  }
  async execute(id) {
    await this.queueRepository.delete(id);
  }
};
DeleteQueueItemUseCase = __decorateClass([
  (0, import_tsyringe.injectable)(),
  __decorateParam(0, (0, import_tsyringe.inject)("QueueRepository"))
], DeleteQueueItemUseCase);

// src/modules/queue/useCases/deleteQueueItem/DeleteQueueItemController.ts
var DeleteQueueItemController = class {
  async handle(request, reply) {
    const { id } = request.params;
    const useCase = import_tsyringe2.container.resolve(DeleteQueueItemUseCase);
    await useCase.execute(id);
    return reply.status(204).send();
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DeleteQueueItemController
});
