import { IPlanRepository } from "@/modules/plans/repositories/IPlanRepository";
import { ICreatePlanDTO, IUpdatePlanDTO, IPlanResponseDTO } from "@/modules/plans/dtos/IPlanDTO";

export class MockPlanRepository implements IPlanRepository {
  private data: IPlanResponseDTO[] = [];
  private seq = 1;

  async create(payload: ICreatePlanDTO): Promise<IPlanResponseDTO> {
    const entity: IPlanResponseDTO = {
      id:           `plan-${this.seq++}`,
      name:         payload.name,
      description:  payload.description ?? null,
      price:        payload.price,
      billingCycle: payload.billingCycle ?? "MONTHLY",
      maxEmployees: payload.maxEmployees,
      hasDashboard: payload.hasDashboard ?? true,
      tierKey:      payload.tierKey ?? "pro",
      features:     payload.features,
      active:       true,
      createdAt:    new Date()
    };
    this.data.push(entity);
    return entity;
  }

  async findById(id: string): Promise<IPlanResponseDTO | null> {
    return this.data.find((p) => p.id === id) ?? null;
  }

  async list(onlyActive = true): Promise<IPlanResponseDTO[]> {
    return onlyActive ? this.data.filter((p) => p.active) : [...this.data];
  }

  async update(id: string, payload: IUpdatePlanDTO): Promise<IPlanResponseDTO> {
    const idx = this.data.findIndex((p) => p.id === id);
    if (idx < 0) throw new Error("Plano não encontrado");
    this.data[idx] = { ...this.data[idx], ...payload };
    return this.data[idx];
  }

  async deactivate(id: string): Promise<void> {
    const entity = await this.findById(id);
    if (entity) entity.active = false;
  }
}
