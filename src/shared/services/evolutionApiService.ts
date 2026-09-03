/**
 * Envio e pairing de WhatsApp via Evolution API (self-hosted).
 * @see https://doc.evolution-api.com/v2/api-reference/message-controller/send-text
 *
 * Env:
 *   EVOLUTION_API_URL         — base URL (ex.: https://evolution-api-s6ym.onrender.com)
 *   EVOLUTION_API_KEY         — API key global (header apikey)
 *   EVOLUTION_INSTANCE_NAME   — só mensagens da plataforma (contato / indicação)
 *
 * Envios de tenant exigem instanceName da barbearia (sem fallback global).
 */

import { AppError } from "@/shared/errors/AppError";
import { evolutionNotConfiguredError } from "@/modules/barbershops/utils/shopEvolutionInstance";

export function normalizeWhatsAppPhone(phone: string): string {
  const clean = phone.replace(/\D/g, "");
  if (!clean) return "";
  if (clean.length <= 11) return `55${clean}`;
  return clean;
}

function evolutionBaseUrl(): string | undefined {
  return process.env.EVOLUTION_API_URL?.trim()?.replace(/\/+$/, "") || undefined;
}

function evolutionApiKey(): string | undefined {
  return process.env.EVOLUTION_API_KEY?.trim() || undefined;
}

/** Servidor Evolution acessível (URL + chave). Instância por salão é outro passo. */
export function isEvolutionServerConfigured(): boolean {
  return Boolean(evolutionBaseUrl() && evolutionApiKey());
}

function isEvolutionConfigured(): boolean {
  return isEvolutionServerConfigured();
}

function requireEvolutionServer(): { baseUrl: string; apiKey: string } {
  const baseUrl = evolutionBaseUrl();
  const apiKey = evolutionApiKey();
  if (!baseUrl || !apiKey) throw evolutionNotConfiguredError();
  return { baseUrl, apiKey };
}

export type WhatsAppLogger = {
  info: (obj: object, msg?: string) => void;
  warn: (obj: object, msg?: string) => void;
};

export interface SendWhatsAppOptions {
  /**
   * Instância Evolution do salão. Obrigatória em envios de tenant.
   * Com `platform: true`, se vazia cai em `EVOLUTION_INSTANCE_NAME`.
   */
  instanceName?: string | null;
  /**
   * Mensagem da plataforma (contato, indicação). Pode usar a instância global da env.
   */
  platform?: boolean;
  log?: WhatsAppLogger;
}

export interface WhatsAppSendResult {
  ok: boolean;
  providerId?: string;
  providerStatus?: string;
  httpStatus?: number;
  errorCode?: string;
  error?: string;
}

function resolveInstanceName(opts: SendWhatsAppOptions): string | undefined {
  const explicit = opts.instanceName?.trim() || undefined;
  if (opts.platform) {
    return explicit || process.env.EVOLUTION_INSTANCE_NAME?.trim() || undefined;
  }
  return explicit;
}

function extractMessageId(payload: unknown): string | undefined {
  const root = asRecord(payload);
  const key = asRecord(root?.key);
  const candidate = key?.id ?? root?.id ?? root?.messageId;
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim().slice(0, 160)
    : undefined;
}

export async function sendWhatsAppMessageDetailed(
  phone: string,
  message: string,
  options: string | SendWhatsAppOptions | undefined = undefined
): Promise<WhatsAppSendResult> {
  const opts: SendWhatsAppOptions =
    typeof options === "string" || options === null || options === undefined
      ? options === null || options === undefined
        ? {}
        : { instanceName: options }
      : options;

  const log = opts.log;
  const finalPhone = normalizeWhatsAppPhone(phone);
  if (!finalPhone || !message.trim()) {
    log?.warn({}, "WhatsApp: telefone ou mensagem inválidos");
    return { ok: false, errorCode: "INVALID_DESTINATION", error: "Telefone ou mensagem inválidos" };
  }

  const baseUrl = evolutionBaseUrl();
  const apiKey = evolutionApiKey();
  const instanceName = resolveInstanceName(opts);

  if (!baseUrl || !apiKey || !instanceName) {
    log?.warn(
      { platform: Boolean(opts.platform) },
      "WhatsApp não enviado: Evolution sem URL/chave ou sem instância do salão"
    );
    return { ok: false, errorCode: "CHANNEL_NOT_CONFIGURED", error: "Evolution ou instância não configurada" };
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
      log?.warn(
        { status: res.status },
        "Falha ao enviar WhatsApp via Evolution API"
      );
      return {
        ok: false,
        httpStatus: res.status,
        errorCode: `EVOLUTION_HTTP_${res.status}`,
        error: "Evolution API rejeitou a mensagem",
      };
    }

    const body = typeof res.json === "function"
      ? await res.json().catch(() => null)
      : typeof res.text === "function"
        ? await res.text().catch(() => null)
        : null;
    log?.info({}, "WhatsApp aceito pela Evolution API");
    return {
      ok: true,
      providerId: extractMessageId(body),
      providerStatus: "accepted",
      httpStatus: res.status,
    };
  } catch (err) {
    log?.warn({ err }, "Erro ao enviar WhatsApp via Evolution API");
    return { ok: false, errorCode: "EVOLUTION_UNAVAILABLE", error: "Evolution API indisponível" };
  }
}

export async function sendWhatsAppMessage(
  phone: string,
  message: string,
  options: string | SendWhatsAppOptions | undefined = undefined,
): Promise<boolean> {
  return (await sendWhatsAppMessageDetailed(phone, message, options)).ok;
}

export async function sendWhatsAppMedia(
  phone: string,
  imageBase64: string,
  caption: string,
  options: string | SendWhatsAppOptions | undefined = undefined
): Promise<boolean> {
  const opts: SendWhatsAppOptions =
    typeof options === "string" || options === null || options === undefined
      ? options === null || options === undefined
        ? {}
        : { instanceName: options }
      : options;

  const log = opts.log;
  const finalPhone = normalizeWhatsAppPhone(phone);
  if (!finalPhone || !imageBase64.trim()) {
    log?.warn({ phone }, "WhatsApp media: telefone ou imagem inválidos");
    return false;
  }

  const baseUrl = evolutionBaseUrl();
  const apiKey = evolutionApiKey();
  const instanceName = resolveInstanceName(opts);

  if (!baseUrl || !apiKey || !instanceName) {
    log?.warn(
      { phone: finalPhone },
      "Mídia WhatsApp não enviada: sem URL/chave ou sem instância do salão"
    );
    return false;
  }

  const url = `${baseUrl}/message/sendMedia/${encodeURIComponent(instanceName)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: finalPhone,
        mediatype: "image",
        mimetype: "image/png",
        media: imageBase64,
        caption,
      }),
    });

    if (!res.ok) {
      log?.warn(
        { status: res.status },
        "Falha ao enviar mídia via Evolution API"
      );
      return false;
    }

    log?.info({}, "Mídia enviada via Evolution API");
    return true;
  } catch (err) {
    log?.warn({ err }, "Erro ao enviar mídia via Evolution API");
    return false;
  }
}

export function isWhatsAppGatewayConfigured(): boolean {
  return isEvolutionConfigured();
}

export type EvolutionConnectionState = "open" | "connecting" | "close";

async function evolutionRequest(
  path: string,
  init: RequestInit = {}
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const { baseUrl, apiKey } = requireEvolutionServer();
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
      ...(init.headers as Record<string, string> | undefined),
    },
    signal: init.signal ?? AbortSignal.timeout(10_000),
  });
  const text = await res.text().catch(() => "");
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }
  return { ok: res.ok, status: res.status, json };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function extractQrBase64(payload: unknown): string | null {
  const root = asRecord(payload);
  if (!root) return null;
  const qr = asRecord(root.qrcode);
  const candidates = [qr?.base64, root.base64, qr?.code, root.code];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) {
      const v = c.trim();
      return v.startsWith("data:") ? v : `data:image/png;base64,${v}`;
    }
  }
  return null;
}

export function extractPairingCode(payload: unknown): string | null {
  const roots: Array<Record<string, unknown>> = [];
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const record = asRecord(item);
      if (record) roots.push(record);
    }
  } else {
    const root = asRecord(payload);
    if (root) roots.push(root);
  }

  for (const root of roots) {
    const nested = asRecord(root.qrcode);
    const candidates = [
      root.pairingCode,
      root.pairing_code,
      nested?.pairingCode,
      nested?.pairing_code,
    ];
    for (const candidate of candidates) {
      if (typeof candidate !== "string") continue;
      // Ex.: "ABCD-EFGH" ou "WZYEH1YY" — nunca o token Baileys "2@..."
      const normalized = candidate.trim().replace(/\s+/g, "");
      if (/^[A-Za-z0-9-]{6,16}$/.test(normalized) && !normalized.includes("@")) {
        return normalized.toUpperCase();
      }
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pairing code exige instância em `close`. Logout sozinho deixa a Evolution
 * em loop de ChannelStartup (como nos logs LOGOUT/REMOVED). Por isso:
 * delete → create (sem QR) → connect?number= → poll do pairingCode.
 */
export async function startEvolutionPairingCode(
  instanceName: string,
  phoneNumber: string
): Promise<string | null> {
  await deleteEvolutionInstance(instanceName).catch(() => undefined);
  await sleep(1_500);

  await createEvolutionInstance(instanceName, {
    qrcode: false,
    number: phoneNumber,
  });
  await sleep(2_000);

  // Espera estabilizar em close (create sem qrcode não deve ir para connecting)
  for (let i = 0; i < 6; i++) {
    const state = await fetchEvolutionConnectionState(instanceName);
    if (state === "open") return null;
    if (state === "close") break;
    if (state === "connecting") {
      // Sessão antiga ainda presa: wipe e recria uma vez
      await deleteEvolutionInstance(instanceName).catch(() => undefined);
      await sleep(1_500);
      await createEvolutionInstance(instanceName, {
        qrcode: false,
        number: phoneNumber,
      });
      await sleep(2_000);
      break;
    }
    await sleep(1_000);
  }

  const path = `/instance/connect/${encodeURIComponent(instanceName)}?number=${encodeURIComponent(phoneNumber)}`;

  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await evolutionRequest(path, {
      signal: AbortSignal.timeout(25_000),
    });
    if (res.ok) {
      const code = extractPairingCode(res.json);
      if (code) return code;
    }
    await sleep(2_000);
  }

  return null;
}

/** @deprecated Prefer startEvolutionPairingCode — mantido para testes legados. */
export async function fetchEvolutionPairingCode(
  instanceName: string,
  phoneNumber: string
): Promise<string | null> {
  return startEvolutionPairingCode(instanceName, phoneNumber);
}

export function extractConnectionState(payload: unknown): EvolutionConnectionState {
  const root = asRecord(payload);
  const instance = asRecord(root?.instance);
  const raw = String(instance?.state ?? root?.state ?? "close").toLowerCase();
  if (raw === "open") return "open";
  if (raw === "connecting") return "connecting";
  return "close";
}

export async function createEvolutionInstance(
  instanceName: string,
  options?: { qrcode?: boolean; number?: string }
): Promise<unknown> {
  const body: Record<string, unknown> = {
    instanceName,
    qrcode: options?.qrcode ?? true,
    integration: "WHATSAPP-BAILEYS",
  };
  if (options?.number) body.number = options.number;

  const res = await evolutionRequest("/instance/create", {
    method: "POST",
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  if (res.ok || res.status === 403 || res.status === 409) return res.json;
  throw new AppError("Não foi possível criar a sessão de WhatsApp. Tente de novo.", 502);
}

export async function fetchEvolutionQr(instanceName: string): Promise<string | null> {
  const res = await evolutionRequest(`/instance/connect/${encodeURIComponent(instanceName)}`);
  if (!res.ok) return null;
  return extractQrBase64(res.json);
}

export async function fetchEvolutionConnectionState(
  instanceName: string
): Promise<EvolutionConnectionState> {
  const res = await evolutionRequest(
    `/instance/connectionState/${encodeURIComponent(instanceName)}`
  );
  if (!res.ok) return "close";
  return extractConnectionState(res.json);
}

export async function logoutEvolutionInstance(instanceName: string): Promise<void> {
  await evolutionRequest(`/instance/logout/${encodeURIComponent(instanceName)}`, {
    method: "DELETE",
  });
}

export async function deleteEvolutionInstance(instanceName: string): Promise<void> {
  await evolutionRequest(`/instance/delete/${encodeURIComponent(instanceName)}`, {
    method: "DELETE",
  });
}
