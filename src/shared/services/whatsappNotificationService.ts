/**
 * Envio de WhatsApp via Z-API (Fase 1: uma instância da plataforma).
 * @see https://developer.z-api.io/message/send-text
 *
 * Env:
 *   ZAPI_INSTANCE_ID
 *   ZAPI_INSTANCE_TOKEN
 *   ZAPI_CLIENT_TOKEN  — token de segurança da conta (header Client-Token)
 *
 * Se não configurado, só loga e retorna false (fila/agenda seguem normais).
 */

const ZAPI_BASE = "https://api.z-api.io";

export function normalizeWhatsAppPhone(phone: string): string {
  const clean = phone.replace(/\D/g, "");
  if (!clean) return "";
  // BR: 10–11 dígitos (DDD + número) → prefixa 55
  if (clean.length <= 11) return `55${clean}`;
  return clean;
}

function isZApiConfigured(): boolean {
  return Boolean(
    process.env.ZAPI_INSTANCE_ID?.trim() &&
      process.env.ZAPI_INSTANCE_TOKEN?.trim() &&
      process.env.ZAPI_CLIENT_TOKEN?.trim()
  );
}

export async function sendWhatsAppMessage(
  phone: string,
  message: string,
  log?: {
    info: (obj: object, msg?: string) => void;
    warn: (obj: object, msg?: string) => void;
  }
): Promise<boolean> {
  const finalPhone = normalizeWhatsAppPhone(phone);
  if (!finalPhone || !message.trim()) {
    log?.warn({ phone }, "WhatsApp: telefone ou mensagem inválidos");
    return false;
  }

  const instanceId = process.env.ZAPI_INSTANCE_ID?.trim();
  const instanceToken = process.env.ZAPI_INSTANCE_TOKEN?.trim();
  const clientToken = process.env.ZAPI_CLIENT_TOKEN?.trim();

  if (!instanceId || !instanceToken || !clientToken) {
    log?.warn(
      { phone: finalPhone },
      "Z-API não configurado (ZAPI_INSTANCE_ID / ZAPI_INSTANCE_TOKEN / ZAPI_CLIENT_TOKEN) — mensagem não enviada"
    );
    return false;
  }

  const url = `${ZAPI_BASE}/instances/${encodeURIComponent(instanceId)}/token/${encodeURIComponent(instanceToken)}/send-text`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": clientToken,
      },
      body: JSON.stringify({ phone: finalPhone, message }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      log?.warn(
        { status: res.status, phone: finalPhone, body: body.slice(0, 300) },
        "Falha ao enviar WhatsApp via Z-API"
      );
      return false;
    }

    log?.info({ phone: finalPhone }, "WhatsApp enviado via Z-API");
    return true;
  } catch (err) {
    log?.warn({ err, phone: finalPhone }, "Erro ao enviar WhatsApp via Z-API");
    return false;
  }
}

/** Expõe se o gateway está pronto (útil para health/settings no futuro). */
export function isWhatsAppGatewayConfigured(): boolean {
  return isZApiConfigured();
}
