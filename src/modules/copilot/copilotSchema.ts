import { z } from "zod";

export const copilotSuggestionTypeMap = {
  pricing_optimization: "PRICING_OPTIMIZATION",
  schedule_gap: "SCHEDULE_GAP",
  client_win_back: "CLIENT_WIN_BACK",
  staff_performance: "STAFF_PERFORMANCE",
  inventory_alert: "INVENTORY_ALERT",
  campaign_idea: "CAMPAIGN_IDEA",
  revenue_tip: "REVENUE_TIP",
  retention_risk: "RETENTION_RISK",
} as const;

export const listSuggestionsSchema = z.object({
  type: z.enum([
    "pricing_optimization",
    "schedule_gap",
    "client_win_back",
    "staff_performance",
    "inventory_alert",
    "campaign_idea",
    "revenue_tip",
    "retention_risk",
  ]).optional(),
  unreadOnly: z.coerce.boolean().optional(),
});

export const markReadSchema = z.object({});

export const dismissSchema = z.object({});

export const acceptSchema = z.object({});
