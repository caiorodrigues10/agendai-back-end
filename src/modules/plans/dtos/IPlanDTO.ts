export type PlanBillingCycle = "MONTHLY" | "YEARLY";

export interface ICreatePlanDTO {
  name: string;
  description?: string;
  price: number;
  billingCycle?: PlanBillingCycle;
  maxEmployees: number;
  hasDashboard?: boolean;
  tierKey?: string;
  features: string[];
}

export interface IUpdatePlanDTO {
  name?: string;
  description?: string;
  price?: number;
  billingCycle?: PlanBillingCycle;
  maxEmployees?: number;
  hasDashboard?: boolean;
  tierKey?: string;
  features?: string[];
  active?: boolean;
}

export interface IPlanResponseDTO {
  id: string;
  name: string;
  description: string | null;
  price: number;
  billingCycle: PlanBillingCycle;
  maxEmployees: number;
  hasDashboard: boolean;
  tierKey: string;
  features: string[];
  active: boolean;
  createdAt: Date;
}
