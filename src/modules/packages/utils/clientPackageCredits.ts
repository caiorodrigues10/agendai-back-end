import { Prisma } from "@prisma/client";
import { AppError } from "@/shared/errors/AppError";

type Tx = Prisma.TransactionClient;

export async function debitClientPackageInTx(
  tx: Tx,
  params: {
    clientPackageId: string;
    barbershopId: string;
    serviceId: string;
    count: number;
  }
): Promise<{ clientId: string; customerName: string; whatsapp: string }> {
  const pkg = await tx.clientPackage.findUnique({
    where: { id: params.clientPackageId },
    include: { client: { select: { name: true, whatsapp: true } } },
  });
  if (!pkg) throw new AppError("Pacote do cliente não encontrado", 404);
  if (pkg.barbershopId !== params.barbershopId) {
    throw new AppError("Pacote não pertence a este salão", 403);
  }
  if (pkg.serviceId !== params.serviceId) {
    throw new AppError("Serviço não corresponde ao pacote", 400);
  }
  if (pkg.status === "CANCELLED") {
    throw new AppError("Pacote cancelado", 400);
  }
  const expired =
    pkg.status === "EXPIRED" ||
    (pkg.expiresAt != null && pkg.expiresAt.getTime() <= Date.now());
  if (expired) {
    if (pkg.status !== "EXPIRED") {
      await tx.clientPackage.update({
        where: { id: pkg.id },
        data: { status: "EXPIRED" },
      });
    }
    throw new AppError("Pacote expirado", 400);
  }
  if (pkg.status !== "ACTIVE") {
    throw new AppError("Pacote indisponível", 400);
  }

  const result = await tx.clientPackage.updateMany({
    where: {
      id: params.clientPackageId,
      status: "ACTIVE",
      remainingSessions: { gte: params.count },
    },
    data: { remainingSessions: { decrement: params.count } },
  });
  if (result.count !== 1) {
    throw new AppError("Saldo insuficiente no pacote", 400);
  }

  await tx.clientPackage.updateMany({
    where: {
      id: params.clientPackageId,
      remainingSessions: 0,
      status: "ACTIVE",
    },
    data: { status: "DEPLETED" },
  });

  return {
    clientId: pkg.clientId,
    customerName: pkg.client.name,
    whatsapp: pkg.client.whatsapp,
  };
}

export async function restoreClientPackageInTx(
  tx: Tx,
  clientPackageId: string,
  count = 1
): Promise<void> {
  const pkg = await tx.clientPackage.findUnique({
    where: { id: clientPackageId },
  });
  if (!pkg) return;
  if (pkg.status !== "ACTIVE" && pkg.status !== "DEPLETED") return;

  const remaining = pkg.remainingSessions + count;
  await tx.clientPackage.update({
    where: { id: clientPackageId },
    data: {
      remainingSessions: remaining,
      status: remaining > 0 ? "ACTIVE" : "DEPLETED",
    },
  });
}
