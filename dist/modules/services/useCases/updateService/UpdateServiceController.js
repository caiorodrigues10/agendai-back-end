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

// src/modules/services/useCases/updateService/UpdateServiceController.ts
var UpdateServiceController_exports = {};
__export(UpdateServiceController_exports, {
  UpdateServiceController: () => UpdateServiceController
});
module.exports = __toCommonJS(UpdateServiceController_exports);
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

// src/modules/services/useCases/updateService/UpdateServiceUseCase.ts
var import_tsyringe = require("tsyringe");
var UpdateServiceUseCase = class {
  constructor(serviceRepository) {
    this.serviceRepository = serviceRepository;
  }
  async execute(id, data) {
    return this.serviceRepository.update(id, data);
  }
};
UpdateServiceUseCase = __decorateClass([
  (0, import_tsyringe.injectable)(),
  __decorateParam(0, (0, import_tsyringe.inject)("ServiceRepository"))
], UpdateServiceUseCase);

// src/modules/services/useCases/updateService/UpdateServiceController.ts
var UpdateServiceController = class {
  async handle(request, reply) {
    const { id } = request.params;
    const data = updateServiceSchema.parse(request.body);
    const useCase = import_tsyringe2.container.resolve(UpdateServiceUseCase);
    const updated = await useCase.execute(id, data);
    reply.send({ success: true, data: updated });
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  UpdateServiceController
});
