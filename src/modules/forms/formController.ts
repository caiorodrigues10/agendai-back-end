import { FastifyRequest, FastifyReply } from "fastify";
import {
  createFormSchema,
  updateFormSchema,
  addFieldSchema,
  updateFieldSchema,
  submitResponseSchema,
  formListQuerySchema,
  formResponseListQuerySchema,
} from "./formSchema";
import { FormUseCases } from "./formUseCases";
import { AppError } from "@/shared/errors/AppError";

export class FormController {
  private useCases = new FormUseCases();

  async list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const query = formListQuerySchema.parse(request.query);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const forms = await this.useCases.list(resolvedBarbershopId, query);
    reply.send({ success: true, data: forms });
  }

  async getById(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const form = await this.useCases.getById(id);
    reply.send({ success: true, data: form });
  }

  async create(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const body = createFormSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const form = await this.useCases.create(resolvedBarbershopId, { ...body, barbershopId: resolvedBarbershopId });
    reply.status(201).send({ success: true, data: form });
  }

  async update(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };
    const body = updateFormSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const form = await this.useCases.update(id, resolvedBarbershopId, body);
    reply.send({ success: true, data: form });
  }

  async delete(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    await this.useCases.delete(id, resolvedBarbershopId);
    reply.send({ success: true, message: "Formulário removido" });
  }

  async addField(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };
    const body = addFieldSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const field = await this.useCases.addField(id, resolvedBarbershopId, body);
    reply.status(201).send({ success: true, data: field });
  }

  async updateField(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id, fieldId } = request.params as {
      barbershopId: string;
      id: string;
      fieldId: string;
    };
    const body = updateFieldSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const field = await this.useCases.updateField(fieldId, id, resolvedBarbershopId, body);
    reply.send({ success: true, data: field });
  }

  async deleteField(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id, fieldId } = request.params as {
      barbershopId: string;
      id: string;
      fieldId: string;
    };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    await this.useCases.deleteField(fieldId, id, resolvedBarbershopId);
    reply.send({ success: true, message: "Campo removido" });
  }

  async submitResponse(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };
    const body = submitResponseSchema.parse(request.body);

    const response = await this.useCases.submitResponse(id, barbershopId, body);
    reply.status(201).send({ success: true, data: response });
  }

  async listResponses(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };
    const query = formResponseListQuerySchema.parse(request.query);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const responses = await this.useCases.listResponses(id, resolvedBarbershopId, query);
    reply.send({ success: true, data: responses });
  }
}
