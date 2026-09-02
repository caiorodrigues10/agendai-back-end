import { injectable } from 'tsyringe';
import { prisma } from '@/libs/prismaClient';
import { AppError } from '@/shared/errors/AppError';

interface OnboardingStep {
  key: string;
  label: string;
  completed: boolean;
  completedAt: Date | null;
  required: boolean;
}

const ONBOARDING_STEPS: Array<{ key: string; label: string; field: string; required: boolean }> = [
  { key: 'PROFILE', label: 'Revisar dados do salão', field: 'profileConfirmedAt', required: true },
  { key: 'SCHEDULE', label: 'Revisar horários', field: 'scheduleConfirmedAt', required: true },
  { key: 'SERVICES', label: 'Revisar serviços sugeridos', field: 'servicesConfirmedAt', required: true },
  { key: 'PUBLIC_LINK', label: 'Abrir e validar o link público', field: 'publicLinkValidatedAt', required: true },
  { key: 'WHATSAPP', label: 'Configurar WhatsApp', field: 'whatsappConfiguredAt', required: false },
  { key: 'FIRST_SERVICE', label: 'Registrar primeiro atendimento', field: 'firstServiceCompletedAt', required: true },
];

@injectable()
export class GetOnboardingUseCase {
  async execute(
    barbershopId: string,
    requestingUserId: string,
    requestingUserRole: string,
    requestingUserBarbershopId?: string,
  ) {
    if (requestingUserRole !== 'MASTER_ADMIN' && requestingUserRole !== 'OWNER') {
      throw new AppError('Acesso negado', 403);
    }
    if (requestingUserRole !== 'MASTER_ADMIN' && requestingUserBarbershopId !== barbershopId) {
      throw new AppError('Acesso negado', 403);
    }

    const barbershop = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: { id: true },
    });
    if (!barbershop) throw new AppError('Salão não encontrado', 404);

    let onboarding = await prisma.barbershopOnboarding.findUnique({
      where: { barbershopId },
    });

    if (!onboarding) {
      onboarding = await prisma.barbershopOnboarding.create({
        data: { barbershopId },
      });
    }

    const steps: OnboardingStep[] = ONBOARDING_STEPS.map(step => ({
      key: step.key,
      label: step.label,
      completed: onboarding[step.field as keyof typeof onboarding] !== null,
      completedAt: onboarding[step.field as keyof typeof onboarding] as Date | null,
      required: step.required,
    }));

    const completedRequired = steps.filter(s => s.required && s.completed).length;
    const totalRequired = steps.filter(s => s.required).length;
    const progress = totalRequired > 0 ? Math.round((completedRequired / totalRequired) * 100) : 0;

    const nextStep = steps.find(s => !s.completed && s.required);

    return {
      steps,
      progress,
      nextStep: nextStep?.key ?? null,
      completed: onboarding.completedAt !== null,
    };
  }
}
