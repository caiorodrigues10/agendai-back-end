import { FastifyInstance } from "fastify";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";

export async function setupSwagger(app: FastifyInstance) {
  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "BarberQueue API",
        description: "API para gestão de filas e agendamentos de salões",
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

  await app.register(fastifySwaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true
    }
  });
}
