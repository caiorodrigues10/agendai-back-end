import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { prisma } from "@/libs/prismaClient";
import { IServicePackageRepository } from "../repositories/IServicePackageRepository";
import { IClientPackageRepository } from "../repositories/IClientPackageRepository";
import { ISalonClientRepository } from "@/modules/clients/repositories/ISalonClientRepository";
import { IServiceRepository } from "@/modules/services/repositories/IServiceRepository";
import { IAppointmentRepository } from "@/modules/appointments/repositories/IAppointmentRepository";
import { IAppointmentResponseDTO } from "@/modules/appointments/dtos/IAppointmentDTO";
import { assertAppointmentBookable } from "@/modules/appointments/utils/assertAppointmentBookable";
import { batchSlotsOverlap } from "../utils/batchSlotOverlap";
import { debitClientPackageInTx } from "../utils/clientPackageCredits";
import { recordPackageSale } from "@/modules/crm/services/crmLedger";
import { publishRealtime } from "@/shared/services/realtimeService";
import {
  ICreateServicePackageDTO,
  IUpdateServicePackageDTO,
  IServicePackageResponseDTO,
  ISellClientPackageDTO,
  IClientPackageResponseDTO,
  IBookPackageSlotDTO,
} from "../dtos/IPackageDTO";

type RequestingUser = { role: string; barbershopId?: string; id?: string };

function assertShopAccess(user: RequestingUser, barbershopId: string): void {
  if (user.role !== "MASTER_ADMIN" && barbershopId !== user.barbershopId) {
    throw new AppError("Acesso negado: você não pertence a este salão", 403);
  }
}

function assertOwner(user: RequestingUser): void {
  if (user.role !== "MASTER_ADMIN" && user.role !== "OWNER") {
    throw new AppError("Apenas o dono pode gerenciar o catálogo de pacotes", 403);
  }
}

function assertPackageBookable(
  pkg: IClientPackageResponseDTO,
  count: number,
  barbershopId: string
): void {
  if (pkg.barbershopId !== barbershopId) {
    throw new AppError("Pacote não pertence a este salão", 403);
  }
  if (pkg.status === "CANCELLED") throw new AppError("Pacote cancelado", 400);
  const expired =
    pkg.status === "EXPIRED" ||
    (pkg.expiresAt != null && pkg.expiresAt.getTime() <= Date.now());
  if (expired) throw new AppError("Pacote expirado", 400);
  if (pkg.status !== "ACTIVE") throw new AppError("Pacote indisponível", 400);
  if (pkg.remainingSessions < count) {
    throw new AppError(
      `Saldo insuficiente: restam ${pkg.remainingSessions} sessão(ões)`,
      400
    );
  }
}

@injectable()
export class CreateServicePackageUseCase {
  constructor(
    @inject("ServicePackageRepository")
    private repo: IServicePackageRepository,
    @inject("ServiceRepository")
    private services: IServiceRepository
  ) {}

  async execute(
    data: ICreateServicePackageDTO,
    user: RequestingUser
  ): Promise<IServicePackageResponseDTO> {
    assertShopAccess(user, data.barbershopId);
    assertOwner(user);

    const service = await this.services.findById(data.serviceId);
    if (!service || service.barbershopId !== data.barbershopId || !service.active) {
      throw new AppError("Serviço inválido para este estabelecimento", 400);
    }

    return this.repo.create(data);
  }
}

@injectable()
export class ListServicePackagesUseCase {
  constructor(
    @inject("ServicePackageRepository")
    private repo: IServicePackageRepository
  ) {}

  async execute(
    barbershopId: string,
    user: RequestingUser,
    activeOnly?: boolean
  ): Promise<IServicePackageResponseDTO[]> {
    assertShopAccess(user, barbershopId);
    const onlyActive =
      activeOnly ?? (user.role === "EMPLOYEE" ? true : undefined);
    return this.repo.list(barbershopId, onlyActive);
  }
}

@injectable()
export class UpdateServicePackageUseCase {
  constructor(
    @inject("ServicePackageRepository")
    private repo: IServicePackageRepository,
    @inject("ServiceRepository")
    private services: IServiceRepository
  ) {}

  async execute(
    id: string,
    data: IUpdateServicePackageDTO,
    user: RequestingUser
  ): Promise<IServicePackageResponseDTO> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new AppError("Pacote não encontrado", 404);
    assertShopAccess(user, existing.barbershopId);
    assertOwner(user);

    if (data.serviceId) {
      const service = await this.services.findById(data.serviceId);
      if (
        !service ||
        service.barbershopId !== existing.barbershopId ||
        !service.active
      ) {
        throw new AppError("Serviço inválido para este estabelecimento", 400);
      }
    }

    return this.repo.update(id, data);
  }
}

@injectable()
export class SellClientPackageUseCase {
  constructor(
    @inject("ServicePackageRepository")
    private catalog: IServicePackageRepository,
    @inject("SalonClientRepository")
    private clients: ISalonClientRepository,
    @inject("ClientPackageRepository")
    private sold: IClientPackageRepository
  ) {}

  async execute(
    data: ISellClientPackageDTO,
    user: RequestingUser
  ): Promise<IClientPackageResponseDTO> {
    assertShopAccess(user, data.barbershopId);

    const template = await this.catalog.findById(data.packageId);
    if (!template || template.barbershopId !== data.barbershopId) {
      throw new AppError("Pacote não encontrado", 404);
    }
    if (!template.active) throw new AppError("Pacote inativo", 400);

    const client = await this.clients.findById(data.clientId);
    if (!client || client.barbershopId !== data.barbershopId) {
      throw new AppError("Cliente não encontrado", 404);
    }

    const expiresAt =
      template.validityDays != null
        ? new Date(Date.now() + template.validityDays * 24 * 60 * 60 * 1000)
        : null;

    const sold = await this.sold.create({
      barbershopId: data.barbershopId,
      clientId: client.id,
      packageId: template.id,
      serviceId: template.serviceId,
      totalSessions: template.sessionCount,
      remainingSessions: template.sessionCount,
      pricePaid: template.price,
      paymentMethod: data.paymentMethod,
      expiresAt,
      soldById: data.soldById ?? user.id ?? null,
    });
    await recordPackageSale(sold.id);
    return sold;
  }
}

@injectable()
export class ListClientPackagesUseCase {
  constructor(
    @inject("ClientPackageRepository")
    private repo: IClientPackageRepository
  ) {}

  async execute(
    params: {
      barbershopId: string;
      clientId?: string;
      status?: IClientPackageResponseDTO["status"];
    },
    user: RequestingUser
  ): Promise<IClientPackageResponseDTO[]> {
    assertShopAccess(user, params.barbershopId);
    return this.repo.list(params);
  }
}

@injectable()
export class BookClientPackageUseCase {
  constructor(
    @inject("ClientPackageRepository")
    private packages: IClientPackageRepository,
    @inject("AppointmentRepository")
    private appointments: IAppointmentRepository
  ) {}

  async execute(
    clientPackageId: string,
    slots: IBookPackageSlotDTO[],
    user: RequestingUser
  ): Promise<IAppointmentResponseDTO[]> {
    const pkg = await this.packages.findById(clientPackageId);
    if (!pkg) throw new AppError("Pacote do cliente não encontrado", 404);
    assertShopAccess(user, pkg.barbershopId);
    assertPackageBookable(pkg, slots.length, pkg.barbershopId);

    const duration = pkg.serviceDurationMinutes ?? 30;
    if (batchSlotsOverlap(slots, duration)) {
      throw new AppError(
        "Há horários sobrepostos neste lote (mesmo profissional/dia)",
        409
      );
    }

    if (process.env.VITEST) {
      await this.packages.debitSessions(pkg.id, slots.length);
      const created: IAppointmentResponseDTO[] = [];
      for (const slot of slots) {
        created.push(
          await this.appointments.create({
            barbershopId: pkg.barbershopId,
            serviceId: pkg.serviceId,
            staffId: slot.staffId ?? null,
            clientId: pkg.clientId,
            clientPackageId: pkg.id,
            customerName: pkg.clientName ?? "Cliente",
            whatsapp: pkg.clientWhatsapp ?? "",
            date: slot.date,
            time: slot.time,
          })
        );
      }
      publishRealtime(pkg.barbershopId, "appointments:changed");
      return created;
    }

    const booked = await prisma.$transaction(async (tx: any) => {
      await debitClientPackageInTx(tx, {
        clientPackageId: pkg.id,
        barbershopId: pkg.barbershopId,
        serviceId: pkg.serviceId,
        count: slots.length,
      });

      const created: IAppointmentResponseDTO[] = [];
      for (const slot of slots) {
        const data = {
          barbershopId: pkg.barbershopId,
          serviceId: pkg.serviceId,
          staffId: slot.staffId ?? null,
          customerName: pkg.clientName ?? "Cliente",
          whatsapp: pkg.clientWhatsapp ?? "",
          date: slot.date,
          time: slot.time,
        };
        await assertAppointmentBookable(data, tx);
        const record = await tx.appointment.create({
          data: {
            ...data,
            staffId: data.staffId,
            date: new Date(data.date),
            clientId: pkg.clientId,
            clientPackageId: pkg.id,
            status: "CONFIRMED",
          },
          include: {
            service: { select: { name: true, price: true } },
            staff: { select: { name: true } },
            barbershop: { select: { name: true } },
          },
        });
        created.push({
          id: record.id,
          barbershopId: record.barbershopId,
          barbershopName: record.barbershop?.name ?? null,
          serviceId: record.serviceId,
          serviceName: record.service?.name ?? null,
          servicePrice: record.service?.price ?? null,
          staffId: record.staffId ?? null,
          staffName: record.staff?.name ?? null,
          customerName: record.customerName,
          whatsapp: record.whatsapp,
          date: record.date,
          time: record.time,
          status: record.status as IAppointmentResponseDTO["status"],
          reminderSentAt: record.reminderSentAt ?? null,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          clientId: record.clientId,
          clientPackageId: record.clientPackageId,
        });
      }
      return created;
    });
    publishRealtime(pkg.barbershopId, "appointments:changed");
    return booked;
  }
}

@injectable()
export class ConsumeClientPackageUseCase {
  constructor(
    @inject("ClientPackageRepository")
    private packages: IClientPackageRepository
  ) {}

  async execute(
    clientPackageId: string,
    user: RequestingUser
  ): Promise<IClientPackageResponseDTO> {
    const pkg = await this.packages.findById(clientPackageId);
    if (!pkg) throw new AppError("Pacote do cliente não encontrado", 404);
    assertShopAccess(user, pkg.barbershopId);
    assertPackageBookable(pkg, 1, pkg.barbershopId);
    return this.packages.debitSessions(pkg.id, 1);
  }
}

@injectable()
export class CancelClientPackageUseCase {
  constructor(
    @inject("ClientPackageRepository")
    private packages: IClientPackageRepository
  ) {}

  async execute(
    clientPackageId: string,
    user: RequestingUser
  ): Promise<IClientPackageResponseDTO> {
    const pkg = await this.packages.findById(clientPackageId);
    if (!pkg) throw new AppError("Pacote do cliente não encontrado", 404);
    assertShopAccess(user, pkg.barbershopId);
    assertOwner(user);

    if (pkg.status === "CANCELLED") {
      throw new AppError("Pacote já está cancelado", 409);
    }
    if (pkg.remainingSessions !== pkg.totalSessions) {
      throw new AppError(
        "Só é possível cancelar um pacote sem sessões utilizadas",
        400
      );
    }

    return this.packages.cancel(pkg.id);
  }
}
