import type { SuccessFeeStatus } from "@prisma/client";

export interface SuccessFeeReportSummary {
  totalAmount: number;
  totalCount: number;
  pendingAmount: number;
  pendingCount: number;
  invoicedAmount: number;
  invoicedCount: number;
  paidAmount: number;
  paidCount: number;
  canceledAmount: number;
  canceledCount: number;
  receivableAmount: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function summarizeSuccessFees(
  rows: Array<{ status: SuccessFeeStatus; amount?: number | null }>
): SuccessFeeReportSummary {
  const summary: SuccessFeeReportSummary = {
    totalAmount: 0,
    totalCount: rows.length,
    pendingAmount: 0,
    pendingCount: 0,
    invoicedAmount: 0,
    invoicedCount: 0,
    paidAmount: 0,
    paidCount: 0,
    canceledAmount: 0,
    canceledCount: 0,
    receivableAmount: 0,
  };

  for (const row of rows) {
    const amount = row.amount ?? 0;
    summary.totalAmount += amount;
    if (row.status === "PENDING") {
      summary.pendingAmount += amount;
      summary.pendingCount += 1;
    } else if (row.status === "INVOICED") {
      summary.invoicedAmount += amount;
      summary.invoicedCount += 1;
    } else if (row.status === "PAID") {
      summary.paidAmount += amount;
      summary.paidCount += 1;
    } else if (row.status === "CANCELED") {
      summary.canceledAmount += amount;
      summary.canceledCount += 1;
    }
  }

  summary.totalAmount = round2(summary.totalAmount);
  summary.pendingAmount = round2(summary.pendingAmount);
  summary.invoicedAmount = round2(summary.invoicedAmount);
  summary.paidAmount = round2(summary.paidAmount);
  summary.canceledAmount = round2(summary.canceledAmount);
  summary.receivableAmount = round2(summary.pendingAmount + summary.invoicedAmount);
  return summary;
}
