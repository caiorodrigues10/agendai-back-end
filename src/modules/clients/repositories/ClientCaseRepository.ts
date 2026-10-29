import { prisma } from "@/libs/prismaClient";
import {
  ICreateClientCaseDTO,
  IUpdateClientCaseDTO,
  IClientCaseResponseDTO,
} from "../dto/IClientCaseDTO";

export interface IClientCaseRepository {
  create(data: ICreateClientCaseDTO): Promise<IClientCaseResponseDTO>;
  findById(id: string, barbershopId: string): Promise<IClientCaseResponseDTO | null>;
  listByClient(barbershopId: string, clientId: string): Promise<IClientCaseResponseDTO[]>;
  update(
    id: string,
    barbershopId: string,
    data: IUpdateClientCaseDTO
  ): Promise<IClientCaseResponseDTO>;
  delete(id: string, barbershopId: string): Promise<void>;
}

/** Converte os Decimal do Prisma em number (o front trabalha com number). */
function toAmount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

export class ClientCaseRepository implements IClientCaseRepository {
  async create(data: ICreateClientCaseDTO): Promise<IClientCaseResponseDTO> {
    const created = await prisma.clientCase.create({
      data: {
        barbershopId: data.barbershopId,
        clientId: data.clientId,
        nickname: data.nickname,
        practiceArea: data.practiceArea ?? null,
        caseNumber: data.caseNumber ?? null,
        notes: data.notes ?? null,
        status: data.status ?? "LEAD",
        priority: data.priority ?? "NORMAL",
        title: data.title ?? null,
        courtName: data.courtName ?? null,
        opponent: data.opponent ?? null,
        claimedAmount: data.claimedAmount ?? null,
        awardedAmount: data.awardedAmount ?? null,
        responsibleStaffId: data.responsibleStaffId ?? null,
        shareWithClient: data.shareWithClient ?? false,
        openedAt: new Date(),
      },
    });
    return { ...created, claimedAmount: toAmount(created.claimedAmount), awardedAmount: toAmount(created.awardedAmount) };
  }

  async findById(id: string, barbershopId: string): Promise<IClientCaseResponseDTO | null> {
    const found = await prisma.clientCase.findFirst({ where: { id, barbershopId } });
    if (!found) return null;
    return {
      ...found,
      claimedAmount: toAmount(found.claimedAmount),
      awardedAmount: toAmount(found.awardedAmount),
    };
  }

  async listByClient(
    barbershopId: string,
    clientId: string
  ): Promise<IClientCaseResponseDTO[]> {
    const cases = await prisma.clientCase.findMany({
      where: { barbershopId, clientId },
      orderBy: { createdAt: "desc" },
    });
    return cases.map((item) => ({
      ...item,
      claimedAmount: toAmount(item.claimedAmount),
      awardedAmount: toAmount(item.awardedAmount),
    }));
  }

  async update(
    id: string,
    barbershopId: string,
    data: IUpdateClientCaseDTO
  ): Promise<IClientCaseResponseDTO> {
    // Fechar o caso carimba a data de encerramento; reabrir limpa.
    const closedAt =
      data.status === "CLOSED" || data.status === "ARCHIVED"
        ? new Date()
        : data.status !== undefined
          ? null
          : undefined;

    const updated = await prisma.clientCase.update({
      where: { id, barbershopId },
      data: {
        ...(data.nickname !== undefined && { nickname: data.nickname }),
        ...(data.practiceArea !== undefined && { practiceArea: data.practiceArea }),
        ...(data.caseNumber !== undefined && { caseNumber: data.caseNumber }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.active !== undefined && { active: data.active }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.title !== undefined && { title: data.title }),
        ...(data.courtName !== undefined && { courtName: data.courtName }),
        ...(data.opponent !== undefined && { opponent: data.opponent }),
        ...(data.claimedAmount !== undefined && { claimedAmount: data.claimedAmount }),
        ...(data.awardedAmount !== undefined && { awardedAmount: data.awardedAmount }),
        ...(data.responsibleStaffId !== undefined && {
          responsibleStaffId: data.responsibleStaffId,
        }),
        ...(data.shareWithClient !== undefined && {
          shareWithClient: data.shareWithClient,
        }),
        ...(closedAt !== undefined && { closedAt }),
      },
    });
    return {
      ...updated,
      claimedAmount: toAmount(updated.claimedAmount),
      awardedAmount: toAmount(updated.awardedAmount),
    };
  }

  async delete(id: string, barbershopId: string): Promise<void> {
    await prisma.clientCase.delete({ where: { id, barbershopId } });
  }
}
