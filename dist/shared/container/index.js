"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/shared/container/index.ts
var import_reflect_metadata = require("reflect-metadata");
var import_tsyringe2 = require("tsyringe");

// src/shared/container/providers/index.ts
var import_tsyringe = require("tsyringe");

// src/shared/container/providers/HashProvider/implementations/BcryptHashProvider.ts
var import_bcryptjs = __toESM(require("bcryptjs"));
var BcryptHashProvider = class {
  async hash(payload) {
    return import_bcryptjs.default.hash(payload, 10);
  }
  async compare(payload, hashed) {
    return import_bcryptjs.default.compare(payload, hashed);
  }
};

// src/shared/container/providers/DateProvider/implementations/DayjsDateProvider.ts
var import_dayjs = __toESM(require("dayjs"));
var DayjsDateProvider = class {
  addDays(date, days) {
    return (0, import_dayjs.default)(date).add(days, "day").toDate();
  }
  addHours(date, hours) {
    return (0, import_dayjs.default)(date).add(hours, "hour").toDate();
  }
  isBefore(startDate, endDate) {
    return (0, import_dayjs.default)(startDate).isBefore(endDate);
  }
  isAfter(startDate, endDate) {
    return (0, import_dayjs.default)(startDate).isAfter(endDate);
  }
  now() {
    return (0, import_dayjs.default)().toDate();
  }
  formatToISOString(date) {
    return (0, import_dayjs.default)(date).toISOString();
  }
};

// src/shared/container/providers/index.ts
import_tsyringe.container.registerSingleton("HashProvider", BcryptHashProvider);
import_tsyringe.container.registerSingleton("DateProvider", DayjsDateProvider);

// src/libs/prismaClient.ts
var import_pg = require("pg");
var import_adapter_pg = require("@prisma/adapter-pg");
var import_client = require("@prisma/client");
var connectionString = process.env.DATABASE_URL;
var pool = new import_pg.Pool({ connectionString });
var adapter = new import_adapter_pg.PrismaPg(pool);
var prisma = new import_client.PrismaClient({ adapter });

// src/modules/users/infra/repositories/UserRepository.ts
var UserRepository = class {
  async create(data) {
    return prisma.user.create({
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        barbershopId: true,
        createdAt: true,
        active: true
      }
    });
  }
  async findById(id) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        barbershopId: true,
        createdAt: true,
        active: true
      }
    });
  }
  async findByEmail(email) {
    return prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        barbershopId: true,
        password: true,
        createdAt: true,
        active: true
      }
    });
  }
};

// src/modules/services/infra/repositories/ServiceRepository.ts
var ServiceRepository = class {
  async create(data) {
    return prisma.service.create({
      data,
      select: {
        id: true,
        barbershopId: true,
        name: true,
        price: true,
        avgTimeMinutes: true,
        icon: true,
        createdAt: true,
        active: true
      }
    });
  }
  async findById(id) {
    return prisma.service.findUnique({
      where: { id },
      select: {
        id: true,
        barbershopId: true,
        name: true,
        price: true,
        avgTimeMinutes: true,
        icon: true,
        createdAt: true,
        active: true
      }
    });
  }
  async list(barbershopId) {
    return prisma.service.findMany({
      where: { barbershopId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        barbershopId: true,
        name: true,
        price: true,
        avgTimeMinutes: true,
        icon: true,
        createdAt: true,
        active: true
      }
    });
  }
  async update(id, data) {
    return prisma.service.update({
      where: { id },
      data,
      select: {
        id: true,
        barbershopId: true,
        name: true,
        price: true,
        avgTimeMinutes: true,
        icon: true,
        createdAt: true,
        active: true
      }
    });
  }
  async deactivate(id) {
    await prisma.service.update({
      where: { id },
      data: { active: false }
    });
  }
};

// src/modules/barbershops/infra/repositories/BarbershopRepository.ts
var BarbershopRepository = class {
  async create(data) {
    return prisma.barbershop.create({
      data,
      select: {
        id: true,
        name: true,
        whatsapp: true,
        logoUrl: true,
        createdAt: true,
        active: true
      }
    });
  }
  async findById(id) {
    return prisma.barbershop.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        whatsapp: true,
        logoUrl: true,
        createdAt: true,
        active: true
      }
    });
  }
  async list() {
    return prisma.barbershop.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        whatsapp: true,
        logoUrl: true,
        createdAt: true,
        active: true
      }
    });
  }
  async update(id, data) {
    return prisma.barbershop.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        whatsapp: true,
        logoUrl: true,
        createdAt: true,
        active: true
      }
    });
  }
  async deactivate(id) {
    await prisma.barbershop.update({
      where: { id },
      data: { active: false }
    });
  }
  async getSchedule(barbershopId) {
    const schedules = await prisma.schedule.findMany({
      where: { barbershopId },
      orderBy: { dayOfWeek: "asc" },
      select: { dayOfWeek: true, isOpen: true, openTime: true, closeTime: true }
    });
    return schedules;
  }
  async updateSchedule(barbershopId, schedule) {
    await prisma.$transaction([
      prisma.schedule.deleteMany({ where: { barbershopId } }),
      prisma.schedule.createMany({
        data: schedule.map((s) => ({ barbershopId, ...s }))
      })
    ]);
  }
};

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

// src/shared/container/index.ts
import_tsyringe2.container.registerSingleton("UserRepository", UserRepository);
import_tsyringe2.container.registerSingleton("ServiceRepository", ServiceRepository);
import_tsyringe2.container.registerSingleton("BarbershopRepository", BarbershopRepository);
import_tsyringe2.container.registerSingleton("QueueRepository", QueueRepository);
