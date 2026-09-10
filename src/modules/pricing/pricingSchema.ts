import { z } from "zod";

export const pricingRuleTypeMap = {
  peak_hours: "PEAK_HOURS",
  happy_hour: "HAPPY_HOUR",
  loyalty_discount: "LOYALTY_DISCOUNT",
  first_visit: "FIRST_VISIT",
  weather_based: "WEATHER_BASED",
  day_of_week: "DAY_OF_WEEK",
  seasonal: "SEASONAL",
  custom: "CUSTOM",
} as const;

export const createPricingRuleSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(["peak_hours", "happy_hour", "loyalty_discount", "first_visit", "weather_based", "day_of_week", "seasonal", "custom"]),
  isActive: z.boolean().default(true),
  priority: z.number().int().min(0).default(0),
  config: z.record(z.unknown()).default({}),
  discountPercent: z.number().min(0).max(100).default(0),
  surchargePercent: z.number().min(0).max(100).default(0),
  startAt: z.string().datetime().optional().nullable(),
  endAt: z.string().datetime().optional().nullable(),
});

export const updatePricingRuleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: z.enum(["peak_hours", "happy_hour", "loyalty_discount", "first_visit", "weather_based", "day_of_week", "seasonal", "custom"]).optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().min(0).optional(),
  config: z.record(z.unknown()).optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  surchargePercent: z.number().min(0).max(100).optional(),
  startAt: z.string().datetime().optional().nullable(),
  endAt: z.string().datetime().optional().nullable(),
});

export const evaluatePriceSchema = z.object({
  serviceId: z.string().uuid(),
  basePrice: z.number().min(0),
  clientId: z.string().uuid().optional().nullable(),
  scheduledAt: z.string().datetime().optional(),
  weatherCondition: z.string().optional(),
});
