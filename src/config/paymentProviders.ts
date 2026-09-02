import { AppError } from "@/shared/errors/AppError";

export type EnabledPaymentProvider = "ASAAS" | "MERCADOPAGO" | "ABACATEPAY";

export function enabledPaymentProviders(): Set<EnabledPaymentProvider> {
  const configured = process.env.PAYMENT_PROVIDERS_ENABLED;
  const fallback = process.env.NODE_ENV === "production"
    ? ["ASAAS"]
    : ["ASAAS", "MERCADOPAGO", "ABACATEPAY"];
  const values = configured
    ? configured.split(",").map((value) => value.trim().toUpperCase()).filter(Boolean)
    : fallback;
  return new Set(values as EnabledPaymentProvider[]);
}

export function assertPaymentProviderEnabled(paymentMethod: string): void {
  const provider: EnabledPaymentProvider =
    paymentMethod === "asaas"
      ? "ASAAS"
      : paymentMethod === "payment_link"
        ? "ABACATEPAY"
        : "MERCADOPAGO";

  if (!enabledPaymentProviders().has(provider)) {
    throw new AppError("Este meio de pagamento não está disponível no momento.", 409, undefined, "PAYMENT_PROVIDER_DISABLED");
  }
}

