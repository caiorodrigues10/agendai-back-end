import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    correlationId: string;
    idempotencyKey?: string;
    /** true quando a request usa um JWT de impersonation (somente leitura, 30min). */
    impersonated?: boolean;
    user?: {
      id: string;
      role: string;
      barbershopId?: string;
      cpf?: string;
      permissions?: string[];
    };
  }
}
