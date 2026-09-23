import { AppError } from "@/shared/errors/AppError";
import {
  RecurringPackageRepository,
  CreatePlanData,
  UpdatePlanData,
  CreatePackageData,
  RecordPaymentData,
} from "./recurringPackageRepository";

export class RecurringPackageUseCases {
  private repo = new RecurringPackageRepository();

  async createPlan(barbershopId: string, data: CreatePlanData) {
    if (!barbershopId) throw new AppError("barbershopId is required", 400);
    return this.repo.createPlan({ ...data, barbershopId });
  }

  async updatePlan(barbershopId: string, planId: string, data: UpdatePlanData) {
    if (!barbershopId) throw new AppError("barbershopId is required", 400);
    if (!planId) throw new AppError("planId is required", 400);

    const plan = await this.repo.getPlan(planId);
    if (!plan) throw new AppError("Plano de pacote recorrente não encontrado", 404);
    if (plan.barbershopId !== barbershopId) throw new AppError("Access denied", 403);

    return this.repo.updatePlan(planId, data);
  }

  async listPlans(barbershopId: string) {
    if (!barbershopId) throw new AppError("barbershopId is required", 400);
    return this.repo.listPlans(barbershopId);
  }

  async createPackage(barbershopId: string, data: CreatePackageData) {
    if (!barbershopId) throw new AppError("barbershopId is required", 400);
    if (!data.planId) throw new AppError("planId is required", 400);
    if (!data.clientId) throw new AppError("clientId is required", 400);

    const plan = await this.repo.getPlan(data.planId);
    if (!plan) throw new AppError("Plano de pacote recorrente não encontrado", 404);
    if (plan.barbershopId !== barbershopId) throw new AppError("Access denied", 403);

    return this.repo.createPackage({ ...data, barbershopId });
  }

  async activatePackage(barbershopId: string, packageId: string) {
    if (!barbershopId) throw new AppError("barbershopId is required", 400);
    if (!packageId) throw new AppError("packageId is required", 400);

    const pkg = await this.repo.getPackage(packageId);
    if (!pkg) throw new AppError("Pacote recorrente não encontrado", 404);
    if (pkg.barbershopId !== barbershopId) throw new AppError("Access denied", 403);
    if (pkg.status !== "PENDING") {
      throw new AppError(`Não é possível ativar pacote recorrente com status ${pkg.status}`, 400);
    }

    return this.repo.activatePackage(packageId);
  }

  async pausePackage(barbershopId: string, packageId: string) {
    if (!barbershopId) throw new AppError("barbershopId is required", 400);
    if (!packageId) throw new AppError("packageId is required", 400);

    const pkg = await this.repo.getPackage(packageId);
    if (!pkg) throw new AppError("Pacote recorrente não encontrado", 404);
    if (pkg.barbershopId !== barbershopId) throw new AppError("Access denied", 403);
    if (pkg.status !== "ACTIVE") {
      throw new AppError(`Não é possível pausar pacote recorrente com status ${pkg.status}`, 400);
    }

    return this.repo.pausePackage(packageId);
  }

  async resumePackage(barbershopId: string, packageId: string) {
    if (!barbershopId) throw new AppError("barbershopId is required", 400);
    if (!packageId) throw new AppError("packageId is required", 400);

    const pkg = await this.repo.getPackage(packageId);
    if (!pkg) throw new AppError("Pacote recorrente não encontrado", 404);
    if (pkg.barbershopId !== barbershopId) throw new AppError("Access denied", 403);
    if (pkg.status !== "PAUSED") {
      throw new AppError(`Não é possível retomar pacote recorrente com status ${pkg.status}`, 400);
    }

    return this.repo.resumePackage(packageId);
  }

  async cancelPackage(barbershopId: string, packageId: string) {
    if (!barbershopId) throw new AppError("barbershopId is required", 400);
    if (!packageId) throw new AppError("packageId is required", 400);

    const pkg = await this.repo.getPackage(packageId);
    if (!pkg) throw new AppError("Pacote recorrente não encontrado", 404);
    if (pkg.barbershopId !== barbershopId) throw new AppError("Access denied", 403);
    if (pkg.status === "CANCELED") {
      throw new AppError("Pacote recorrente já está cancelado", 400);
    }

    return this.repo.cancelPackage(packageId);
  }

  async recordPayment(barbershopId: string, packageId: string, cycleId: string, data: RecordPaymentData) {
    if (!barbershopId) throw new AppError("barbershopId is required", 400);
    if (!packageId) throw new AppError("packageId is required", 400);
    if (!cycleId) throw new AppError("cycleId is required", 400);

    const pkg = await this.repo.getPackage(packageId);
    if (!pkg) throw new AppError("Pacote recorrente não encontrado", 404);
    if (pkg.barbershopId !== barbershopId) throw new AppError("Access denied", 403);

    const cycles = await this.repo.listCycles(packageId);
    const cycle = cycles.find((c: { id: string }) => c.id === cycleId);
    if (!cycle) throw new AppError("Ciclo não encontrado", 404);
    if (cycle.status === "PAID") {
      throw new AppError("Ciclo já está pago", 400);
    }

    const paidCycle = await this.repo.payCycle(cycleId, data);

    if (pkg.status === "PENDING") {
      await this.repo.activatePackage(packageId);
    }

    return paidCycle;
  }

  async useBenefit(barbershopId: string, packageId: string, benefitId: string, appointmentId: string) {
    if (!barbershopId) throw new AppError("barbershopId is required", 400);
    if (!packageId) throw new AppError("packageId is required", 400);
    if (!benefitId) throw new AppError("benefitId is required", 400);
    if (!appointmentId) throw new AppError("appointmentId is required", 400);

    const pkg = await this.repo.getPackage(packageId);
    if (!pkg) throw new AppError("Pacote recorrente não encontrado", 404);
    if (pkg.barbershopId !== barbershopId) throw new AppError("Access denied", 403);
    if (pkg.status !== "ACTIVE") {
      throw new AppError(`Não é possível usar benefício com pacote recorrente em status ${pkg.status}`, 400);
    }

    const hasPaidCycle = pkg.cycles?.some((c: { status: string }) => c.status === "PAID");
    if (!hasPaidCycle) {
      throw new AppError("Nenhum ciclo pago encontrado. Registre o pagamento antes de usar benefícios.", 400);
    }

    const usage = await this.repo.getBenefitUsage(packageId, benefitId);
    if (usage.remaining !== null && usage.remaining <= 0) {
      throw new AppError("Limite de uso do benefício atingido neste ciclo", 400);
    }

    return this.repo.useBenefit(packageId, benefitId, appointmentId);
  }

  async reverseBenefit(barbershopId: string, usageId: string) {
    if (!barbershopId) throw new AppError("barbershopId is required", 400);
    if (!usageId) throw new AppError("usageId is required", 400);

    return this.repo.reverseBenefit(usageId);
  }

  async getPackageDetails(barbershopId: string, packageId: string) {
    if (!barbershopId) throw new AppError("barbershopId is required", 400);
    if (!packageId) throw new AppError("packageId is required", 400);

    const pkg = await this.repo.getPackage(packageId);
    if (!pkg) throw new AppError("Pacote recorrente não encontrado", 404);
    if (pkg.barbershopId !== barbershopId) throw new AppError("Access denied", 403);

    return pkg;
  }

  async listClientPackages(barbershopId: string, clientId: string) {
    if (!barbershopId) throw new AppError("barbershopId is required", 400);
    if (!clientId) throw new AppError("clientId is required", 400);

    return this.repo.listPackages(barbershopId, { clientId });
  }
}
