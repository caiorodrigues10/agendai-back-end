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

// src/modules/auth/useCases/refresh/RefreshController.ts
var RefreshController_exports = {};
__export(RefreshController_exports, {
  RefreshController: () => RefreshController,
  validateRefresh: () => validateRefresh
});
module.exports = __toCommonJS(RefreshController_exports);

// src/shared/utils/zodValidation.ts
var import_zod = require("zod");

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

// src/shared/utils/zodValidation.ts
function validateSchema(schema) {
  return async (request, reply) => {
    try {
      request.body = schema.parse(request.body);
    } catch (error) {
      if (error instanceof import_zod.ZodError) {
        const errors = error.errors.map((err) => ({
          field: err.path.join("."),
          message: err.message
        }));
        throw new AppError("Dados inv\xE1lidos", 400, errors);
      }
      throw error;
    }
  };
}

// src/modules/auth/schemas/authSchemas.ts
var import_zod2 = require("zod");
var loginSchema = import_zod2.z.object({
  email: import_zod2.z.string().email(),
  password: import_zod2.z.string().min(6)
});
var refreshSchema = import_zod2.z.object({
  refreshToken: import_zod2.z.string().min(10)
});

// src/modules/auth/useCases/refresh/RefreshController.ts
var import_jsonwebtoken = require("jsonwebtoken");

// src/config/auth.ts
var auth_default = {
  secret: process.env.JWT_SECRET || "dev-secret",
  refreshSecret: process.env.JWT_REFRESH_SECRET || "dev-refresh-secret",
  expiresIn: process.env.JWT_EXPIRES_IN || "15m",
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d"
};

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

// src/modules/auth/useCases/refresh/RefreshController.ts
var validateRefresh = validateSchema(refreshSchema);
var RefreshController = class {
  async handle(request, reply) {
    const { refreshToken } = request.body;
    try {
      const decoded = (0, import_jsonwebtoken.verify)(refreshToken, auth_default.refreshSecret);
      const tokenRecord = await prisma.refreshToken.findFirst({ where: { token: refreshToken } });
      if (!tokenRecord || tokenRecord.expiresAt < /* @__PURE__ */ new Date()) {
        return reply.status(401).send({ message: "Refresh token inv\xE1lido" });
      }
      const userRepo = new UserRepository();
      const user = await userRepo.findById(decoded.sub);
      if (!user) return reply.status(401).send({ message: "Usu\xE1rio inv\xE1lido" });
      const accessOpts = { subject: user.id, expiresIn: auth_default.expiresIn };
      const accessToken = (0, import_jsonwebtoken.sign)({ role: user.role, barbershopId: user.barbershopId ?? void 0 }, auth_default.secret, accessOpts);
      const refreshOpts = { expiresIn: auth_default.refreshExpiresIn };
      const newRefreshToken = (0, import_jsonwebtoken.sign)({ sub: user.id }, auth_default.refreshSecret, refreshOpts);
      await prisma.refreshToken.updateMany({
        where: { token: refreshToken },
        data: { token: newRefreshToken, expiresAt: new Date(Date.now() + parseDuration(auth_default.refreshExpiresIn)) }
      });
      return reply.status(200).send({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: mapRole(user.role),
          barbershopId: user.barbershopId ?? void 0
        },
        accessToken,
        refreshToken: newRefreshToken
      });
    } catch {
      return reply.status(401).send({ message: "Refresh token inv\xE1lido" });
    }
  }
};
function parseDuration(input) {
  const match = input.match(/^(\d+)([smhd])$/);
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = match[2];
  const multipliers = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 };
  return value * multipliers[unit];
}
function mapRole(role) {
  if (role === "ADMIN") return "admin";
  if (role === "OWNER") return "owner";
  return "employee";
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  RefreshController,
  validateRefresh
});
