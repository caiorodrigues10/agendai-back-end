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

// src/modules/queue/infra/repositories/mocks/MockQueueRepository.ts
var MockQueueRepository_exports = {};
__export(MockQueueRepository_exports, {
  MockQueueRepository: () => MockQueueRepository
});
module.exports = __toCommonJS(MockQueueRepository_exports);
var MockQueueRepository = class {
  data = [];
  seq = 1;
  async create(payload) {
    const id = `queue-${this.seq++}`;
    const now = Date.now();
    const entity = {
      id,
      barbershopId: payload.barbershopId,
      serviceId: payload.serviceId,
      customerId: payload.customerId,
      customerName: payload.customerName,
      whatsapp: payload.whatsapp,
      joinedAt: now,
      status: "waiting",
      addedByStaff: payload.addedByStaff ?? false
    };
    this.data.push(entity);
    return entity;
  }
  async list(barbershopId) {
    if (!barbershopId) return [...this.data];
    return this.data.filter((q) => q.barbershopId === barbershopId);
  }
  async findById(id) {
    return this.data.find((q) => q.id === id) ?? null;
  }
  async updateStatus(id, status, details) {
    const idx = this.data.findIndex((q) => q.id === id);
    if (idx < 0) throw new Error("not found");
    const current = this.data[idx];
    const patch = { status };
    if (status === "completed") {
      patch.completedAt = Date.now();
      if (details?.completedBy) patch.completedBy = details.completedBy;
      if (details?.finalPrice != null) patch.finalPrice = details.finalPrice;
    }
    const updated = { ...current, ...patch };
    this.data[idx] = updated;
    return updated;
  }
  async delete(id) {
    this.data = this.data.filter((q) => q.id !== id);
  }
  async countCompleted(barbershopId) {
    return this.data.filter((q) => q.status === "completed" && (!barbershopId || q.barbershopId === barbershopId)).length;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MockQueueRepository
});
