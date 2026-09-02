import { prisma } from '@/libs/prismaClient';
import { AppError } from '@/shared/errors/AppError';
import { supportsQueue, supportsAppointments } from '@/shared/utils/operationMode';
import type { OperationMode } from '@/modules/barbershops/dtos/IBarbershopResponseDTO';

type Feature = 'queue' | 'appointments';

interface BarbershopMode {
  operationMode: OperationMode;
  active: boolean;
}

async function loadBarbershopMode(barbershopId: string): Promise<BarbershopMode> {
  const shop = await prisma.barbershop.findUnique({
    where: { id: barbershopId },
    select: { operationMode: true, active: true },
  });
  if (!shop) throw new AppError('Salão não encontrado', 404);
  if (!shop.active) throw new AppError('Salão inativo', 403);
  return shop;
}

export async function assertOperationEnabled(
  barbershopId: string,
  feature: Feature
): Promise<OperationMode> {
  const shop = await loadBarbershopMode(barbershopId);

  if (feature === 'queue' && !supportsQueue(shop.operationMode)) {
    throw new AppError(
      'Este salão atende somente com horário agendado.',
      409,
      { code: 'OPERATION_MODE_DISABLED', operationMode: shop.operationMode }
    );
  }

  if (feature === 'appointments' && !supportsAppointments(shop.operationMode)) {
    throw new AppError(
      'Este salão atende somente por ordem de chegada.',
      409,
      { code: 'OPERATION_MODE_DISABLED', operationMode: shop.operationMode }
    );
  }

  return shop.operationMode;
}

export async function getBarbershopOperationMode(barbershopId: string): Promise<OperationMode> {
  const shop = await loadBarbershopMode(barbershopId);
  return shop.operationMode;
}
