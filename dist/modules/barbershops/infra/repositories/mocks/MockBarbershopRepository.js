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

// src/modules/barbershops/infra/repositories/mocks/MockBarbershopRepository.ts
var MockBarbershopRepository_exports = {};
__export(MockBarbershopRepository_exports, {
  MockBarbershopRepository: () => MockBarbershopRepository
});
module.exports = __toCommonJS(MockBarbershopRepository_exports);
var MockBarbershopRepository = class {
  data = [];
  schedules = {};
  seq = 1;
  async create(payload) {
    const id = `shop-${this.seq++}`;
    const now = /* @__PURE__ */ new Date();
    const entity = {
      id,
      name: payload.name,
      whatsapp: payload.whatsapp,
      logoUrl: payload.logoUrl ?? null,
      createdAt: now,
      active: true
    };
    this.data.push(entity);
    this.schedules[id] = [];
    return entity;
  }
  async findById(id) {
    return this.data.find((b) => b.id === id) ?? null;
  }
  async list() {
    return [...this.data];
  }
  async update(id, payload) {
    const idx = this.data.findIndex((b) => b.id === id);
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
  async getSchedule(barbershopId) {
    return [...this.schedules[barbershopId] ?? []];
  }
  async updateSchedule(barbershopId, schedule) {
    this.schedules[barbershopId] = [...schedule];
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MockBarbershopRepository
});
