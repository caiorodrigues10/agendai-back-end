import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { ProductCatalogUseCase } from "../useCases/productUseCases";
import {
  adjustmentSchema,
  createProductSchema,
  createReceiptSchema,
  createRetailSaleSchema,
  installTemplateSchema,
  listProductsQuerySchema,
  productCategorySchema,
  refundRetailSaleSchema,
  reportsQuerySchema,
  reverseReceiptSchema,
  supplierSchema,
  updateProductSchema,
} from "../schemas/productSchemas";

function shopId(request: FastifyRequest, fallback?: string) {
  const user = request.user!;
  const id = user.role === "MASTER_ADMIN" ? fallback || user.barbershopId : user.barbershopId;
  if (!id) throw new AppError("barbershopId é obrigatório", 400);
  return id;
}

export class ProductsController {
  private useCase() {
    return container.resolve(ProductCatalogUseCase);
  }

  async listProducts(request: FastifyRequest, reply: FastifyReply) {
    const query = listProductsQuerySchema.parse(request.query);
    const barbershopId = shopId(request, (request.query as { barbershopId?: string }).barbershopId);
    const result = await this.useCase().listProducts(barbershopId, request.user!, query);
    reply.send({ success: true, data: result.data, meta: { total: result.total, page: query.page, limit: query.limit } });
  }

  async createProduct(request: FastifyRequest, reply: FastifyReply) {
    const body = createProductSchema.parse(request.body);
    const barbershopId = shopId(request);
    const data = await this.useCase().createProduct(barbershopId, request.user!, { ...body, barbershopId } as never);
    reply.status(201).send({ success: true, data });
  }

  async updateProduct(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = updateProductSchema.parse(request.body);
    const data = await this.useCase().updateProduct(id, shopId(request), request.user!, body);
    reply.send({ success: true, data });
  }

  async listCategories(request: FastifyRequest, reply: FastifyReply) {
    const data = await this.useCase().listCategories(shopId(request, (request.query as { barbershopId?: string }).barbershopId), request.user!);
    reply.send({ success: true, data });
  }

  async createCategory(request: FastifyRequest, reply: FastifyReply) {
    const body = productCategorySchema.parse(request.body);
    const data = await this.useCase().createCategory(shopId(request), request.user!, body);
    reply.status(201).send({ success: true, data });
  }

  async updateCategory(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = productCategorySchema.partial().parse(request.body);
    const data = await this.useCase().updateCategory(id, shopId(request), request.user!, body);
    reply.send({ success: true, data });
  }

  async listSuppliers(request: FastifyRequest, reply: FastifyReply) {
    const data = await this.useCase().listSuppliers(shopId(request, (request.query as { barbershopId?: string }).barbershopId), request.user!);
    reply.send({ success: true, data });
  }

  async createSupplier(request: FastifyRequest, reply: FastifyReply) {
    const body = supplierSchema.parse(request.body);
    const data = await this.useCase().createSupplier(shopId(request), request.user!, body as never);
    reply.status(201).send({ success: true, data });
  }

  async updateSupplier(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = supplierSchema.partial().parse(request.body);
    const data = await this.useCase().updateSupplier(id, shopId(request), request.user!, body);
    reply.send({ success: true, data });
  }

  async listMovements(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as { page?: string; limit?: string };
    const result = await this.useCase().listMovements(shopId(request), request.user!, Number(query.page || 1), Number(query.limit || 50));
    reply.send({ success: true, data: result.data, meta: { total: result.total } });
  }

  async createReceipt(request: FastifyRequest, reply: FastifyReply) {
    const body = createReceiptSchema.parse(request.body);
    const data = await this.useCase().createReceipt(shopId(request), request.user!, { ...body, barbershopId: shopId(request), createdById: request.user!.id });
    reply.status(201).send({ success: true, data });
  }

  async reverseReceipt(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = reverseReceiptSchema.parse(request.body);
    const data = await this.useCase().reverseReceipt(shopId(request), request.user!, id, body.reason);
    reply.send({ success: true, data });
  }

  async adjustStock(request: FastifyRequest, reply: FastifyReply) {
    const body = adjustmentSchema.parse(request.body);
    const data = await this.useCase().adjustStock(shopId(request), request.user!, body);
    reply.send({ success: true, data });
  }

  async listSales(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as { page?: string; limit?: string };
    const result = await this.useCase().listSales(shopId(request), request.user!, Number(query.page || 1), Number(query.limit || 30));
    reply.send({ success: true, data: result.data, meta: { total: result.total } });
  }

  async createSale(request: FastifyRequest, reply: FastifyReply) {
    const body = createRetailSaleSchema.parse(request.body);
    const data = await this.useCase().createSale(shopId(request), request.user!, body);
    reply.status(201).send({ success: true, data });
  }

  async getSale(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const data = await this.useCase().getSale(shopId(request), request.user!, id);
    reply.send({ success: true, data });
  }

  async refundSale(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = refundRetailSaleSchema.parse(request.body);
    const data = await this.useCase().refundSale(shopId(request), request.user!, id, body);
    reply.send({ success: true, data });
  }

  async reports(request: FastifyRequest, reply: FastifyReply) {
    const query = reportsQuerySchema.parse(request.query);
    const data = await this.useCase().reports(shopId(request), request.user!, query.from, query.to);
    reply.send({ success: true, data });
  }

  async previewTemplate(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const query = request.query as { segment?: string };
    const data = await this.useCase().previewTemplate(id, request.user!, query.segment as never);
    reply.send({ success: true, data });
  }

  async installTemplate(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = installTemplateSchema.parse(request.body ?? {});
    const data = await this.useCase().installTemplate(id, request.user!, body);
    reply.send({ success: true, data });
  }
}
