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
