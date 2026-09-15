import { AppError } from "@/shared/errors/AppError";
import { GoalRepository } from "./goalRepository";

export class GoalUseCases {
  private repo = new GoalRepository();

  async create(barbershopId: string, data: {
    professionalId: string;
    metric: string;
    target: number;
    period: string;
    startDate: Date;
    endDate: Date;
  }) {
    if (!barbershopId) throw new AppError("barbershopId is required", 400);
    return this.repo.create({ ...data, barbershopId });
  }

  async update(id: string, barbershopId: string, data: { target?: number; endDate?: Date }) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new AppError("Goal not found", 404);
    if (existing.barbershopId !== barbershopId) throw new AppError("Access denied", 403);
    return this.repo.update(id, data);
  }

  async getProgress(id: string, barbershopId: string) {
    const progress = await this.repo.getProgress(id, barbershopId);
    if (!progress) throw new AppError("Goal not found", 404);
    return progress;
  }

  async list(barbershopId: string, filters: { professionalId?: string; period?: string }) {
    return this.repo.list(barbershopId, filters);
  }

  async getRanking(barbershopId: string, metric: string | undefined, startDate: Date, endDate: Date) {
    return this.repo.getRanking(barbershopId, metric, startDate, endDate);
  }
}
