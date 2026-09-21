import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { z } from "zod";
import { AppError } from "@/shared/errors/AppError";
import { ProductCatalogUseCase } from "../useCases/productUseCases";
import {
  ALLOWED_LOGO_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
} from "@/shared/config/upload";
import {
  adjustmentSchema,
  createProductSchema,
  createReceiptSchema,
  createRetailSaleSchema,
  installTemplateSchema,
  listProductsQuerySchema,
  paginationQuerySchema,
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

  async deleteCategory(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const data = await this.useCase().deleteCategory(id, shopId(request), request.user!);
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
    const query = paginationQuerySchema.parse(request.query);
    const result = await this.useCase().listMovements(shopId(request), request.user!, query.page, query.limit);
    reply.send({ success: true, data: result.data, meta: { total: result.total, page: query.page, limit: query.limit } });
  }

  async listReceipts(request: FastifyRequest, reply: FastifyReply) {
    const query = paginationQuerySchema.parse(request.query);
    const result = await this.useCase().listReceipts(shopId(request), request.user!, query.page, query.limit);
    reply.send({ success: true, data: result.data, meta: { total: result.total, page: query.page, limit: query.limit } });
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
    const query = paginationQuerySchema.parse(request.query);
    const result = await this.useCase().listSales(shopId(request), request.user!, query.page, query.limit);
    reply.send({ success: true, data: result.data, meta: { total: result.total, page: query.page, limit: query.limit } });
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

  async stockAlerts(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as { days?: string };
    const days = query.days ? Number(query.days) : undefined;
    const result = await this.useCase().stockAlerts(shopId(request), request.user!, days);
    reply.send({ success: true, data: result });
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

  async getProductImageUploadUrl(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const schema = z.object({ mimeType: z.enum(["image/jpeg", "image/jpg", "image/png", "image/webp"]) });
    const { mimeType } = schema.parse(request.query);
    const barbershopId = shopId(request);
    const ext = mimeType === "image/jpg" ? "jpg" : mimeType.split("/")[1];
    const objectName = `products/${barbershopId}/${id || "new"}_${Date.now()}.${ext}`;
    const storage = container.resolve("StorageProvider") as { generateSignedUploadUrl: Function };
    const result = await storage.generateSignedUploadUrl("products", objectName, mimeType, 600);
    reply.send({ success: true, data: { uploadUrl: result.uploadUrl, publicUrl: result.publicUrl, objectName: result.objectName } });
  }

  async uploadProductImage(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const allowedMimes = new Set(Object.keys(ALLOWED_LOGO_MIME_TYPES));

    const data = await (request as any).file({
      limits: { fileSize: MAX_UPLOAD_SIZE_BYTES, files: 1, fields: 0 },
    });
    if (!data) throw new AppError("Nenhum arquivo enviado. Use o campo 'file' no form-data.", 400);

    const mimeType: string = data.mimetype ?? "";
    if (!allowedMimes.has(mimeType)) {
      await data.toBuffer().catch(() => {});
      throw new AppError(`Tipo de arquivo não permitido: "${mimeType}". Aceitos: JPEG, PNG, WebP`, 400);
    }

    let buffer: Buffer;
    try {
      buffer = await data.toBuffer();
    } catch (err: any) {
      if (err?.code === "FST_REQ_FILE_TOO_LARGE" || err?.statusCode === 413) {
        throw new AppError("Arquivo muito grande. Máximo permitido: 5 MB", 413);
      }
      throw new AppError(`Erro ao processar arquivo: ${err?.message ?? "desconhecido"}`, 500);
    }

    const barbershopId = shopId(request, (request.query as { barbershopId?: string }).barbershopId);
    const result = await this.useCase().uploadImage(id, barbershopId, request.user!, {
      buffer, mimeType, originalName: data.filename,
    });

    reply.send({ success: true, data: { imageUrl: result.imageUrl } });
  }

  async confirmProductImage(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const schema = z.object({ imageUrl: z.string().url() });
    const { imageUrl } = schema.parse(request.body);
    const barbershopId = shopId(request);
    await this.useCase().updateProduct(id, barbershopId, request.user!, { imageUrl });
    reply.send({ success: true, data: { imageUrl } });
  }
}
