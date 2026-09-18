import { FastifyRequest, FastifyReply } from "fastify";
import { ZodSchema, ZodError } from "zod";
import { AppError } from "../errors/AppError";

export function formatZodIssues(error: ZodError): { field: string; message: string }[] {
  return error.issues.map((err) => ({
    field: err.path.join("."),
    message: err.message,
  }));
}

export function isZodError(error: unknown): error is ZodError {
  if (typeof ZodError === "function" && error instanceof ZodError) return true;
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: string }).name === "ZodError" &&
    Array.isArray((error as { issues?: unknown }).issues)
  );
}

export function appErrorFromZod(error: ZodError, message = "Dados inválidos"): AppError {
  return new AppError(message, 400, formatZodIssues(error));
}

export function validateSchema(schema: ZodSchema) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    try {
      request.body = schema.parse(request.body);
    } catch (error) {
      if (error instanceof ZodError) {
        throw appErrorFromZod(error);
      }
      throw error;
    }
  };
}
