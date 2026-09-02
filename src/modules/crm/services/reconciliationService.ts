import { prisma } from '@/libs/prismaClient';

export interface ReconciliationResult {
  status: 'HEALTHY' | 'DIVERGENT';
  lastBackfillAt: Date | null;
  sources: {
    services: { count: number; total: number };
    packages: { count: number; total: number };
    fiados: { count: number; total: number };
    commissions: { count: number; total: number };
  };
  differences: Array<{
    type: string;
    description: string;
    expected: number;
    actual: number;
  }>;
}

export class ReconciliationService {
  async reconcile(barbershopId: string, from: Date, to: Date): Promise<ReconciliationResult> {
    const [serviceEvents, packageEvents, fiadoEvents, commissionEntries] = await Promise.all([
      prisma.crmFinancialEvent.findMany({
        where: { barbershopId, kind: 'SERVICE_COMPLETED', occurredAt: { gte: from, lte: to } },
      }),
      prisma.crmFinancialEvent.findMany({
        where: { barbershopId, kind: 'PACKAGE_SOLD', occurredAt: { gte: from, lte: to } },
      }),
      prisma.fiado.findMany({
        where: { barbershopId, createdAt: { gte: from, lte: to } },
      }),
      prisma.commissionEntry.findMany({
        where: { barbershopId, createdAt: { gte: from, lte: to } },
      }),
    ]);

    const serviceTotal = serviceEvents.reduce((sum: number, e: { grossAmount: number }) => sum + e.grossAmount, 0);
    const packageTotal = packageEvents.reduce((sum: number, e: { grossAmount: number }) => sum + e.grossAmount, 0);
    const fiadoTotal = fiadoEvents.reduce((sum: number, f: { originalAmount: number }) => sum + f.originalAmount, 0);
    const commissionTotal = commissionEntries.reduce((sum: number, c: { amount: number }) => sum + c.amount, 0);

    const differences: ReconciliationResult['differences'] = [];

    if (commissionTotal > 0) {
      const expectedFromServices = serviceTotal * 0.4;
      if (Math.abs(expectedFromServices - commissionTotal) > 0.01) {
        differences.push({
          type: 'SERVICE_VS_COMMISSION',
          description: 'Receita de serviços não bate com comissões',
          expected: expectedFromServices,
          actual: commissionTotal,
        });
      }
    }

    return {
      status: differences.length === 0 ? 'HEALTHY' : 'DIVERGENT',
      lastBackfillAt: null,
      sources: {
        services: { count: serviceEvents.length, total: serviceTotal },
        packages: { count: packageEvents.length, total: packageTotal },
        fiados: { count: fiadoEvents.length, total: fiadoTotal },
        commissions: { count: commissionEntries.length, total: commissionTotal },
      },
      differences,
    };
  }
}
