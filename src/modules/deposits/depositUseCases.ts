import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { DepositRepository, UpdatePolicyData, ConfirmDepositData } from "./depositRepository";

export class DepositUseCases {
  private repo = new DepositRepository();

  async getDepositPolicy(barbershopId: string) {
    if (!barbershopId) throw new AppError("barbershopId is required", 400);
    const policy = await this.repo.getPolicy(barbershopId);
    if (!policy) throw new AppError("Appointment policy not found", 404);
    return policy;
  }

  async updateDepositPolicy(barbershopId: string, data: UpdatePolicyData) {
    if (!barbershopId) throw new AppError("barbershopId is required", 400);
    return this.repo.updatePolicy(barbershopId, data);
  }

  async getAppointmentDeposit(appointmentId: string) {
    if (!appointmentId) throw new AppError("appointmentId is required", 400);
    const deposit = await this.repo.getDeposit(appointmentId);
    if (!deposit) throw new AppError("Deposit not found for this appointment", 404);
    return deposit;
  }

  async confirmAppointmentDeposit(appointmentId: string, userId: string, data: ConfirmDepositData) {
    if (!appointmentId) throw new AppError("appointmentId is required", 400);
    if (!userId) throw new AppError("userId is required", 400);

    const deposit = await this.repo.getDeposit(appointmentId);
    if (!deposit) throw new AppError("Deposit not found for this appointment", 404);
    if (deposit.status !== "PENDING") {
      throw new AppError(`Cannot confirm deposit in status ${deposit.status}`, 400);
    }
    if (deposit.expiresAt && deposit.expiresAt < new Date()) {
      throw new AppError("Deposit has expired", 400);
    }

    const confirmed = await prisma.$transaction(async (tx: any) => {
      await tx.$queryRaw`SELECT id FROM appointment_deposits WHERE id = ${deposit.id}::uuid FOR UPDATE`;
      const locked = await tx.appointmentDeposit.findUnique({ where: { id: deposit.id } });
      if (!locked || locked.status !== "PENDING") {
        throw new AppError(`Cannot confirm deposit in status ${locked?.status ?? "missing"}`, 400);
      }
      const updated = await tx.appointmentDeposit.update({
        where: { id: deposit.id },
        data: {
          status: "CONFIRMED",
          confirmedAt: new Date(),
          confirmedById: userId,
          confirmationNote: data.notes ?? undefined,
          paymentMethod: data.pixKey ? "PIX" : undefined,
        },
      });
      await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: "CONFIRMED" },
      });
      return updated;
    });

    return confirmed;
  }

  async waiveAppointmentDeposit(appointmentId: string, userId: string) {
    if (!appointmentId) throw new AppError("appointmentId is required", 400);
    if (!userId) throw new AppError("userId is required", 400);

    const deposit = await this.repo.getDeposit(appointmentId);
    if (!deposit) throw new AppError("Deposit not found for this appointment", 404);
    if (deposit.status !== "PENDING") {
      throw new AppError(`Cannot waive deposit in status ${deposit.status}`, 400);
    }

    return this.repo.waiveDeposit(deposit.id, userId);
  }

  async rejectAppointmentDeposit(appointmentId: string, userId: string) {
    if (!appointmentId) throw new AppError("appointmentId is required", 400);
    if (!userId) throw new AppError("userId is required", 400);

    const deposit = await this.repo.getDeposit(appointmentId);
    if (!deposit) throw new AppError("Deposit not found for this appointment", 404);
    if (deposit.status !== "PENDING") {
      throw new AppError(`Cannot reject deposit in status ${deposit.status}`, 400);
    }

    const rejected = await this.repo.rejectDeposit(deposit.id, userId);

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: "CANCELLED", canceledAt: new Date(), cancellationSource: "SYSTEM" },
    });

    return rejected;
  }

  async refundAppointmentDeposit(appointmentId: string, userId: string) {
    if (!appointmentId) throw new AppError("appointmentId is required", 400);
    if (!userId) throw new AppError("userId is required", 400);

    const deposit = await this.repo.getDeposit(appointmentId);
    if (!deposit) throw new AppError("Deposit not found for this appointment", 404);
    if (deposit.status !== "CONFIRMED") {
      throw new AppError(`Cannot refund deposit in status ${deposit.status}`, 400);
    }

    return this.repo.refundDeposit(deposit.id, userId);
  }

  async runDepositExpiration() {
    const expiredDeposits = await this.repo.getExpiredPendingDeposits();

    if (expiredDeposits.length === 0) {
      return { expired: 0, cancelled: 0 };
    }

    const depositIds = expiredDeposits.map((d: { id: string }) => d.id);
    await prisma.appointmentDeposit.updateMany({
      where: { id: { in: depositIds } },
      data: { status: "EXPIRED" },
    });

    let cancelled = 0;
    for (const deposit of expiredDeposits) {
      if (deposit.appointment && deposit.appointment.status !== "CANCELLED") {
        await prisma.appointment.update({
          where: { id: deposit.appointmentId },
          data: { status: "CANCELLED", canceledAt: new Date(), cancellationSource: "SYSTEM" },
        });
        cancelled++;
      }
    }

    return { expired: expiredDeposits.length, cancelled };
  }

  async listDeposits(barbershopId: string, filters: any) {
    if (!barbershopId) throw new AppError("barbershopId is required", 400);
    return this.repo.listDeposits(barbershopId, filters);
  }
}
