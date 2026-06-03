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
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);

// src/shared/infra/http/routes/auth.routes.ts
var auth_routes_exports = {};
__export(auth_routes_exports, {
  authRoutes: () => authRoutes
});
module.exports = __toCommonJS(auth_routes_exports);

// src/modules/auth/useCases/login/LoginController.ts
var import_tsyringe2 = require("tsyringe");

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

// src/modules/auth/useCases/login/LoginUseCase.ts
var import_tsyringe = require("tsyringe");
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

// src/modules/auth/useCases/login/LoginUseCase.ts
function mapRole(role) {
  if (role === "ADMIN") return "admin";
  if (role === "OWNER") return "owner";
  return "employee";
}
var LoginUseCase = class {
  constructor(userRepository, hashProvider) {
    this.userRepository = userRepository;
    this.hashProvider = hashProvider;
  }
  async execute(email, password) {
    const user = await this.userRepository.findByEmail(email);
    if (!user || !user.active) {
      throw new Error("Credenciais inv\xE1lidas");
    }
    const passwordOk = await this.hashProvider.compare(password, user.password);
    if (!passwordOk) {
      throw new Error("Credenciais inv\xE1lidas");
    }
    const accessOpts = { subject: user.id, expiresIn: auth_default.expiresIn };
    const accessToken = (0, import_jsonwebtoken.sign)({ role: user.role, barbershopId: user.barbershopId ?? void 0 }, auth_default.secret, accessOpts);
    const expiresAt = new Date(Date.now() + parseDuration(auth_default.refreshExpiresIn));
    const refreshOpts = { expiresIn: auth_default.refreshExpiresIn };
    const refreshToken = (0, import_jsonwebtoken.sign)({ sub: user.id }, auth_default.refreshSecret, refreshOpts);
    await prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt }
    });
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: mapRole(user.role),
        barbershopId: user.barbershopId ?? void 0
      },
      accessToken,
      refreshToken
    };
  }
};
LoginUseCase = __decorateClass([
  (0, import_tsyringe.injectable)(),
  __decorateParam(0, (0, import_tsyringe.inject)("UserRepository")),
  __decorateParam(1, (0, import_tsyringe.inject)("HashProvider"))
], LoginUseCase);
function parseDuration(input) {
  const match = input.match(/^(\d+)([smhd])$/);
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = match[2];
  const multipliers = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 };
  return value * multipliers[unit];
}

// src/modules/auth/useCases/login/LoginController.ts
var validateLogin = validateSchema(loginSchema);
var LoginController = class {
  async handle(request, reply) {
    const { email, password } = request.body;
    const useCase = import_tsyringe2.container.resolve(LoginUseCase);
    const result = await useCase.execute(email, password);
    return reply.status(200).send(result);
  }
};

// src/modules/auth/useCases/refresh/RefreshController.ts
var import_jsonwebtoken2 = require("jsonwebtoken");

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
      const decoded = (0, import_jsonwebtoken2.verify)(refreshToken, auth_default.refreshSecret);
      const tokenRecord = await prisma.refreshToken.findFirst({ where: { token: refreshToken } });
      if (!tokenRecord || tokenRecord.expiresAt < /* @__PURE__ */ new Date()) {
        return reply.status(401).send({ message: "Refresh token inv\xE1lido" });
      }
      const userRepo = new UserRepository();
      const user = await userRepo.findById(decoded.sub);
      if (!user) return reply.status(401).send({ message: "Usu\xE1rio inv\xE1lido" });
      const accessOpts = { subject: user.id, expiresIn: auth_default.expiresIn };
      const accessToken = (0, import_jsonwebtoken2.sign)({ role: user.role, barbershopId: user.barbershopId ?? void 0 }, auth_default.secret, accessOpts);
      const refreshOpts = { expiresIn: auth_default.refreshExpiresIn };
      const newRefreshToken = (0, import_jsonwebtoken2.sign)({ sub: user.id }, auth_default.refreshSecret, refreshOpts);
      await prisma.refreshToken.updateMany({
        where: { token: refreshToken },
        data: { token: newRefreshToken, expiresAt: new Date(Date.now() + parseDuration2(auth_default.refreshExpiresIn)) }
      });
      return reply.status(200).send({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: mapRole2(user.role),
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
function parseDuration2(input) {
  const match = input.match(/^(\d+)([smhd])$/);
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = match[2];
  const multipliers = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 };
  return value * multipliers[unit];
}
function mapRole2(role) {
  if (role === "ADMIN") return "admin";
  if (role === "OWNER") return "owner";
  return "employee";
}

// src/shared/infra/http/middlewares/authenticate.ts
var import_jsonwebtoken3 = require("jsonwebtoken");
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
    const decoded = (0, import_jsonwebtoken3.verify)(token, auth_default.secret);
    request.user = {
      id: decoded.sub,
      role: decoded.role,
      barbershopId: decoded.barbershopId
    };
  } catch {
    throw new AppError("Token inv\xE1lido", 401);
  }
}

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
        role: mapRole3(user.role),
        barbershopId: user.barbershopId ?? void 0
      }
    });
  }
};
function mapRole3(role) {
  if (role === "ADMIN") return "admin";
  if (role === "OWNER") return "owner";
  return "employee";
}

// src/shared/infra/http/routes/auth.routes.ts
async function authRoutes(app) {
  const login = new LoginController();
  const refresh = new RefreshController();
  const me = new MeController();
  app.post("/auth/login", { preHandler: [validateLogin] }, login.handle.bind(login));
  app.post("/auth/refresh", { preHandler: [validateRefresh] }, refresh.handle.bind(refresh));
  app.get("/auth/me", { preHandler: [mePreHandler] }, me.handle.bind(me));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  authRoutes
});
