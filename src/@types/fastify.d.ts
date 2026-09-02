import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    correlationId: string;
    idempotencyKey?: string;
    user?: {
      id: string;
      role: string;
      barbershopId?: string;
      cpf?: string;
    };
  }
}
