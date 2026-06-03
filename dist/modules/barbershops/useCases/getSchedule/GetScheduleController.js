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

// src/modules/barbershops/useCases/getSchedule/GetScheduleController.ts
var GetScheduleController_exports = {};
__export(GetScheduleController_exports, {
  GetScheduleController: () => GetScheduleController
});
module.exports = __toCommonJS(GetScheduleController_exports);
var import_tsyringe2 = require("tsyringe");

// src/modules/barbershops/useCases/getSchedule/GetScheduleUseCase.ts
var import_tsyringe = require("tsyringe");
var GetScheduleUseCase = class {
  constructor(barbershopRepository) {
    this.barbershopRepository = barbershopRepository;
  }
  async execute(barbershopId) {
    return this.barbershopRepository.getSchedule(barbershopId);
  }
};
GetScheduleUseCase = __decorateClass([
  (0, import_tsyringe.injectable)(),
  __decorateParam(0, (0, import_tsyringe.inject)("BarbershopRepository"))
], GetScheduleUseCase);

// src/modules/barbershops/useCases/getSchedule/GetScheduleController.ts
var GetScheduleController = class {
  async handle(request, reply) {
    const { id } = request.params;
    const useCase = import_tsyringe2.container.resolve(GetScheduleUseCase);
    const schedule = await useCase.execute(id);
    reply.send({ success: true, data: schedule });
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  GetScheduleController
});
