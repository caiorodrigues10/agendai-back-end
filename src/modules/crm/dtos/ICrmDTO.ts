export type CrmSegment = "all" | "new" | "recurring" | "vip" | "at_risk" | "inactive_30" | "inactive_60" | "inactive_90" | "debtors" | "package_expiring" | "low_demand";

export interface CrmClientMetrics {
  clientId: string;
  name: string;
  whatsapp: string;
  marketingOptIn: boolean;
  grossRevenue: number;
  receivedRevenue: number;
  outstanding: number;
  ltv: number;
  visits: number;
  avgTicket: number;
  firstVisitAt: string | null;
  lastVisitAt: string | null;
  nextExpectedVisitAt: string | null;
  daysSinceLastVisit: number | null;
  risk: "low" | "medium" | "high";
  segment: CrmSegment;
  favoriteService: string | null;
  activePackageSessions: number;
}

export interface CrmOverviewDTO {
  from: string;
  to: string;
  compare: { grossRevenue: number; receivedRevenue: number; customers: number } | null;
  kpis: {
    grossRevenue: number;
    receivedRevenue: number;
    outstanding: number;
    avgTicket: number;
    newCustomers: number;
    recurringCustomers: number;
    reactivatedCustomers: number;
    inactiveCustomers: number;
    retentionRate: number;
    averageVisitIntervalDays: number | null;
    packageSales: number;
    packageSessions: number;
    revenueAtRisk: number;
  };
  byDay: Array<{ date: string; grossRevenue: number; receivedRevenue: number; visits: number }>;
  topClients: CrmClientMetrics[];
  segments: Array<{ segment: CrmSegment; label: string; count: number; potential: number }>;
}

export interface CrmForecastDTO {
  horizon: number;
  maturity: "insufficient" | "preliminary" | "trained";
  historicalDays: number;
  backtest: { mae: number | null; mape: number | null };
  predictions: Array<{
    date: string;
    predictedVisits: number;
    predictedRevenue: number;
    confidenceLow: number;
    confidenceHigh: number;
    weather: string | null;
    risk: "low" | "medium" | "high";
    factors: string[];
  }>;
}
