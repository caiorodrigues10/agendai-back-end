import { FastifyRequest, FastifyReply } from "fastify";
import { creditWalletSchema, debitWalletSchema, transferWalletSchema, walletEntriesQuerySchema } from "./walletSchema";
import { WalletUseCases } from "./walletUseCases";
import { AppError } from "@/shared/errors/AppError";

export class WalletController {
  private useCases = new WalletUseCases();

  async getBalance(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user as any;
    const identityId = user.identityId;
    if (!identityId) throw new AppError("identityId required", 400);

    const wallet = await this.useCases.getBalance(identityId);
    reply.send({ success: true, data: wallet });
  }

  async credit(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user as any;
    const identityId = user.identityId;
    if (!identityId) throw new AppError("identityId required", 400);

    const body = creditWalletSchema.parse(request.body);
    const result = await this.useCases.credit(identityId, body);
    reply.send({ success: true, data: result });
  }

  async debit(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user as any;
    const identityId = user.identityId;
    if (!identityId) throw new AppError("identityId required", 400);

    const body = debitWalletSchema.parse(request.body);
    const result = await this.useCases.debit(identityId, body);
    reply.send({ success: true, data: result });
  }

  async listEntries(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user as any;
    const identityId = user.identityId;
    if (!identityId) throw new AppError("identityId required", 400);

    const query = walletEntriesQuerySchema.parse(request.query);
    const result = await this.useCases.listEntries(identityId, query);
    reply.send({ success: true, data: result });
  }

  async transfer(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user as any;
    const identityId = user.identityId;
    if (!identityId) throw new AppError("identityId required", 400);

    const body = transferWalletSchema.parse(request.body);
    const result = await this.useCases.transfer(identityId, body);
    reply.send({ success: true, data: result });
  }
}
