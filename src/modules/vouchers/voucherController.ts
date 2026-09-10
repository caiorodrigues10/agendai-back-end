import { FastifyRequest, FastifyReply } from "fastify";
import {
  createVoucherSchema,
  updateVoucherSchema,
  validateVoucherSchema,
  applyVoucherSchema,
} from "./voucherSchema";
import { VoucherUseCases } from "./voucherUseCases";
import { AppError } from "@/shared/errors/AppError";

export class VoucherController {
  private useCases = new VoucherUseCases();

  async listVouchers(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const vouchers = await this.useCases.listVouchers(resolvedBarbershopId);
    reply.send({ success: true, data: vouchers });
  }

  async create(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const body = createVoucherSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const voucher = await this.useCases.create(resolvedBarbershopId, body);
    reply.status(201).send({ success: true, data: voucher });
  }

  async update(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };
    const body = updateVoucherSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const voucher = await this.useCases.update(id, resolvedBarbershopId, body);
    reply.send({ success: true, data: voucher });
  }

  async delete(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    await this.useCases.delete(id, resolvedBarbershopId);
    reply.send({ success: true, message: "Voucher removido" });
  }

  async validateCode(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const body = validateVoucherSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const result = await this.useCases.validateCode(resolvedBarbershopId, body);
    reply.send({ success: true, data: result });
  }

  async applyVoucher(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const body = applyVoucherSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const result = await this.useCases.applyVoucher(resolvedBarbershopId, body);
    reply.send({ success: true, data: result });
  }

  async getUsages(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const usages = await this.useCases.getUsages(resolvedBarbershopId, id);
    reply.send({ success: true, data: usages });
  }
}
