import { FastifyRequest, FastifyReply } from "fastify";
import { ZodSchema, ZodError } from "zod";

export function validateSchema(schema: ZodSchema, source: "body" | "query" | "params" = "body") {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = schema.parse((request as any)[source]);
      (request as any)[source] = data;
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send({
          success: false,
          error: "Dados inválidos",
          details: error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        });
      }
      throw error;
    }
  };
}
