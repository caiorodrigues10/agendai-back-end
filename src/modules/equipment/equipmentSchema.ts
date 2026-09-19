import { z } from "zod";

// ─── Equipment CRUD ──────────────────────────────────────────

export const equipmentCategoryMap = {
  barber_tools: "BARBER_TOOLS",
  beard_tools: "BEARD_TOOLS",
  aesthetics: "AESTHETICS",
  furniture: "FURNITURE",
  cleaning: "CLEANING",
  other: "OTHER",
} as const;

export const equipmentConditionMap = {
  new: "NEW",
  good: "GOOD",
  worn: "WORN",
  broken: "BROKEN",
  in_maintenance: "IN_MAINTENANCE",
} as const;

export const createEquipmentSchema = z.object({
  barbershopId: z.string().uuid().optional(),
  name: z.string().min(1).max(150),
  category: z.enum(["barber_tools", "beard_tools", "aesthetics", "furniture", "cleaning", "other"]).default("other"),
  brand: z.string().max(100).optional().nullable(),
  model: z.string().max(100).optional().nullable(),
  serialNumber: z.string().max(100).optional().nullable(),
  quantityTotal: z.number().int().min(0).default(1),
  quantityAvailable: z.number().int().min(0).default(1),
  condition: z.enum(["new", "good", "worn", "broken", "in_maintenance"]).default("new"),
  minQuantity: z.number().int().min(0).default(0),
  unitCost: z.number().min(0).optional().nullable(),
  supplier: z.string().max(150).optional().nullable(),
  purchaseDate: z.string().datetime().optional().nullable(),
  warrantyUntil: z.string().datetime().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export const updateEquipmentSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  category: z.enum(["barber_tools", "beard_tools", "aesthetics", "furniture", "cleaning", "other"]).optional(),
  brand: z.string().max(100).optional().nullable(),
  model: z.string().max(100).optional().nullable(),
  serialNumber: z.string().max(100).optional().nullable(),
  quantityTotal: z.number().int().min(0).optional(),
  quantityAvailable: z.number().int().min(0).optional(),
  condition: z.enum(["new", "good", "worn", "broken", "in_maintenance"]).optional(),
  minQuantity: z.number().int().min(0).optional(),
  unitCost: z.number().min(0).optional().nullable(),
  supplier: z.string().max(150).optional().nullable(),
  purchaseDate: z.string().datetime().optional().nullable(),
  warrantyUntil: z.string().datetime().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const equipmentListQuerySchema = z.object({
  category: z.enum(["barber_tools", "beard_tools", "aesthetics", "furniture", "cleaning", "other"]).optional(),
  isActive: z
    .string()
    .transform((v) => v === "true")
    .optional(),
  condition: z.enum(["new", "good", "worn", "broken", "in_maintenance"]).optional(),
  search: z.string().max(150).optional(),
});

// ─── Movements ───────────────────────────────────────────────

export const movementTypeMap = {
  in: "IN",
  out: "OUT",
  maintenance: "MAINTENANCE",
  loss: "LOSS",
  adjustment: "ADJUSTMENT",
} as const;

export const createMovementSchema = z.object({
  equipmentId: z.string().uuid(),
  barbershopId: z.string().uuid().optional(),
  type: z.enum(["in", "out", "maintenance", "loss", "adjustment"]),
  quantity: z.number().int().min(1),
  reason: z.string().max(300).optional().nullable(),
  staffId: z.string().uuid().optional().nullable(),
});

export const movementListQuerySchema = z.object({
  equipmentId: z.string().uuid().optional(),
  type: z.enum(["in", "out", "maintenance", "loss", "adjustment"]).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

// ─── Needs ───────────────────────────────────────────────────

export const needPriorityMap = {
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
  urgent: "URGENT",
} as const;

export const needStatusMap = {
  requested: "REQUESTED",
  approved: "APPROVED",
  ordered: "ORDERED",
  received: "RECEIVED",
  rejected: "REJECTED",
} as const;

export const createNeedSchema = z.object({
  barbershopId: z.string().uuid().optional(),
  equipmentId: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(150),
  quantityNeeded: z.number().int().min(1).default(1),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  reason: z.string().max(500).optional().nullable(),
  estimatedCost: z.number().min(0).optional().nullable(),
  requestedBy: z.string().uuid().optional().nullable(),
});

export const updateNeedSchema = z.object({
  status: z.enum(["requested", "approved", "ordered", "received", "rejected"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  reason: z.string().max(500).optional().nullable(),
  estimatedCost: z.number().min(0).optional().nullable(),
});

export const needListQuerySchema = z.object({
  status: z.enum(["requested", "approved", "ordered", "received", "rejected"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
});

// ─── Dashboard ───────────────────────────────────────────────

export const dashboardQuerySchema = z.object({});
