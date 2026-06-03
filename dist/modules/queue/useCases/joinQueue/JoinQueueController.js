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

// src/modules/queue/useCases/joinQueue/JoinQueueController.ts
var JoinQueueController_exports = {};
__export(JoinQueueController_exports, {
  JoinQueueController: () => JoinQueueController
});
module.exports = __toCommonJS(JoinQueueController_exports);
var import_tsyringe2 = require("tsyringe");

// src/modules/queue/useCases/joinQueue/JoinQueueUseCase.ts
var import_tsyringe = require("tsyringe");
var JoinQueueUseCase = class {
  constructor(queueRepository) {
    this.queueRepository = queueRepository;
  }
  async execute(data) {
    return this.queueRepository.create(data);
  }
};
JoinQueueUseCase = __decorateClass([
  (0, import_tsyringe.injectable)(),
  __decorateParam(0, (0, import_tsyringe.inject)("QueueRepository"))
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
    const useCase = import_tsyringe2.container.resolve(JoinQueueUseCase);
    const item = await useCase.execute(data);
    return reply.status(201).send(item);
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  JoinQueueController
});
