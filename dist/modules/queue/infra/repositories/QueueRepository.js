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

// src/modules/queue/infra/repositories/QueueRepository.ts
var QueueRepository_exports = {};
__export(QueueRepository_exports, {
  QueueRepository: () => QueueRepository
});
module.exports = __toCommonJS(QueueRepository_exports);

// src/libs/prismaClient.ts
var import_pg = require("pg");
var import_adapter_pg = require("@prisma/adapter-pg");
var import_client = require("@prisma/client");
var connectionString = process.env.DATABASE_URL;
var pool = new import_pg.Pool({ connectionString });
var adapter = new import_adapter_pg.PrismaPg(pool);
var prisma = new import_client.PrismaClient({ adapter });

// src/modules/queue/infra/repositories/QueueRepository.ts
var QueueRepository = class {
  async create(data) {
    const queueItem = await prisma.queueItem.create({
      data: {
        barbershopId: data.barbershopId,
        serviceId: data.serviceId,
        customerId: data.customerId,
        customerName: data.customerName,
        whatsapp: data.whatsapp,
        addedByStaff: data.addedByStaff || false,
        status: "WAITING"
      },
      include: {
        service: true
      }
    });
    return this.mapToDTO(queueItem);
  }
  async list(barbershopId) {
    const queueItems = await prisma.queueItem.findMany({
      where: barbershopId ? { barbershopId } : {},
      orderBy: { joinedAt: "asc" },
      include: { service: true }
    });
    return queueItems.map(this.mapToDTO);
  }
  async findById(id) {
    const item = await prisma.queueItem.findUnique({
      where: { id },
      include: { service: true }
    });
    return item ? this.mapToDTO(item) : null;
  }
  async updateStatus(id, status, details) {
    const data = { status };
    if (status === "COMPLETED") {
      data.completedAt = /* @__PURE__ */ new Date();
      if (details?.completedBy) data.completedBy = details.completedBy;
      if (details?.finalPrice) data.finalPrice = details.finalPrice;
    }
    const item = await prisma.queueItem.update({
      where: { id },
      data,
      include: { service: true }
    });
    return this.mapToDTO(item);
  }
  async delete(id) {
    await prisma.queueItem.delete({ where: { id } });
  }
  async countCompleted(barbershopId) {
    return await prisma.queueItem.count({
      where: {
        status: "COMPLETED",
        ...barbershopId ? { barbershopId } : {}
      }
    });
  }
  mapToDTO(item) {
    return {
      id: item.id,
      barbershopId: item.barbershopId,
      serviceId: item.serviceId,
      customerId: item.customerId,
      customerName: item.customerName,
      whatsapp: item.whatsapp,
      joinedAt: item.joinedAt,
      status: item.status,
      estimatedStartAt: item.estimatedStartAt,
      addedByStaff: item.addedByStaff,
      completedAt: item.completedAt,
      completedBy: item.completedBy,
      finalPrice: item.finalPrice,
      serviceName: item.service?.name
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  QueueRepository
});
