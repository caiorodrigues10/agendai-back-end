import { FastifyReply, FastifyRequest } from "fastify";
import { container } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import {
  createProductReservationSchema,
  productListReservationsQuerySchema,
  productReservationIdParamsSchema,
  publicBarbershopParamsSchema,
  publicProductParamsSchema,
  updateProductReservationStatusSchema,
} from "./productReservationSchemas";
import { ProductReservationUseCases } from "./productReservationUseCases";

/** Mesmo fallback de `ProductsController.shopId` para MASTER_ADMIN sem loja própria. */
function staffShopId(request: FastifyRequest) {
  const user = request.user;
  if (!user) throw new AppError("Não autenticado", 401);
  const query = request.query as { barbershopId?: string };
  const id = user.role === "MASTER_ADMIN" ? query.barbershopId || user.barbershopId : user.barbershopId;
  if (!id) throw new AppError("barbershopId é obrigatório", 400);
  return id;
}

export class ProductReservationController {
  private useCase() {
    return container.resolve(ProductReservationUseCases);
  }

  // ---------------------------------------------------------------- público

  async listPublicProducts(request: FastifyRequest, reply: FastifyReply) {
    const { id } = publicBarbershopParamsSchema.parse(request.params);
    const data = await this.useCase().listPublicProducts(id);
    reply.send({ success: true, data });
  }

  async getPublicProduct(request: FastifyRequest, reply: FastifyReply) {
    const params = publicProductParamsSchema.parse(request.params);
    const data = await this.useCase().getPublicProduct(params.id, params.productId);
    reply.send({ success: true, data });
  }

  async reserve(request: FastifyRequest, reply: FastifyReply) {
    const params = publicProductParamsSchema.parse(request.params);
    const body = createProductReservationSchema.parse(request.body);
    const data = await this.useCase().reserve(params.id, params.productId, body);
    reply.status(201).send({ success: true, data });
  }

  // ------------------------------------------------------------------ painel

  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = productListReservationsQuerySchema.parse(request.query);
    const barbershopId = staffShopId(request);
    const result = await this.useCase().listReservations(barbershopId, query);
    reply.send({
      success: true,
      data: result.data,
      meta: { total: result.total, page: result.page, limit: result.limit },
    });
  }

  async updateStatus(request: FastifyRequest, reply: FastifyReply) {
    const { id } = productReservationIdParamsSchema.parse(request.params);
    const body = updateProductReservationStatusSchema.parse(request.body);
    const data = await this.useCase().updateStatus(id, staffShopId(request), body);
    reply.send({ success: true, data });
  }
}
