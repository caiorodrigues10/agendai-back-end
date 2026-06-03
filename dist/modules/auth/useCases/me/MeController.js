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

// src/modules/auth/useCases/me/MeController.ts
var MeController_exports = {};
__export(MeController_exports, {
  MeController: () => MeController,
  mePreHandler: () => mePreHandler
});
module.exports = __toCommonJS(MeController_exports);

// src/shared/infra/http/middlewares/authenticate.ts
var import_jsonwebtoken = require("jsonwebtoken");

// src/shared/errors/AppError.ts
var AppError = class extends Error {
  statusCode;
  errors;
  constructor(message, statusCode = 400, errors) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
  }
};

// src/config/auth.ts
var auth_default = {
  secret: process.env.JWT_SECRET || "dev-secret",
  refreshSecret: process.env.JWT_REFRESH_SECRET || "dev-refresh-secret",
  expiresIn: process.env.JWT_EXPIRES_IN || "15m",
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d"
};

// src/shared/infra/http/middlewares/authenticate.ts
async function authenticate(request, reply) {
  const authHeader = request.headers.authorization;
  if (!authHeader) {
    throw new AppError("Token ausente", 401);
  }
  const [, token] = authHeader.split(" ");
  if (!token) {
    throw new AppError("Token mal formatado", 401);
  }
  try {
    const decoded = (0, import_jsonwebtoken.verify)(token, auth_default.secret);
    request.user = {
      id: decoded.sub,
      role: decoded.role,
      barbershopId: decoded.barbershopId
    };
  } catch {
    throw new AppError("Token inv\xE1lido", 401);
  }
}

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

// src/modules/auth/useCases/me/MeController.ts
async function mePreHandler(request, reply) {
  await authenticate(request, reply);
}
var MeController = class {
  async handle(request, reply) {
    const userRepo = new UserRepository();
    const user = await userRepo.findById(request.user.id);
    if (!user) return reply.status(404).send({ message: "Usu\xE1rio n\xE3o encontrado" });
    return reply.status(200).send({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: mapRole(user.role),
        barbershopId: user.barbershopId ?? void 0
      }
    });
  }
};
function mapRole(role) {
  if (role === "ADMIN") return "admin";
  if (role === "OWNER") return "owner";
  return "employee";
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MeController,
  mePreHandler
});
