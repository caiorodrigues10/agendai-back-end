import { Prisma } from "@prisma/client";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { ISalonClientRepository } from "../../repositories/ISalonClientRepository";
import {
  ICreateSalonClientDTO,
  IUpdateSalonClientDTO,
  ISalonClientListQuery,
  ISalonClientResponseDTO,
  ISalonClientPackageSummaryDTO,
  ISalonClientAppointmentDTO,
} from "../../dtos/ISalonClientDTO";

type ClientListRecord = Prisma.SalonClientGetPayload<{
  include: {
    packages: {
      where: { status: "ACTIVE" };
      select: { remainingSessions: true };
    };
  };
}>;

type ClientDetailRecord = Prisma.SalonClientGetPayload<{
  include: {
    packages: {
      include: {
        service: { select: { name: true } };
        package: { select: { name: true } };
      };
    };
    appointments: {
      include: { service: { select: { name: true } } };
    };
  };
}>;

function mapList(record: ClientListRecord): ISalonClientResponseDTO {
  const remainingSessions = record.packages.reduce(
    (sum, p) => sum + p.remainingSessions,
    0
  );
  return {
    id: record.id,
    barbershopId: record.barbershopId,
    name: record.name,
    whatsapp: record.whatsapp,
    notes: record.notes,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    remainingSessions,
    activePackageCount: record.packages.length,
  };
}

function mapDetail(record: ClientDetailRecord): ISalonClientResponseDTO {
  const packages: ISalonClientPackageSummaryDTO[] = record.packages.map((p) => ({
    id: p.id,
    packageId: p.packageId,
    packageName: p.package?.name ?? null,
    serviceId: p.serviceId,
    serviceName: p.service?.name ?? null,
    totalSessions: p.totalSessions,
    remainingSessions: p.remainingSessions,
    status: p.status,
    purchasedAt: p.purchasedAt,
    expiresAt: p.expiresAt,
    pricePaid: p.pricePaid,
    paymentMethod: p.paymentMethod,
  }));
  const appointments: ISalonClientAppointmentDTO[] = record.appointments.map(
    (a) => ({
      id: a.id,
      serviceId: a.serviceId,
      serviceName: a.service?.name ?? null,
      date: a.date,
      time: a.time,
      status: a.status,
      clientPackageId: a.clientPackageId,
    })
  );
  const remainingSessions = packages
    .filter((p) => p.status === "ACTIVE")
    .reduce((sum, p) => sum + p.remainingSessions, 0);

  return {
    id: record.id,
    barbershopId: record.barbershopId,
    name: record.name,
    whatsapp: record.whatsapp,
    notes: record.notes,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    remainingSessions,
    activePackageCount: packages.filter((p) => p.status === "ACTIVE").length,
    packages,
    appointments,
  };
}

const listInclude = {
  packages: {
    where: { status: "ACTIVE" as const },
    select: { remainingSessions: true },
  },
};

const detailInclude = {
  packages: {
    include: {
      service: { select: { name: true } },
      package: { select: { name: true } },
    },
    orderBy: { purchasedAt: "desc" as const },
  },
  appointments: {
    include: { service: { select: { name: true } } },
    orderBy: [{ date: "asc" as const }, { time: "asc" as const }],
    take: 50,
  },
};

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  );
}

export class SalonClientRepository implements ISalonClientRepository {
  async create(data: ICreateSalonClientDTO): Promise<ISalonClientResponseDTO> {
    try {
      const record = await prisma.salonClient.create({
        data: {
          barbershopId: data.barbershopId,
          name: data.name,
          whatsapp: data.whatsapp,
          notes: data.notes ?? null,
        },
        include: detailInclude,
      });
      return mapDetail(record);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppError("Já existe cliente com este WhatsApp neste salão", 409);
      }
      throw err;
    }
  }

  async findById(id: string): Promise<ISalonClientResponseDTO | null> {
    const record = await prisma.salonClient.findUnique({
      where: { id },
      include: detailInclude,
    });
    return record ? mapDetail(record) : null;
  }

  async findByWhatsapp(
    barbershopId: string,
    whatsapp: string
  ): Promise<ISalonClientResponseDTO | null> {
    const record = await prisma.salonClient.findUnique({
      where: { barbershopId_whatsapp: { barbershopId, whatsapp } },
      include: detailInclude,
    });
    return record ? mapDetail(record) : null;
  }

  async list(
    query: ISalonClientListQuery & { barbershopId: string }
  ): Promise<{ data: ISalonClientResponseDTO[]; total: number }> {
    const skip = (query.page - 1) * query.limit;
    const where: Prisma.SalonClientWhereInput = {
      barbershopId: query.barbershopId,
    };
    if (query.search) {
      const digits = query.search.replace(/\D/g, "");
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        ...(digits ? [{ whatsapp: { contains: digits } }] : []),
      ];
    }

    const [records, total] = await Promise.all([
      prisma.salonClient.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { name: "asc" },
        include: listInclude,
      }),
      prisma.salonClient.count({ where }),
    ]);

    return { data: records.map(mapList), total };
  }

  async update(
    id: string,
    data: IUpdateSalonClientDTO
  ): Promise<ISalonClientResponseDTO> {
    try {
      const record = await prisma.salonClient.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.whatsapp !== undefined && { whatsapp: data.whatsapp }),
          ...(data.notes !== undefined && { notes: data.notes }),
        },
        include: detailInclude,
      });
      return mapDetail(record);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppError("Já existe cliente com este WhatsApp neste salão", 409);
      }
      throw err;
    }
  }
}
