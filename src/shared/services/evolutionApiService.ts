/**
 * Envio de WhatsApp via Evolution API (self-hosted).
 * @see https://doc.evolution-api.com/v2/api-reference/message-controller/send-text
 *
 * Env:
 *   EVOLUTION_API_URL         — base URL (ex.: http://localhost:8080)
 *   EVOLUTION_API_KEY         — API key global/instância (header apikey)
 *   EVOLUTION_INSTANCE_NAME   — nome da instância WhatsApp conectada
 *
 * Se não configurado, só loga e retorna false (fila/agenda seguem normais).
 */

export function normalizeWhatsAppPhone(phone: string): string {
  const clean = phone.replace(/\D/g, "");
  if (!clean) return "";
  // BR: 10–11 dígitos (DDD + número) → prefixa 55
  if (clean.length <= 11) return `55${clean}`;
  return clean;
}

function isEvolutionConfigured(): boolean {
  return Boolean(
    process.env.EVOLUTION_API_URL?.trim() &&
      process.env.EVOLUTION_API_KEY?.trim() &&
      process.env.EVOLUTION_INSTANCE_NAME?.trim()
  );
}

/**
 * Logger opcional usado para emitir diagnósticos estruturados durante o envio.
 * Aceita o formato de logger do Fastify (`request.log`).
 */
export type WhatsAppLogger = {
  info: (obj: object, msg?: string) => void;
  warn: (obj: object, msg?: string) => void;
};

export interface SendWhatsAppOptions {
  /**
   * Nome da instância da Evolution API a usar para este envio.
   * Se vazio/ausente, cai no fallback da env var `EVOLUTION_INSTANCE_NAME`
   * (instância global do servidor da Evolution API).
   */
  instanceName?: string | null;
  /** Logger opcional para diagnóstico estruturado. */
  log?: WhatsAppLogger;
}

export async function sendWhatsAppMessage(
  phone: string,
  message: string,
  options: string | SendWhatsAppOptions | undefined = undefined
): Promise<boolean> {
  // Compat: aceitar 3º parâmetro posicional legado (logger) como string/null.
  // O comportamento novo usa um objeto de opções: { instanceName?, log? }.
  const opts: SendWhatsAppOptions =
    typeof options === "string" || options === null || options === undefined
      ? options === null || options === undefined
        ? {}
        : { instanceName: options }
      : options;

  const log = opts.log;
  const finalPhone = normalizeWhatsAppPhone(phone);
  if (!finalPhone || !message.trim()) {
    log?.warn({ phone }, "WhatsApp: telefone ou mensagem inválidos");
    return false;
  }

  const baseUrl = process.env.EVOLUTION_API_URL?.trim()?.replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY?.trim();
  const instanceName =
    opts.instanceName?.trim() || process.env.EVOLUTION_INSTANCE_NAME?.trim();

  if (!baseUrl || !apiKey || !instanceName) {
    log?.warn(
      { phone: finalPhone },
      "Evolution API não configurada (EVOLUTION_API_URL / EVOLUTION_API_KEY / EVOLUTION_INSTANCE_NAME) — mensagem não enviada"
    );
    return false;
  }

  const url = `${baseUrl}/message/sendText/${encodeURIComponent(instanceName)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({ number: finalPhone, text: message }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      log?.warn(
        { status: res.status, phone: finalPhone, body: body.slice(0, 300) },
        "Falha ao enviar WhatsApp via Evolution API"
      );
      return false;
    }

    log?.info({ phone: finalPhone }, "WhatsApp enviado via Evolution API");
    return true;
  } catch (err) {
    log?.warn(
      { err, phone: finalPhone },
      "Erro ao enviar WhatsApp via Evolution API"
    );
    return false;
  }
}

/** Expõe se o gateway está pronto (útil para health/settings no futuro). */
export function isWhatsAppGatewayConfigured(): boolean {
  return isEvolutionConfigured();
}
