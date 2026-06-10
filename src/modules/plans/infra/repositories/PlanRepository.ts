import { prisma } from "@/libs/prismaClient";
import { IPlanRepository } from "../../repositories/IPlanRepository";
import { ICreatePlanDTO, IUpdatePlanDTO, IPlanResponseDTO } from "../../dtos/IPlanDTO";

const select = {
  id: true,
  name: true,
  description: true,
  price: true,
  maxEmployees: true,
  features: true,
  active: true,
  createdAt: true
} as const;

export class PlanRepository implements IPlanRepository {
  async create(data: ICreatePlanDTO): Promise<IPlanResponseDTO> {
    return prisma.plan.create({ data, select });
  }

  async findById(id: string): Promise<IPlanResponseDTO | null> {
    return prisma.plan.findUnique({ where: { id }, select });
  }

  async list(onlyActive = true): Promise<IPlanResponseDTO[]> {
    return prisma.plan.findMany({
      where: onlyActive ? { active: true } : {},
      orderBy: { price: "asc" },
      select
    });
  }

  async update(id: string, data: IUpdatePlanDTO): Promise<IPlanResponseDTO> {
    return prisma.plan.update({ where: { id }, data, select });
  }

  async deactivate(id: string): Promise<void> {
    await prisma.plan.update({ where: { id }, data: { active: false } });
  }
}
