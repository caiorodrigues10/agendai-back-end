import { WalletRepository } from "./walletRepository";
import { AppError } from "@/shared/errors/AppError";
import type { z } from "zod";
import type { creditWalletSchema, debitWalletSchema, transferWalletSchema, walletEntriesQuerySchema } from "./walletSchema";

type CreditInput = z.infer<typeof creditWalletSchema>;
type DebitInput = z.infer<typeof debitWalletSchema>;
type TransferInput = z.infer<typeof transferWalletSchema>;
type EntriesQuery = z.infer<typeof walletEntriesQuerySchema>;

export class WalletUseCases {
  private repo = new WalletRepository();

  async getOrCreateWallet(identityId: string) {
    return this.repo.getOrCreateWallet(identityId);
  }

  async getBalance(identityId: string) {
    const wallet = await this.repo.getWalletByIdentityId(identityId);
    if (!wallet) {
      const created = await this.repo.getOrCreateWallet(identityId);
      return created;
    }
    return wallet;
  }

  async credit(identityId: string, data: CreditInput) {
    const wallet = await this.repo.getOrCreateWallet(identityId);
    return this.repo.credit(wallet.id, data);
  }

  async debit(identityId: string, data: DebitInput) {
    const wallet = await this.repo.getWalletByIdentityId(identityId);
    if (!wallet) throw new AppError("Carteira não encontrada", 404);
    return this.repo.debit(wallet.id, data);
  }

  async transfer(identityId: string, data: TransferInput) {
    const wallet = await this.repo.getWalletByIdentityId(identityId);
    if (!wallet) throw new AppError("Carteira não encontrada", 404);
    return this.repo.transfer(wallet.id, data);
  }

  async listEntries(identityId: string, query: EntriesQuery) {
    const wallet = await this.repo.getWalletByIdentityId(identityId);
    if (!wallet) throw new AppError("Carteira não encontrada", 404);
    return this.repo.listEntries(wallet.id, query.page, query.limit);
  }
}
