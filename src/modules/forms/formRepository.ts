import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import {
  createFormSchema,
  updateFormSchema,
  addFieldSchema,
  updateFieldSchema,
  submitResponseSchema,
} from "./formSchema";
import type { z } from "zod";

type CreateFormInput = z.infer<typeof createFormSchema>;
type UpdateFormInput = z.infer<typeof updateFormSchema>;
type AddFieldInput = z.infer<typeof addFieldSchema>;
type UpdateFieldInput = z.infer<typeof updateFieldSchema>;
type SubmitResponseInput = z.infer<typeof submitResponseSchema>;

const formSelect = {
  id: true,
  barbershopId: true,
  name: true,
  description: true,
  type: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  fields: {
    select: {
      id: true,
      formId: true,
      label: true,
      type: true,
      required: true,
      options: true,
      placeholder: true,
      order: true,
      createdAt: true,
    },
    orderBy: { order: "asc" as const },
  },
  _count: { select: { responses: true } },
} as const;

const responseSelect = {
  id: true,
  formId: true,
  barbershopId: true,
  clientId: true,
  appointmentId: true,
  answers: true,
  submittedAt: true,
  client: { select: { id: true, name: true, email: true, phone: true } },
} as const;

export class FormRepository {
  async listByBarbershop(barbershopId: string, isActive?: boolean) {
    return prisma.customForm.findMany({
      where: {
        barbershopId,
        ...(isActive !== undefined ? { isActive } : {}),
      },
      select: formSelect,
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(id: string) {
    return prisma.customForm.findUnique({
      where: { id },
      select: formSelect,
    });
  }

  async create(barbershopId: string, data: CreateFormInput) {
    return prisma.customForm.create({
      data: {
        barbershopId,
        name: data.name,
        description: data.description ?? null,
        type: data.type,
      },
      select: formSelect,
    });
  }

  async update(id: string, data: UpdateFormInput) {
    const existing = await prisma.customForm.findUnique({ where: { id } });
    if (!existing) throw new AppError("Formulário não encontrado", 404);

    return prisma.customForm.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      select: formSelect,
    });
  }

  async delete(id: string) {
    const existing = await prisma.customForm.findUnique({ where: { id } });
    if (!existing) throw new AppError("Formulário não encontrado", 404);

    await prisma.customForm.delete({ where: { id } });
  }

  async addField(formId: string, data: AddFieldInput) {
    const existing = await prisma.customForm.findUnique({ where: { id: formId } });
    if (!existing) throw new AppError("Formulário não encontrado", 404);

    const maxOrder = await prisma.formField.aggregate({
      where: { formId },
      _max: { order: true },
    });

    return prisma.formField.create({
      data: {
        formId,
        label: data.label,
        type: data.type,
        required: data.required,
        options: data.options ?? undefined,
        placeholder: data.placeholder ?? null,
        order: data.order ?? (maxOrder._max.order ?? -1) + 1,
      },
    });
  }

  async updateField(fieldId: string, formId: string, data: UpdateFieldInput) {
    const existing = await prisma.formField.findUnique({ where: { id: fieldId } });
    if (!existing) throw new AppError("Campo não encontrado", 404);
    if (existing.formId !== formId) throw new AppError("Campo não pertence a este formulário", 400);

    return prisma.formField.update({
      where: { id: fieldId },
      data: {
        ...(data.label !== undefined && { label: data.label }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.required !== undefined && { required: data.required }),
        ...(data.options !== undefined && { options: data.options }),
        ...(data.placeholder !== undefined && { placeholder: data.placeholder }),
        ...(data.order !== undefined && { order: data.order }),
      },
    });
  }

  async deleteField(fieldId: string, formId: string) {
    const existing = await prisma.formField.findUnique({ where: { id: fieldId } });
    if (!existing) throw new AppError("Campo não encontrado", 404);
    if (existing.formId !== formId) throw new AppError("Campo não pertence a este formulário", 400);

    await prisma.formField.delete({ where: { id: fieldId } });
  }

  async submitResponse(formId: string, barbershopId: string, data: SubmitResponseInput) {
    const existing = await prisma.customForm.findUnique({ where: { id: formId } });
    if (!existing) throw new AppError("Formulário não encontrado", 404);

    return prisma.formResponse.create({
      data: {
        formId,
        barbershopId,
        clientId: data.clientId ?? null,
        appointmentId: data.appointmentId ?? null,
        answers: data.answers,
      },
      select: responseSelect,
    });
  }

  async listResponses(formId: string, barbershopId: string, clientId?: string) {
    return prisma.formResponse.findMany({
      where: {
        formId,
        barbershopId,
        ...(clientId ? { clientId } : {}),
      },
      select: responseSelect,
      orderBy: { submittedAt: "desc" },
    });
  }
}
