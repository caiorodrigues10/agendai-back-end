import { injectable } from 'tsyringe';
import { prisma } from '@/libs/prismaClient';
import { AppError } from '@/shared/errors/AppError';

type StepName = 'PROFILE' | 'SCHEDULE' | 'SERVICES' | 'PUBLIC_LINK' | 'WHATSAPP' | 'FIRST_SERVICE';

const STEP_FIELDS: Record<StepName, string> = {
  PROFILE: 'profileConfirmedAt',
  SCHEDULE: 'scheduleConfirmedAt',
  SERVICES: 'servicesConfirmedAt',
  PUBLIC_LINK: 'publicLinkValidatedAt',
  WHATSAPP: 'whatsappConfiguredAt',
  FIRST_SERVICE: 'completedAt',
};

@injectable()
export class UpdateOnboardingStepUseCase {
  async execute(barbershopId: string, step: StepName, requestingUserRole: string) {
    if (requestingUserRole !== 'MASTER_ADMIN' && requestingUserRole !== 'OWNER') {
      throw new AppError('Acesso negado', 403);
    }

    if (!STEP_FIELDS[step]) {
      throw new AppError('Passo inválido', 400);
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

    const allRequired = ['profileConfirmedAt', 'scheduleConfirmedAt', 'servicesConfirmedAt', 'publicLinkValidatedAt', 'completedAt'];
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
