import { FormRepository } from "./formRepository";
import { AppError } from "@/shared/errors/AppError";
import type { z } from "zod";
import type {
  createFormSchema,
  updateFormSchema,
  addFieldSchema,
  updateFieldSchema,
  submitResponseSchema,
  formListQuerySchema,
  formResponseListQuerySchema,
} from "./formSchema";

type CreateFormInput = z.infer<typeof createFormSchema>;
type UpdateFormInput = z.infer<typeof updateFormSchema>;
type AddFieldInput = z.infer<typeof addFieldSchema>;
type UpdateFieldInput = z.infer<typeof updateFieldSchema>;
type SubmitResponseInput = z.infer<typeof submitResponseSchema>;
type ListQuery = z.infer<typeof formListQuerySchema>;
type ResponseListQuery = z.infer<typeof formResponseListQuerySchema>;

export class FormUseCases {
  private repo = new FormRepository();

  async list(barbershopId: string, query: ListQuery) {
    return this.repo.listByBarbershop(barbershopId, query.isActive);
  }

  async getById(id: string) {
    const form = await this.repo.findById(id);
    if (!form) throw new AppError("Formulário não encontrado", 404);
    return form;
  }

  async create(barbershopId: string, data: CreateFormInput) {
    return this.repo.create(barbershopId, data);
  }

  async update(id: string, barbershopId: string, data: UpdateFormInput) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new AppError("Formulário não encontrado", 404);
    if (existing.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    return this.repo.update(id, data);
  }

  async delete(id: string, barbershopId: string) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new AppError("Formulário não encontrado", 404);
    if (existing.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    return this.repo.delete(id);
  }

  async addField(formId: string, barbershopId: string, data: AddFieldInput) {
    const existing = await this.repo.findById(formId);
    if (!existing) throw new AppError("Formulário não encontrado", 404);
    if (existing.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    return this.repo.addField(formId, data);
  }

  async updateField(fieldId: string, formId: string, barbershopId: string, data: UpdateFieldInput) {
    const existing = await this.repo.findById(formId);
    if (!existing) throw new AppError("Formulário não encontrado", 404);
    if (existing.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    return this.repo.updateField(fieldId, formId, data);
  }

  async deleteField(fieldId: string, formId: string, barbershopId: string) {
    const existing = await this.repo.findById(formId);
    if (!existing) throw new AppError("Formulário não encontrado", 404);
    if (existing.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    return this.repo.deleteField(fieldId, formId);
  }

  async submitResponse(formId: string, barbershopId: string, data: SubmitResponseInput) {
    const form = await this.repo.findById(formId);
    if (!form) throw new AppError("Formulário não encontrado", 404);
    if (form.barbershopId !== barbershopId) {
      throw new AppError("Formulário não pertence a esta barbearia", 400);
    }
    return this.repo.submitResponse(formId, barbershopId, data);
  }

  async listResponses(formId: string, barbershopId: string, query: ResponseListQuery) {
    const form = await this.repo.findById(formId);
    if (!form) throw new AppError("Formulário não encontrado", 404);
    if (form.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    return this.repo.listResponses(formId, barbershopId, query.clientId);
  }
}
