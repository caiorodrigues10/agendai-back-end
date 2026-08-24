import { ISubscriptionResponseDTO, IInvoiceResponseDTO } from "../dtos/ISubscriptionDTO";
import { inferBillingCycle } from "./planEconomics";

export function buildSubscriptionResponse(
  record: any,
  barbershopCreatedAt: Date,
  trialDays: number
): ISubscriptionResponseDTO {
  const trialEndsAt = new Date(barbershopCreatedAt);
  trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

  const now = new Date();
  const isInTrial = now <= trialEndsAt;
  const daysRemainingInTrial = isInTrial
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  const latestInvoiceRecord = record.invoices?.[0] ?? null;
  const latestInvoice: IInvoiceResponseDTO | null = latestInvoiceRecord
    ? {
      id: latestInvoiceRecord.id,
      subscriptionId: latestInvoiceRecord.subscriptionId,
      amount: latestInvoiceRecord.amount,
      dueDate: latestInvoiceRecord.dueDate,
      paidAt: latestInvoiceRecord.paidAt,
      status: latestInvoiceRecord.status,
      paymentMethod: latestInvoiceRecord.paymentMethod,
      createdAt: latestInvoiceRecord.createdAt
    }
    : null;

  return {
    id: record.id,
    barbershopId: record.barbershopId,
    planId: record.planId,
    planName: record.plan.name,
    planPrice: record.plan.price,
    planBillingCycle: inferBillingCycle(record.plan),
    planHasDashboard: record.plan.hasDashboard ?? true,
    planTierKey: record.plan.tierKey ?? undefined,
    status: record.status,
    startDate: record.startDate,
    endDate: record.endDate,
    cancelDate: record.cancelDate,
    cancelReason: record.cancelReason ?? null,
    createdAt: record.createdAt,
    trialEndsAt,
    daysRemainingInTrial,
    hasPaymentMethod: Boolean(record.asaasCreditCardToken),
    cardLast4: record.cardLast4 ?? null,
    cardBrand: record.cardBrand ?? null,
    latestInvoice
  };
}