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

// src/modules/users/schemas/userSchemas.ts
var userSchemas_exports = {};
__export(userSchemas_exports, {
  createUserSchema: () => createUserSchema,
  loginSchema: () => loginSchema,
  updateUserSchema: () => updateUserSchema
});
module.exports = __toCommonJS(userSchemas_exports);
var import_zod = require("zod");
var createUserSchema = import_zod.z.object({
  name: import_zod.z.string().min(3, "Nome deve ter no m\xEDnimo 3 caracteres").max(200, "Nome muito longo"),
  email: import_zod.z.string().email("E-mail inv\xE1lido").max(100, "E-mail muito longo"),
  password: import_zod.z.string().min(6, "Senha deve ter no m\xEDnimo 6 caracteres").max(100, "Senha muito longa"),
  role: import_zod.z.enum(["ADMIN", "OWNER", "EMPLOYEE"]).optional(),
  barbershopId: import_zod.z.string().uuid("ID de barbearia inv\xE1lido").optional()
});
var updateUserSchema = createUserSchema.partial();
var loginSchema = import_zod.z.object({
  email: import_zod.z.string().email("E-mail inv\xE1lido"),
  password: import_zod.z.string().min(1, "Senha obrigat\xF3ria")
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createUserSchema,
  loginSchema,
  updateUserSchema
});
