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

// src/modules/services/useCases/getService/GetServiceController.ts
var GetServiceController_exports = {};
__export(GetServiceController_exports, {
  GetServiceController: () => GetServiceController
});
module.exports = __toCommonJS(GetServiceController_exports);
var import_tsyringe2 = require("tsyringe");

// src/modules/services/useCases/getService/GetServiceUseCase.ts
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

// src/modules/services/useCases/getService/GetServiceUseCase.ts
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
  (0, import_tsyringe.injectable)(),
  __decorateParam(0, (0, import_tsyringe.inject)("ServiceRepository"))
], GetServiceUseCase);

// src/modules/services/useCases/getService/GetServiceController.ts
var GetServiceController = class {
  async handle(request, reply) {
    const { id } = request.params;
    const useCase = import_tsyringe2.container.resolve(GetServiceUseCase);
    const service = await useCase.execute(id);
    reply.send({ success: true, data: service });
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  GetServiceController
});
