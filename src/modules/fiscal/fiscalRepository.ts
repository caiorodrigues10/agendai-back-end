import { prisma } from "@/libs/prismaClient";

export class FiscalRepository {
  async getConfig(barbershopId: string) {
    return prisma.fiscalConfig.findUnique({
      where: { barbershopId },
    });
  }

  async upsertConfig(barbershopId: string, data: Record<string, unknown>) {
    return prisma.fiscalConfig.upsert({
      where: { barbershopId },
      create: { barbershopId, ...data },
      update: data,
    });
  }

  async createNfeRecord(data: {
    barbershopId: string;
    configId: string;
    appointmentId?: string | null;
    nfseNumber: string;
    nfseProtocol: string;
    recipientName: string;
    recipientDoc: string;
    serviceValue: number;
    taxValue: number;
  }) {
    return prisma.nfeRecord.create({
      data: {
        ...data,
        status: "AUTHORIZED",
        issuedAt: new Date(),
      },
    });
  }

  async findNfeRecord(barbershopId: string, id: string) {
    return prisma.nfeRecord.findFirst({
      where: { id, barbershopId },
      include: { config: true },
    });
  }

  async listNfeRecords(
    barbershopId: string,
    options: { status?: string; skip: number; take: number }
  ) {
    const where: Record<string, unknown> = { barbershopId };
    if (options.status) {
      where.status = options.status;
    }

    const [records, total] = await Promise.all([
      prisma.nfeRecord.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: options.skip,
        take: options.take,
      }),
      prisma.nfeRecord.count({ where }),
    ]);

    return { records, total };
  }

  async cancelNfeRecord(barbershopId: string, id: string) {
    return prisma.nfeRecord.update({
      where: { id },
      data: { status: "CANCELED", canceledAt: new Date() },
    });
  }

  async getNextSequence(barbershopId: string) {
    const last = await prisma.nfeRecord.findFirst({
      where: { barbershopId },
      orderBy: { nfseNumber: "desc" },
      select: { nfseNumber: true },
    });

    if (!last?.nfseNumber) return 1;
    const num = parseInt(last.nfseNumber, 10);
    return isNaN(num) ? 1 : num + 1;
  }

  async getStats(barbershopId: string, since: Date) {
    const records = await prisma.nfeRecord.findMany({
      where: {
        barbershopId,
        status: "AUTHORIZED",
        issuedAt: { gte: since },
      },
      orderBy: { issuedAt: "asc" },
    });

    let totalIssued = 0;
    let totalTax = 0;
    const monthly: Record<string, { count: number; tax: number; total: number }> = {};

    for (const r of records) {
      const val = Number(r.serviceValue);
      const tax = Number(r.taxValue);
      totalIssued += val;
      totalTax += tax;

      const key = r.issuedAt
        ? `${r.issuedAt.getUTCFullYear()}-${String(r.issuedAt.getUTCMonth() + 1).padStart(2, "0")}`
        : "unknown";

      if (!monthly[key]) monthly[key] = { count: 0, tax: 0, total: 0 };
      monthly[key].count += 1;
      monthly[key].tax += tax;
      monthly[key].total += val;
    }

    return { totalIssued, totalTax, monthly };
  }
}
