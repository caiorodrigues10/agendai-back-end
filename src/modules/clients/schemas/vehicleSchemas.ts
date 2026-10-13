import { z } from "zod";

/** Placa normalizada: maiúscula, sem espaço/hífen, 7–8 caracteres (Mercosul ou antiga). */
export function normalizePlate(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]/g, "");
}

const plateSchema = z
  .string()
  .min(1, "Placa obrigatória")
  .max(10)
  .transform(normalizePlate)
  .refine((v) => /^[A-Z0-9]{7,8}$/.test(v), "Placa inválida (ex.: ABC1234 ou ABC1D23)");

export const createVehicleSchema = z.object({
  plate: plateSchema,
  vehicleModel: z.string().min(1, "Modelo obrigatório").max(120),
  color: z.string().max(40).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const updateVehicleSchema = z.object({
  plate: plateSchema.optional(),
  vehicleModel: z.string().min(1).max(120).optional(),
  color: z.string().max(40).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  active: z.boolean().optional(),
});

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
