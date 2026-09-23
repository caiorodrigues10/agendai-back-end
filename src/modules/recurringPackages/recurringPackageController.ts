import { FastifyRequest, FastifyReply } from "fastify";
import {
  createRecurringPackagePlanSchema,
  updateRecurringPackagePlanSchema,
  createClientRecurringPackageSchema,
  recordPaymentSchema,
  useBenefitSchema,
  recurringPackageListQuerySchema,
} from "./recurringPackageSchema";
import { RecurringPackageUseCases } from "./recurringPackageUseCases";
import { AppError } from "@/shared/errors/AppError";

export class RecurringPackageController {
  private useCases = new RecurringPackageUseCases();

  async listPlans(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const plans = await this.useCases.listPlans(resolvedBarbershopId);
    reply.send({ success: true, data: plans });
  }

  async createPlan(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const body = createRecurringPackagePlanSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const plan = await this.useCases.createPlan(resolvedBarbershopId, body);
    reply.status(201).send({ success: true, data: plan });
  }

  async updatePlan(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, planId } = request.params as { barbershopId: string; planId: string };
    const body = updateRecurringPackagePlanSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const plan = await this.useCases.updatePlan(resolvedBarbershopId, planId, body);
    reply.send({ success: true, data: plan });
  }

  async listPackages(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const query = recurringPackageListQuerySchema.parse(request.query);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const { RecurringPackageRepository } = await import("./recurringPackageRepository");
    const repo = new RecurringPackageRepository();
    const result = await repo.listPackages(resolvedBarbershopId, query);
    reply.send({ success: true, data: result });
  }

  async createPackage(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const body = createClientRecurringPackageSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const pkg = await this.useCases.createPackage(resolvedBarbershopId, body);
    reply.status(201).send({ success: true, data: pkg });
  }

  async getPackageDetails(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const pkg = await this.useCases.getPackageDetails(resolvedBarbershopId, id);
    reply.send({ success: true, data: pkg });
  }

  async activatePackage(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const pkg = await this.useCases.activatePackage(resolvedBarbershopId, id);
    reply.send({ success: true, data: pkg });
  }

  async pausePackage(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const pkg = await this.useCases.pausePackage(resolvedBarbershopId, id);
    reply.send({ success: true, data: pkg });
  }

  async resumePackage(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const pkg = await this.useCases.resumePackage(resolvedBarbershopId, id);
    reply.send({ success: true, data: pkg });
  }

  async cancelPackage(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const pkg = await this.useCases.cancelPackage(resolvedBarbershopId, id);
    reply.send({ success: true, data: pkg });
  }

  async recordPayment(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id, cycleId } = request.params as {
      barbershopId: string;
      id: string;
      cycleId: string;
    };
    const body = recordPaymentSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const cycle = await this.useCases.recordPayment(resolvedBarbershopId, id, cycleId, body);
    reply.send({ success: true, data: cycle });
  }

  async useBenefit(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id, benefitId } = request.params as {
      barbershopId: string;
      id: string;
      benefitId: string;
    };
    const body = useBenefitSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const usage = await this.useCases.useBenefit(resolvedBarbershopId, id, benefitId, body.appointmentId);
    reply.status(201).send({ success: true, data: usage });
  }

  async reverseBenefit(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id, benefitId } = request.params as {
      barbershopId: string;
      id: string;
      benefitId: string;
    };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const usage = await this.useCases.reverseBenefit(resolvedBarbershopId, benefitId);
    reply.send({ success: true, data: usage });
  }
}
