import { z } from "zod";
import { MAX_MONETARY_VALUE, MONETARY_VALUE_TOO_HIGH } from "@/shared/constants/money";

export const createServiceSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  barbershopId: z.string().uuid(),
  name: z.string().min(2).max(100),
  price: z.number().min(0).max(MAX_MONETARY_VALUE, MONETARY_VALUE_TOO_HIGH),
  avgTimeMinutes: z.number().min(1),
  icon: z.string().min(1).max(50),
  commissionPercent: z.number().min(0).max(100).optional(),
  /**
   * Serviço agendável pelo cliente (padrão true). Quando false, o serviço é
   * interno — audiência, diligência, despacho — e não aparece na agenda pública.
   */
  publicBookable: z.boolean().optional()
});

export const updateServiceSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  name: z.string().min(2).max(100).optional(),
  price: z.number().min(0).max(MAX_MONETARY_VALUE, MONETARY_VALUE_TOO_HIGH).optional(),
  avgTimeMinutes: z.number().min(1).optional(),
  icon: z.string().min(1).max(50).optional(),
  active: z.boolean().optional(),
  commissionPercent: z.number().min(0).max(100).optional(),
  publicBookable: z.boolean().optional()
});
