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

// src/modules/services/useCases/createService/CreateServiceController.ts
var CreateServiceController_exports = {};
__export(CreateServiceController_exports, {
  CreateServiceController: () => CreateServiceController
});
module.exports = __toCommonJS(CreateServiceController_exports);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CreateServiceController
});
