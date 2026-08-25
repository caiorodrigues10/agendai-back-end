import { inject, injectable } from "tsyringe";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";

export interface IExportUserDataDTO {
  userId: string;
  format?: "json" | "csv";
}

@injectable()
export class ExportUserDataUseCase {
  async execute(data: IExportUserDataDTO) {
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        cpf: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
        barbershopId: true,
        termsVersion: true,
        termsAcceptedAt: true,
        marketingOptIn: true,
        marketingOptInAt: true,
        lgpdConsentAt: true,
      },
    });

    if (!user) {
      throw new AppError("Usuário não encontrado", 404);
    }

    const barbershop = user.barbershopId
      ? await prisma.barbershop.findUnique({
          where: { id: user.barbershopId },
          select: { id: true, name: true, whatsapp: true, cnpj: true },
        })
      : null;

    const appointments = await prisma.appointment.findMany({
      where: {
        OR: [
          { staffId: user.id },
        ],
      },
      select: {
        id: true,
        date: true,
        time: true,
        status: true,
        service: { select: { name: true, price: true } },
        staff: { select: { name: true } },
        client: { select: { name: true, whatsapp: true } },
        createdAt: true,
      },
      orderBy: { date: "desc" },
    });

    const payments = user.barbershopId
      ? await prisma.payment.findMany({
          where: { barbershopId: user.barbershopId },
          select: {
            id: true,
            status: true,
            paymentMethod: true,
            transactionAmount: true,
            currency: true,
            description: true,
            createdAt: true,
            serviceId: true,
          },
          orderBy: { createdAt: "desc" },
        })
      : [];

    const subscriptions = user.barbershopId
      ? await prisma.subscription.findMany({
          where: { barbershopId: user.barbershopId },
          select: {
            id: true,
            status: true,
            startDate: true,
            endDate: true,
            cancelDate: true,
            cancelReason: true,
            referralCreditDays: true,
            plan: { select: { name: true, price: true, billingCycle: true } },
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        })
      : [];

    const referrals = await prisma.referral.findMany({
      where: {
        OR: [
          { referrerUserId: user.id },
          { refereeUserId: user.id },
        ],
      },
      select: {
        id: true,
        status: true,
        rewardDays: true,
        qualifiedAt: true,
        rewardedAt: true,
        referrerUser: { select: { name: true, email: true } },
        refereeUser: { select: { name: true, email: true } },
        referrerBarbershop: { select: { name: true } },
        refereeBarbershop: { select: { name: true } },
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const feedback = await prisma.feedback.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const exportData = {
      profile: {
        ...user,
        barbershop,
      },
      appointments,
      payments,
      subscriptions,
      referrals,
      feedback,
      exportedAt: new Date().toISOString(),
    };

    if (data.format === "csv") {
      return this.convertToCSV(exportData);
    }

    return exportData;
  }

  private convertToCSV(data: any): string {
    const sections = [
      { name: "profile", data: [data.profile] },
      { name: "appointments", data: data.appointments },
      { name: "payments", data: data.payments },
      { name: "subscriptions", data: data.subscriptions },
      { name: "referrals", data: data.referrals },
      { name: "feedback", data: data.feedback },
    ];

    let csv = "";

    for (const section of sections) {
      if (section.data.length === 0) continue;

      csv += `=== ${section.name.toUpperCase()} ===\n`;

      const headers = Object.keys(section.data[0]);
      csv += headers.join(",") + "\n";

      for (const row of section.data) {
        const values = headers.map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return "";
          if (typeof val === "object") return JSON.stringify(val);
          return String(val).replace(/"/g, '""');
        });
        csv += values.map((v) => `"${v}"`).join(",") + "\n";
      }
      csv += "\n";
    }

    return csv;
  }
}