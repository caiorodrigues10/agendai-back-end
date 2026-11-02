import { timingSafeEqual } from "node:crypto";
import { normalizeWhatsAppPhone } from "@/shared/services/evolutionApiService";

/**
 * Leitura do webhook de entrada da Evolution API (`messages.upsert`).
 *
 * Compartilhado entre o assistente do dono e o atendente de IA: o formato do
 * corpo muda entre versões da Evolution, então a leitura é tolerante — o que
 * interessa é o `key.id` (idempotência), o `remoteJid` (número), o texto e o
 * nome da instância.
 */

export type EvolutionMediaInfo = {
  type: "image" | "document" | "audio" | "video";
  mimetype?: string;
  fileName?: string;
  caption?: string;
  fileLength?: number;
};

export type EvolutionWebhookEvent =
  | {
      type: "INBOUND_MESSAGE";
      messageId: string;
      phone: string;
      text: string;
      instanceName?: string;
      remoteJid?: string;
      media?: EvolutionMediaInfo;
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
function detectMedia(message: Record<string, unknown> | null): EvolutionMediaInfo | undefined {
  if (!message) return undefined;
  const mediaKeys: Array<{ key: string; type: EvolutionMediaInfo["type"] }> = [
    { key: "imageMessage", type: "image" },
    { key: "documentMessage", type: "document" },
    { key: "audioMessage", type: "audio" },
    { key: "videoMessage", type: "video" },
  ];
  for (const { key, type } of mediaKeys) {
    const media = asRecord(message[key]);
    if (!media) continue;
    return {
      type,
      mimetype: (typeof media.mimetype === "string" && media.mimetype) || undefined,
      fileName: (typeof media.fileName === "string" && media.fileName) || (typeof media.filename === "string" && media.filename) || undefined,
      caption: (typeof media.caption === "string" && media.caption) || undefined,
      fileLength: (typeof media.fileLength === "number" && media.fileLength) || (typeof media.filelength === "number" && media.filelength) || undefined,
    };
  }
  return undefined;
}

export function parseEvolutionWebhook(payload: unknown): EvolutionWebhookEvent {
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

  // Grupo e difusão não são conversa de cliente: o número do remetente não
  // identifica ninguém e o bot não deve responder em grupo.
  if (remoteJid.endsWith("@g.us") || remoteJid.endsWith("@broadcast")) {
    return { type: "IGNORED", reason: "mensagem de grupo ou difusão" };
  }

  const phone = normalizeWhatsAppPhone(remoteJid.split("@")[0] ?? "");
  if (!phone) return { type: "IGNORED", reason: "número inválido" };

  const messageId = readString(key.id) ?? readString(data.messageId);
  if (!messageId) return { type: "IGNORED", reason: "sem id da mensagem" };

  const messageRecord = asRecord(data.message);
  const text = extractMessageText(messageRecord);
  const media = detectMedia(messageRecord);

  if (!text && !media) return { type: "IGNORED", reason: "mensagem sem texto" };

  const base: EvolutionWebhookEvent = {
    type: "INBOUND_MESSAGE",
    messageId,
    phone,
    text: text ?? "",
    instanceName,
    remoteJid,
  };
  if (media) (base as { media?: EvolutionMediaInfo }).media = media;
  return base;
}

/** Comparação em tempo constante do segredo do webhook. */
export function verifyWebhookSecret(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
