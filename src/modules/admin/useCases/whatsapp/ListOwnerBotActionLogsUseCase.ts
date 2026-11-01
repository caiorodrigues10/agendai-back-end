import { IAdminWhatsAppOwnerBotLogRepository } from "../../repositories/AdminWhatsAppOwnerBotLogRepository";

export interface ListOwnerBotActionLogsInput {
  page: number;
  limit: number;
  barbershopId?: string;
  riskClass?: string;
  status?: string;
}

export class ListOwnerBotActionLogsUseCase {
  constructor(private readonly repo: IAdminWhatsAppOwnerBotLogRepository) {}

  async execute(input: ListOwnerBotActionLogsInput) {
    const { logs, total } = await this.repo.list(input);
    const data = logs.map((log) => ({
      ...log,
      barbershopName: log.barbershop?.name,
    }));

    return {
      data,
      meta: {
        total,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(total / input.limit),
      },
    };
  }
}
