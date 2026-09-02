import { injectable } from 'tsyringe';
import { prisma } from '@/libs/prismaClient';
import { AppError } from '@/shared/errors/AppError';

interface ExportRequest {
  barbershopId: string;
  from: Date;
  to: Date;
  requestingUserRole: string;
}

function maskName(name: string): string {
  if (!name || name.length <= 2) return '*';
  return `${name[0]}${'*'.repeat(name.length - 2)}${name[name.length - 1]}`;
}

function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

@injectable()
export class ExportFinancialDataUseCase {
  async execute(request: ExportRequest): Promise<string> {
    const { barbershopId, from, to, requestingUserRole } = request;

    if (requestingUserRole !== 'MASTER_ADMIN' && requestingUserRole !== 'OWNER') {
      throw new AppError('Acesso negado', 403);
    }

    const [serviceEvents, fiados, commissions, expenses, packages] = await Promise.all([
      prisma.crmFinancialEvent.findMany({
        where: { barbershopId, createdAt: { gte: from, lte: to } },
        include: { client: true },
      }),
      prisma.fiado.findMany({
        where: { barbershopId, createdAt: { gte: from, lte: to } },
        include: { client: true },
      }),
      prisma.commissionEntry.findMany({
        where: { barbershopId, createdAt: { gte: from, lte: to } },
        include: { professional: true },
      }),
      prisma.expense.findMany({
        where: { barbershopId, createdAt: { gte: from, lte: to } },
        include: { category: true },
      }),
      prisma.clientPackage.findMany({
        where: { barbershopId, createdAt: { gte: from, lte: to } },
        include: { client: true, package: true },
      }),
    ]);

    const rows: Array<Record<string, string | number>> = [];

    for (const event of serviceEvents) {
      rows.push({
        Data: event.createdAt.toISOString().slice(0, 10),
        Tipo: 'SERVIÇO',
        Origem: 'Atendimento',
        Cliente: maskName(event.client?.name ?? 'N/A'),
        Categoria: event.kind ?? '',
        Descricao: event.description ?? `Evento: ${event.kind}`,
        Produzido: event.grossAmount ?? 0,
        Recebido: event.receivedAmount ?? 0,
        'Em Aberto': (event.grossAmount ?? 0) - (event.receivedAmount ?? 0),
        Comissao: 0,
        Despesa: 0,
        Referencia: event.id,
      });
    }

    for (const fiado of fiados) {
      rows.push({
        Data: fiado.createdAt.toISOString().slice(0, 10),
        Tipo: 'FIADO',
        Origem: 'Fiado',
        Cliente: maskName(fiado.client?.name ?? 'N/A'),
        Categoria: 'Fiado',
        Descricao: fiado.description ?? 'Fiado',
        Produzido: fiado.originalAmount ?? 0,
        Recebido: fiado.paidAmount ?? 0,
        'Em Aberto': (fiado.originalAmount ?? 0) - (fiado.paidAmount ?? 0),
        Comissao: 0,
        Despesa: 0,
        Referencia: fiado.id,
      });
    }

    for (const comm of commissions) {
      rows.push({
        Data: comm.createdAt.toISOString().slice(0, 10),
        Tipo: 'COMISSÃO',
        Origem: 'Comissão',
        Cliente: '',
        Categoria: '',
        Descricao: `Comissão: ${comm.professional?.name ?? 'N/A'}`,
        Produzido: 0,
        Recebido: 0,
        'Em Aberto': 0,
        Comissao: comm.amount ?? 0,
        Despesa: 0,
        Referencia: comm.id,
      });
    }

    for (const exp of expenses) {
      rows.push({
        Data: exp.createdAt.toISOString().slice(0, 10),
        Tipo: 'DESPESA',
        Origem: 'Despesa',
        Cliente: '',
        Categoria: exp.category?.name ?? '',
        Descricao: exp.description ?? 'Despesa',
        Produzido: 0,
        Recebido: 0,
        'Em Aberto': 0,
        Comissao: 0,
        Despesa: exp.amount ?? 0,
        Referencia: exp.id,
      });
    }

    for (const pkg of packages) {
      rows.push({
        Data: pkg.createdAt.toISOString().slice(0, 10),
        Tipo: 'PACOTE',
        Origem: 'Pacote',
        Cliente: maskName(pkg.client?.name ?? 'N/A'),
        Categoria: pkg.package?.name ?? '',
        Descricao: `Pacote: ${pkg.package?.name ?? 'N/A'}`,
        Produzido: pkg.pricePaid ?? 0,
        Recebido: pkg.pricePaid ?? 0,
        'Em Aberto': 0,
        Comissao: 0,
        Despesa: 0,
        Referencia: pkg.id,
      });
    }

    const headers = ['Data', 'Tipo', 'Origem', 'Cliente', 'Categoria', 'Descricao', 'Produzido', 'Recebido', 'Em Aberto', 'Comissao', 'Despesa', 'Referencia'];
    const sorted = rows.sort((a, b) => String(a.Data).localeCompare(String(b.Data)));
    const csvRows = sorted.map(r => headers.map(h => csvCell(r[h])).join(','));

    return [headers.join(','), ...csvRows].join('\n');
  }
}
