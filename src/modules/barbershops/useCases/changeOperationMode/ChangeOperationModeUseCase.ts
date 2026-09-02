import { injectable, inject } from 'tsyringe';
import { prisma } from '@/libs/prismaClient';
import { AppError } from '@/shared/errors/AppError';
import { IBarbershopRepository } from '../../repositories/IBarbershopRepository';
import type { OperationMode } from '../../dtos/IBarbershopResponseDTO';
import { supportsQueue, supportsAppointments } from '@/shared/utils/operationMode';

interface ChangeOperationModeDTO {
  barbershopId: string;
  operationMode: OperationMode;
  requestingUser: { id: string; role: string; barbershopId?: string };
}

interface ChangeOperationModeResult {
  operationMode: OperationMode;
  capabilities: { queue: boolean; appointments: boolean };
  pending: { manualQueue: number; futureAppointments: number };
}

@injectable()
export class ChangeOperationModeUseCase {
  constructor(
    @inject('BarbershopRepository')
    private barbershopRepository: IBarbershopRepository
  ) {}

  async execute(data: ChangeOperationModeDTO): Promise<ChangeOperationModeResult> {
    const { barbershopId, operationMode, requestingUser } = data;

    if (requestingUser.role !== 'MASTER_ADMIN' && requestingUser.role !== 'OWNER') {
      throw new AppError('Acesso negado: apenasOWNER ou MASTER_ADMIN podem alterar o modo de atendimento', 403);
    }

    if (requestingUser.role === 'OWNER' && requestingUser.barbershopId !== barbershopId) {
      throw new AppError('Acesso negado: você não pertence a este salão', 403);
    }

    const shop = await this.barbershopRepository.findById(barbershopId);
    if (!shop) throw new AppError('Salão não encontrado', 404);
    if (!shop.active) throw new AppError('Salão inativo', 403);

    if (!['QUEUE_ONLY', 'APPOINTMENTS_ONLY', 'HYBRID'].includes(operationMode)) {
      throw new AppError('Modo de atendimento inválido', 400);
    }

    const updated = await this.barbershopRepository.update(barbershopId, { operationMode });

    const [manualQueue, futureAppointments] = await Promise.all([
      prisma.queueItem.count({
        where: {
          barbershopId,
          status: { in: ['waiting', 'in_chair'] },
        },
      }),
      prisma.appointment.count({
        where: {
          barbershopId,
          status: { in: ['CONFIRMED', 'PENDING'] },
          startTime: { gte: new Date() },
        },
      }),
    ]);

    await prisma.auditLog.create({
      data: {
        userId: requestingUser.id,
        action: 'CHANGE_OPERATION_MODE',
        resource: 'Barbershop',
        resourceId: barbershopId,
        details: JSON.stringify({
          from: shop.operationMode,
          to: operationMode,
        }),
      },
    }).catch(() => {});

    return {
      operationMode: updated.operationMode,
      capabilities: {
        queue: supportsQueue(operationMode),
        appointments: supportsAppointments(operationMode),
      },
      pending: {
        manualQueue,
        futureAppointments,
      },
    };
  }
}
