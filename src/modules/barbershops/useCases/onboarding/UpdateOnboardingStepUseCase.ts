import { injectable } from 'tsyringe';
import { prisma } from '@/libs/prismaClient';
import { AppError } from '@/shared/errors/AppError';

type StepName = 'PROFILE' | 'SEGMENT' | 'SCHEDULE' | 'SERVICES' | 'PUBLIC_LINK' | 'WHATSAPP' | 'FIRST_SERVICE' | 'OPERATION_MODE';

const STEP_FIELDS: Record<StepName, string> = {
  PROFILE: 'profileConfirmedAt',
  SEGMENT: 'segmentConfirmedAt',
  SCHEDULE: 'scheduleConfirmedAt',
  SERVICES: 'servicesConfirmedAt',
  PUBLIC_LINK: 'publicLinkValidatedAt',
  WHATSAPP: 'whatsappConfiguredAt',
  FIRST_SERVICE: 'firstServiceCompletedAt',
  OPERATION_MODE: 'operationModeConfirmedAt',
};

@injectable()
export class UpdateOnboardingStepUseCase {
  async execute(
    barbershopId: string,
    step: StepName,
    requestingUserRole: string,
    requestingUserBarbershopId?: string,
  ) {
    if (requestingUserRole !== 'MASTER_ADMIN' && requestingUserRole !== 'OWNER') {
      throw new AppError('Acesso negado', 403);
    }
    if (requestingUserRole !== 'MASTER_ADMIN' && requestingUserBarbershopId !== barbershopId) {
      throw new AppError('Acesso negado', 403);
    }

    if (!STEP_FIELDS[step]) {
      throw new AppError('Passo inválido', 400);
    }

    if (step === 'PROFILE') {
      const shop = await prisma.barbershop.findUnique({ where: { id: barbershopId }, select: { name: true, city: true } });
      if (!shop?.name.trim() || !shop.city?.trim()) throw new AppError('Complete o nome e a cidade do salão antes de confirmar.', 400);
    }
    if (step === 'SCHEDULE') {
      const openDays = await prisma.schedule.count({ where: { barbershopId, isOpen: true } });
      if (!openDays) throw new AppError('Configure pelo menos um dia de funcionamento.', 400);
    }
    if (step === 'SERVICES') {
      const activeServices = await prisma.service.count({ where: { barbershopId, active: true } });
      if (!activeServices) throw new AppError('Cadastre pelo menos um serviço ativo.', 400);
    }
    if (step === 'SEGMENT') {
      const shop = await prisma.barbershop.findUnique({ where: { id: barbershopId }, select: { businessSegment: true } });
      if (!shop) throw new AppError('Salão não encontrado.', 404);
    }
    if (step === 'OPERATION_MODE') {
      const shop = await prisma.barbershop.findUnique({ where: { id: barbershopId }, select: { operationMode: true } });
      if (!shop) throw new AppError('Salão não encontrado.', 404);
    }

    const field = STEP_FIELDS[step];
    const now = new Date();

    let onboarding = await prisma.barbershopOnboarding.findUnique({
      where: { barbershopId },
    });

    if (!onboarding) {
      onboarding = await prisma.barbershopOnboarding.create({
        data: { barbershopId, [field]: now },
      });
    } else {
      onboarding = await prisma.barbershopOnboarding.update({
        where: { barbershopId },
        data: { [field]: now },
      });
    }

    const allRequired = ['profileConfirmedAt', 'segmentConfirmedAt', 'scheduleConfirmedAt', 'servicesConfirmedAt', 'publicLinkValidatedAt', 'operationModeConfirmedAt'];
    const allComplete = allRequired.every(f => onboarding[f as keyof typeof onboarding] !== null);

    if (allComplete && !onboarding.completedAt) {
      await prisma.barbershopOnboarding.update({
        where: { barbershopId },
        data: { completedAt: now },
      });
    }

    return { success: true, step, completedAt: now };
  }
}
