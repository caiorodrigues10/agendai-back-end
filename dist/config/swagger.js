"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/config/swagger.ts
var swagger_exports = {};
__export(swagger_exports, {
  setupSwagger: () => setupSwagger
});
module.exports = __toCommonJS(swagger_exports);
var import_swagger = __toESM(require("@fastify/swagger"));
var import_swagger_ui = __toESM(require("@fastify/swagger-ui"));
async function setupSwagger(app) {
  await app.register(import_swagger.default, {
    openapi: {
      info: {
        title: "BarberQueue API",
        description: "API para gest\xE3o de filas e agendamentos de barbearias",
        version: "1.0.0"
      },
      servers: [
        {
          url: "http://localhost:3333",
          description: "Servidor de Desenvolvimento"
        }
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT"
          }
        }
      },
      tags: [
        { name: "Auth", description: "Autentica\xE7\xE3o e autoriza\xE7\xE3o" },
        { name: "Users", description: "Gerenciamento de usu\xE1rios" },
        { name: "Barbershops", description: "Gerenciamento de barbearias" },
        { name: "Services", description: "Servi\xE7os oferecidos" },
        { name: "Queue", description: "Fila de atendimento" },
        { name: "Appointments", description: "Agendamentos" },
        { name: "Feed", description: "Feed social" }
      ]
    }
  });
  await app.register(import_swagger_ui.default, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true
    }
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  setupSwagger
});
