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

// src/modules/services/schemas/serviceSchemas.ts
var serviceSchemas_exports = {};
__export(serviceSchemas_exports, {
  createServiceSchema: () => createServiceSchema,
  updateServiceSchema: () => updateServiceSchema
});
module.exports = __toCommonJS(serviceSchemas_exports);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createServiceSchema,
  updateServiceSchema
});
