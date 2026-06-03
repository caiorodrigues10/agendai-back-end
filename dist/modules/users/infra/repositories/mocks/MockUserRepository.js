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

// src/modules/users/infra/repositories/mocks/MockUserRepository.ts
var MockUserRepository_exports = {};
__export(MockUserRepository_exports, {
  MockUserRepository: () => MockUserRepository
});
module.exports = __toCommonJS(MockUserRepository_exports);
var MockUserRepository = class {
  data = [];
  seq = 1;
  async create(payload) {
    const id = `user-${this.seq++}`;
    const now = /* @__PURE__ */ new Date();
    const role = payload.role ?? "EMPLOYEE";
    const entity = {
      id,
      name: payload.name,
      email: payload.email,
      role,
      barbershopId: payload.barbershopId ?? null,
      createdAt: now,
      active: true,
      password: payload.password
    };
    this.data.push(entity);
    return entity;
  }
  async findById(id) {
    return this.data.find((u) => u.id === id) ?? null;
  }
  async findByEmail(email) {
    return this.data.find((u) => u.email === email) ?? null;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MockUserRepository
});
