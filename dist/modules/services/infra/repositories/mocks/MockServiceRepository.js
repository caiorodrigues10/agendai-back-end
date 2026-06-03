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

// src/modules/services/infra/repositories/mocks/MockServiceRepository.ts
var MockServiceRepository_exports = {};
__export(MockServiceRepository_exports, {
  MockServiceRepository: () => MockServiceRepository
});
module.exports = __toCommonJS(MockServiceRepository_exports);
var MockServiceRepository = class {
  data = [];
  seq = 1;
  async create(payload) {
    const id = `service-${this.seq++}`;
    const now = /* @__PURE__ */ new Date();
    const entity = {
      id,
      barbershopId: payload.barbershopId,
      name: payload.name,
      price: payload.price,
      avgTimeMinutes: payload.avgTimeMinutes,
      icon: payload.icon,
      createdAt: now,
      active: true
    };
    this.data.push(entity);
    return entity;
  }
  async findById(id) {
    return this.data.find((s) => s.id === id) ?? null;
  }
  async list(barbershopId) {
    if (!barbershopId) return [...this.data];
    return this.data.filter((s) => s.barbershopId === barbershopId);
  }
  async update(id, payload) {
    const idx = this.data.findIndex((s) => s.id === id);
    if (idx < 0) throw new Error("not found");
    const current = this.data[idx];
    const updated = {
      ...current,
      ...payload
    };
    this.data[idx] = updated;
    return updated;
  }
  async deactivate(id) {
    const entity = await this.findById(id);
    if (!entity) return;
    entity.active = false;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MockServiceRepository
});
