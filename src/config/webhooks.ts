import { enabledPaymentProviders, EnabledPaymentProvider } from "./paymentProviders";

/**
 * Segredos de webhook por provedor e comprimento mínimo exigido.
 * O valor nunca aparece em logs/mensagens — só o nome da variável.
 */
export const WEBHOOK_SECRETS: Record<EnabledPaymentProvider, { name: string; min: number }> = {
  MERCADOPAGO: { name: "MERCADOPAGO_WEBHOOK_SECRET", min: 32 },
  ASAAS: { name: "ASAAS_WEBHOOK_TOKEN", min: 32 },
  ABACATEPAY: { name: "ABACATEPAY_WEBHOOK_SECRET", min: 32 },
};

/**
 * Configuração insegura de webhook em produção (S4). Fora de produção não
 * há restrição — o bypass local continua permitido pelos controllers.
 *
 * Regras em produção:
 * - `ALLOW_INSECURE_WEBHOOKS=true` é sempre recusado (desliga a validação
 *   de assinatura);
 * - provedores habilitados (`PAYMENT_PROVIDERS_ENABLED`) precisam do próprio
 *   segredo de webhook definido e com no mínimo 32 caracteres;
 * - qualquer segredo presente, mesmo de provedor desabilitado, é recusado se
 *   tiver menos de 32 caracteres.
 */
export function validateWebhookConfig(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.NODE_ENV !== "production") return [];

  const errors: string[] = [];

  if (env.ALLOW_INSECURE_WEBHOOKS === "true") {
    errors.push(
      "ALLOW_INSECURE_WEBHOOKS=true em produção — o bypass desliga a validação de assinatura dos webhooks."
    );
  }

  const providers = enabledPaymentProviders(env);
  for (const provider of Object.keys(WEBHOOK_SECRETS) as EnabledPaymentProvider[]) {
    const { name, min } = WEBHOOK_SECRETS[provider];
    const value = env[name]?.trim();

    if (!value) {
      if (providers.has(provider)) {
        errors.push(`${name} ausente em produção (provedor ${provider} habilitado).`);
      }
      continue;
    }

    if (value.length < min) {
      errors.push(`${name} muito curto (${value.length} < ${min} caracteres).`);
    }
  }

  return errors;
}

/** Lança (e recusa o boot) quando a configuração de webhook é insegura. */
export function assertWebhookConfig(env: NodeJS.ProcessEnv = process.env): void {
  const errors = validateWebhookConfig(env);
  if (errors.length === 0) return;

  throw new Error(
    `Configuração de webhook insegura em produção:\n- ${errors.join("\n- ")}`
  );
}
