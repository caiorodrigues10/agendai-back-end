import { describe, expect, it } from "vitest";
import { summarizeSuccessFees } from "./successFeeReport";

describe("summarizeSuccessFees", () => {
  it("separa valores por situação e não soma cancelados como a receber", () => {
    const summary = summarizeSuccessFees([
      { status: "PENDING", amount: 1000 },
      { status: "INVOICED", amount: 2500.5 },
      { status: "PAID", amount: 4000 },
      { status: "CANCELED", amount: 999 },
      { status: "PENDING", amount: null },
    ]);

    expect(summary.totalAmount).toBe(8499.5);
    expect(summary.totalCount).toBe(5);
    expect(summary.pendingAmount).toBe(1000);
    expect(summary.pendingCount).toBe(2);
    expect(summary.invoicedAmount).toBe(2500.5);
    expect(summary.paidAmount).toBe(4000);
    expect(summary.canceledAmount).toBe(999);
    expect(summary.receivableAmount).toBe(3500.5);
  });
});
