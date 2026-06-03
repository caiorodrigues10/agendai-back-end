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

// src/modules/barbershops/schemas/barbershopSchemas.ts
var barbershopSchemas_exports = {};
__export(barbershopSchemas_exports, {
  createBarbershopSchema: () => createBarbershopSchema,
  scheduleItemSchema: () => scheduleItemSchema,
  updateBarbershopSchema: () => updateBarbershopSchema,
  updateScheduleSchema: () => updateScheduleSchema
});
module.exports = __toCommonJS(barbershopSchemas_exports);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createBarbershopSchema,
  scheduleItemSchema,
  updateBarbershopSchema,
  updateScheduleSchema
});
