import { BRAND_NAME } from './brand';
import { FastifyInstance } from "fastify";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";

const DEFAULT_SERVER_URL = "http://localhost:3333";

/**
 * A UI do Swagger lista todas as rotas e schemas da API: fora de produção
 * ela só sobe quando ENABLE_API_DOCS=true é declarado explicitamente.
 */
export function isApiDocsEnabled(): boolean {
  const flag = process.env.ENABLE_API_DOCS?.trim().toLowerCase();
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV !== "production";
}

/** URL do servidor exibido na UI (servers[0].url) — configurável por env. */
export function apiDocsServerUrl(): string {
  return process.env.API_DOCS_SERVER_URL?.trim() || DEFAULT_SERVER_URL;
}

export async function setupSwagger(app: FastifyInstance) {
  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: `${BRAND_NAME} API`,
        description: "API para gestão de filas e agendamentos de salões",
        version: "1.0.0"
      },
      servers: [
        {
          url: apiDocsServerUrl(),
          description: process.env.NODE_ENV === "production"
            ? "Produção"
            : "Servidor de Desenvolvimento"
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
        { name: "Auth", description: "Autenticação e autorização" },
        { name: "Users", description: "Gerenciamento de usuários" },
        { name: "Barbershops", description: "Gerenciamento de salões" },
        { name: "Services", description: "Serviços oferecidos" },
        { name: "Queue", description: "Fila de atendimento" },
        { name: "Appointments", description: "Agendamentos" },
        { name: "Feed", description: "Feed social" }
      ]
    }
  });

  if (!isApiDocsEnabled()) {
    app.log.info("Swagger UI desabilitado (ENABLE_API_DOCS/NODE_ENV) — /docs responde 404");
    return;
  }

  await app.register(fastifySwaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true
    }
  });
}
