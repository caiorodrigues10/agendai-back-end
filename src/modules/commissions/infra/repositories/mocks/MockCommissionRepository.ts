import { ICommissionRepository } from "@/modules/commissions/repositories/ICommissionRepository";
import { civilDayBounds } from "@/shared/utils/dateUtils";
import {
  ICommissionEntryDTO,
  ICommissionFilters,
  IListCommissionsQuery,
  ICommissionSummary,
  ICommissionSplitDTO,
} from "@/modules/commissions/dtos/ICommissionDTO";

/**
 * Mock em memória do repositório de comissões.
 *
 * A listagem espelha o `where` do repositório real (`commissionListWhere.ts`):
 * uma cláusula por filtro, `barbershopId` sempre do contexto, período em
 * `createdAt` com limites do dia civil do salão e ordenação `data`/`valor` com
 * `id` de desempate.
 */
export class MockCommissionRepository implements ICommissionRepository {
  public entries: ICommissionEntryDTO[] = [];
  /** Preço de origem (finalPrice) por lançamento — alimenta o `grossTotal`. */
  private grossBySource = new Map<string, number>();
  private seq = 1;

  async hasEntriesForQueueItem(queueItemId: string): Promise<boolean> {
    return this.entries.some((entry) => entry.queueItemId === queueItemId);
  }

  async createForQueueItem(data: {
    barbershopId: string;
    queueItemId: string;
    serviceId: string;
    finalPrice: number;
    splits: ICommissionSplitDTO[];
  }): Promise<void> {
    this.grossBySource.set(`queue:${data.queueItemId}`, data.finalPrice);
    for (const split of data.splits) {
      this.entries.push({
        id: `commission-${this.seq++}`,
        barbershopId: data.barbershopId,
        queueItemId: data.queueItemId,
        appointmentId: null,
        origin: "QUEUE",
        serviceId: data.serviceId,
        serviceName: "Serviço",
        professionalId: split.professionalId,
        professionalName: split.professionalId,
        percentage: split.percentage,
        amount: Math.round((data.finalPrice * split.percentage) / 100),
        createdAt: new Date(),
      });
    }
  }

  /** Insere um lançamento direto nos testes (fila ou agenda). */
  public push(
    entry: Partial<ICommissionEntryDTO> & {
      barbershopId: string;
      /** Preço de origem (finalPrice) — por padrão, o próprio `amount`. */
      sourceTotal?: number;
    },
  ): ICommissionEntryDTO {
    const created: ICommissionEntryDTO = {
      id: entry.id ?? `commission-${this.seq++}`,
      barbershopId: entry.barbershopId,
      queueItemId: entry.queueItemId ?? null,
      appointmentId: entry.appointmentId ?? null,
      origin: entry.origin ?? (entry.appointmentId ? "APPOINTMENT" : "QUEUE"),
      serviceId: entry.serviceId ?? "service-1",
      serviceName: entry.serviceName ?? "Serviço",
      professionalId: entry.professionalId ?? "professional-1",
      professionalName: entry.professionalName ?? "Profissional",
      percentage: entry.percentage ?? 40,
      amount: entry.amount ?? 20,
      createdAt: entry.createdAt ?? new Date(),
    };
    const key = created.appointmentId
      ? `appt:${created.appointmentId}`
      : created.queueItemId
        ? `queue:${created.queueItemId}`
        : `entry:${created.id}`;
    this.grossBySource.set(key, entry.sourceTotal ?? created.amount);
    this.entries.push(created);
    return created;
  }

  private filtered(barbershopId: string, query: ICommissionFilters): ICommissionEntryDTO[] {
    let results = this.entries.filter((e) => e.barbershopId === barbershopId);

    if (query.professionalId) {
      results = results.filter((e) => e.professionalId === query.professionalId);
    }

    if (query.serviceId) {
      results = results.filter((e) => e.serviceId === query.serviceId);
    }

    if (query.origin === "QUEUE") {
      results = results.filter((e) => e.queueItemId !== null);
    }
    if (query.origin === "APPOINTMENT") {
      results = results.filter((e) => e.appointmentId !== null);
    }

    if (query.from || query.to) {
      const gte = query.from ? civilDayBounds(query.from, query.timeZone).gte : null;
      const lt = query.to ? civilDayBounds(query.to, query.timeZone).lt : null;
      results = results.filter(
        (e) => (!gte || e.createdAt >= gte) && (!lt || e.createdAt < lt),
      );
    }

    return results;
  }

  async list(
    barbershopId: string,
    query: IListCommissionsQuery,
  ): Promise<{ data: ICommissionEntryDTO[]; total: number }> {
    const results = this.sortResults(
      this.filtered(barbershopId, query),
      query.sort?.field,
      query.sort?.dir ?? "desc",
    );

    // `total` é o tamanho do conjunto filtrado inteiro, não da página.
    const total = results.length;
    const start = (query.page - 1) * query.limit;
    const data = results.slice(start, start + query.limit);

    return { data, total };
  }

  /** Espelha o `orderBy` do repositório real (incluindo o desempate por `id`). */
  private sortResults(
    results: ICommissionEntryDTO[],
    field: string | undefined,
    dir: "asc" | "desc",
  ): ICommissionEntryDTO[] {
    return [...results].sort((a, b) => {
      let cmp = 0;

      if (field === "valor") {
        cmp = a.amount - b.amount;
      } else {
        cmp = a.createdAt.getTime() - b.createdAt.getTime();
      }

      if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
      return dir === "asc" ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id);
    });
  }

  async summary(
    barbershopId: string,
    query: Omit<IListCommissionsQuery, "page" | "limit">,
  ): Promise<ICommissionSummary> {
    // Sem paginação: as somas cobrem todo o conjunto filtrado.
    const scoped = this.filtered(barbershopId, query);

    const commissionTotal = scoped.reduce((total, entry) => total + entry.amount, 0);

    const grossBySource = new Map<string, number>();
    for (const entry of scoped) {
      const key = entry.appointmentId
        ? `appt:${entry.appointmentId}`
        : entry.queueItemId
          ? `queue:${entry.queueItemId}`
          : `entry:${entry.id}`;
      grossBySource.set(key, this.grossBySource.get(key) ?? entry.amount);
    }

    const byProfessional = new Map<string, ICommissionSummary["byProfessional"][number]>();
    for (const entry of scoped) {
      const current = byProfessional.get(entry.professionalId) ?? {
        professionalId: entry.professionalId,
        professionalName: entry.professionalName,
        commissionTotal: 0,
        entryCount: 0,
      };
      current.commissionTotal += entry.amount;
      current.entryCount += 1;
      byProfessional.set(entry.professionalId, current);
    }

    return {
      grossTotal: [...grossBySource.values()].reduce((total, amount) => total + amount, 0),
      commissionTotal,
      byProfessional: [...byProfessional.values()].map((entry) => ({
        ...entry,
        commissionTotal: Math.round(entry.commissionTotal * 100) / 100,
      })),
    };
  }
}
