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

// src/modules/barbershops/useCases/updateSchedule/UpdateScheduleController.ts
var UpdateScheduleController_exports = {};
__export(UpdateScheduleController_exports, {
  UpdateScheduleController: () => UpdateScheduleController
});
module.exports = __toCommonJS(UpdateScheduleController_exports);
var import_tsyringe2 = require("tsyringe");

// src/modules/barbershops/schemas/barbershopSchemas.ts
var import_zod = require("zod");
var createBarbershopSchema = import_zod.z.object({
  name: import_zod.z.string().min(2).max(200),
  whatsapp: import_zod.z.string().min(8).max(20),
  logoUrl: import_zod.z.string().url().max(500).optional()
});
var updateBarbershopSchema = import_zod.z.object({
  name: import_zod.z.string().min(2).max(200).optional(),
  whatsapp: import_zod.z.string().min(8).max(20).optional(),
  logoUrl: import_zod.z.string().url().max(500).nullable().optional(),
  active: import_zod.z.boolean().optional()
});
var scheduleItemSchema = import_zod.z.object({
  dayOfWeek: import_zod.z.number().min(0).max(6),
  isOpen: import_zod.z.boolean(),
  openTime: import_zod.z.string().min(4).max(5),
  closeTime: import_zod.z.string().min(4).max(5)
});
var updateScheduleSchema = import_zod.z.array(scheduleItemSchema).min(1);

// src/modules/barbershops/useCases/updateSchedule/UpdateScheduleUseCase.ts
var import_tsyringe = require("tsyringe");
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
  (0, import_tsyringe.injectable)(),
  __decorateParam(0, (0, import_tsyringe.inject)("BarbershopRepository"))
], UpdateScheduleUseCase);

// src/modules/barbershops/useCases/updateSchedule/UpdateScheduleController.ts
var UpdateScheduleController = class {
  async handle(request, reply) {
    const { id } = request.params;
    const data = updateScheduleSchema.parse(request.body);
    const useCase = import_tsyringe2.container.resolve(UpdateScheduleUseCase);
    const updated = await useCase.execute(id, data);
    reply.status(200).send({
      success: true,
      message: "Agenda atualizada com sucesso",
      data: updated
    });
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  UpdateScheduleController
});
