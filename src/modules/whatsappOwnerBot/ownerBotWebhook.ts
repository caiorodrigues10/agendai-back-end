import { timingSafeEqual } from "node:crypto";
import { normalizeWhatsAppPhone } from "@/shared/services/evolutionApiService";

/**
 * Webhook de entrada da Evolution API (instância da plataforma).
 *
 * A Evolution envia `messages.upsert` para toda mensagem recebida. O corpo
 * muda um pouco entre versões, então a leitura é tolerante: o que interessa
 * é o `key.id` (idempotência), o `remoteJid` (número) e o texto.
 */

export type OwnerBotWebhookEvent =
  | {
      type: "INBOUND_MESSAGE";
      messageId: string;
      phone: string;
      text: string;
      instanceName?: string;
    }
  | { type: "IGNORED"; reason: string };

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Extrai o texto da mensagem, qualquer que seja o tipo (texto, legenda de imagem...). */
function extractMessageText(message: Json | null): string | undefined {
  if (!message) return undefined;
  const direct = readString(message.conversation);
  if (direct) return direct;

  const extended = asRecord(message.extendedTextMessage);
  const extendedText = readString(extended?.text);
  if (extendedText) return extendedText;

  for (const key of ["imageMessage", "videoMessage", "documentMessage", "audioMessage"]) {
    const media = asRecord(message[key]);
    const caption = readString(media?.caption);
    if (caption) return caption;
  }

  const button = asRecord(message.buttonsResponseMessage);
  const selected = readString(button?.selectedButtonId) ?? readString(button?.selectedDisplayText);
  if (selected) return selected;

  const list = asRecord(message.listResponseMessage);
  const reply = asRecord(list?.singleSelectReply);
  const single = readString(reply?.selectedRowId);
  if (single) return single;

  return undefined;
}

/** Interpreta o corpo do webhook. Retorna IGNORED quando não é uma mensagem de texto. */
export function parseEvolutionWebhook(payload: unknown): OwnerBotWebhookEvent {
  const root = asRecord(payload);
  if (!root) return { type: "IGNORED", reason: "payload inválido" };

  const instanceName =
    readString(root.instance) ?? readString(root.instanceName) ?? readString(root.instance_id);

  const data = asRecord(root.data) ?? root;
  const key = asRecord(data.key);
  if (!key) return { type: "IGNORED", reason: "sem key" };

  const fromMe = key.fromMe === true || data.fromMe === true;
  if (fromMe) return { type: "IGNORED", reason: "mensagem enviada pela plataforma" };

  const remoteJid = readString(key.remoteJid) ?? readString(data.remoteJid);
  if (!remoteJid) return { type: "IGNORED", reason: "sem remoteJid" };

  const phone = normalizeWhatsAppPhone(remoteJid.split("@")[0] ?? "");
  if (!phone) return { type: "IGNORED", reason: "número inválido" };

  const messageId = readString(key.id) ?? readString(data.messageId);
  if (!messageId) return { type: "IGNORED", reason: "sem id da mensagem" };

  const text = extractMessageText(asRecord(data.message));
  if (!text) return { type: "IGNORED", reason: "mensagem sem texto" };

  return { type: "INBOUND_MESSAGE", messageId, phone, text, instanceName };
}

/** Comparação em tempo constante do segredo do webhook. */
export function verifyWebhookSecret(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** A instância do webhook é a instância da plataforma? */
export function isPlatformInstance(instanceName: string | undefined): boolean {
  const expected = process.env.EVOLUTION_INSTANCE_NAME?.trim();
  if (!expected) return false;
  if (!instanceName) return true;
  return instanceName === expected;
}
