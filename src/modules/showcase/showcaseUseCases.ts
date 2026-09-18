import { ShowcaseRepository } from "./showcaseRepository";
import { AppError } from "@/shared/errors/AppError";
import type { z } from "zod";
import type { createShowcaseEntrySchema, updateShowcaseEntrySchema, showcaseOrderSchema, showcaseListQuerySchema, showcaseEventQuerySchema } from "./showcaseSchema";

type CreateInput = z.infer<typeof createShowcaseEntrySchema>;
type UpdateInput = z.infer<typeof updateShowcaseEntrySchema>;
type OrderInput = z.infer<typeof showcaseOrderSchema>;
type ListQuery = z.infer<typeof showcaseListQuerySchema>;
type EventQuery = z.infer<typeof showcaseEventQuerySchema>;

export class ShowcaseUseCases {
  private repo = new ShowcaseRepository();

  async listPublished(barbershopId: string) {
    return this.repo.listPublished(barbershopId);
  }

  async getById(id: string) {
    const entry = await this.repo.findById(id);
    if (!entry) throw new AppError("Showcase entry não encontrado", 404);
    return entry;
  }

  async getPublishedById(barbershopId: string, entryId: string) {
    const entry = await this.repo.findPublishedById(barbershopId, entryId);
    if (!entry) throw new AppError("Showcase entry não encontrado", 404);
    return entry;
  }

  async listStaff(barbershopId: string, query: ListQuery) {
    return this.repo.listByBarbershop(barbershopId, query.status);
  }

  async create(barbershopId: string, data: CreateInput) {
    return this.repo.create({ ...data, barbershopId });
  }

  async update(id: string, barbershopId: string, data: UpdateInput) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new AppError("Showcase entry não encontrado", 404);
    if (existing.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    return this.repo.update(id, data);
  }

  async publish(id: string, barbershopId: string) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new AppError("Showcase entry não encontrado", 404);
    if (existing.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    return this.repo.publish(id);
  }

  async hide(id: string, barbershopId: string) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new AppError("Showcase entry não encontrado", 404);
    if (existing.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    return this.repo.hide(id);
  }

  async delete(id: string, barbershopId: string) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new AppError("Showcase entry não encontrado", 404);
    if (existing.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    return this.repo.delete(id);
  }

  async reorder(barbershopId: string, data: OrderInput) {
    return this.repo.reorder(barbershopId, data.entries);
  }

  async recordEvent(entryId: string, barbershopId: string, eventType: string, metadata?: Record<string, unknown>) {
    const entry = await this.repo.findPublishedById(barbershopId, entryId);
    if (!entry) throw new AppError("Showcase entry não encontrado", 404);
    return this.repo.recordEvent(entry.id, entry.barbershopId, eventType, metadata);
  }

  async getAnalytics(barbershopId: string, query: EventQuery) {
    return this.repo.getAnalytics(barbershopId, query.entryId);
  }
}
