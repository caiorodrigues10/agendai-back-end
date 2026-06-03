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

// src/modules/users/useCases/createUser/CreateUserUseCase.ts
var CreateUserUseCase_exports = {};
__export(CreateUserUseCase_exports, {
  CreateUserUseCase: () => CreateUserUseCase
});
module.exports = __toCommonJS(CreateUserUseCase_exports);
var import_tsyringe = require("tsyringe");

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

// src/modules/users/useCases/createUser/CreateUserUseCase.ts
var CreateUserUseCase = class {
  constructor(userRepository, hashProvider) {
    this.userRepository = userRepository;
    this.hashProvider = hashProvider;
  }
  async execute(data) {
    const emailExists = await this.userRepository.findByEmail(data.email);
    if (emailExists) {
      throw new AppError("E-mail j\xE1 cadastrado", 400);
    }
    const hashedPassword = await this.hashProvider.hash(data.password);
    const user = await this.userRepository.create({
      ...data,
      password: hashedPassword
    });
    return user;
  }
};
CreateUserUseCase = __decorateClass([
  (0, import_tsyringe.injectable)(),
  __decorateParam(0, (0, import_tsyringe.inject)("UserRepository")),
  __decorateParam(1, (0, import_tsyringe.inject)("HashProvider"))
], CreateUserUseCase);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CreateUserUseCase
});
