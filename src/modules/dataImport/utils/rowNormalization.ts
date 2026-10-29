/**
 * Normalização dos valores vindos da planilha.
 *
 * Tudo entra como texto (a planilha não sabe o tipo da coluna). Aqui o texto
 * vira data, hora, telefone ou valor no formato que o sistema usa. Quando não
 * dá para converter, a função devolve `null` e a linha é rejeitada na
 * validação — nunca entra dado pela metade.
 */
import { salonClientWhatsappKey } from "@/modules/clients/utils/ensureSalonClient";

/** Excel conta os dias a partir de 30/12/1899 (bug histórico do Excel). */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const EXCEL_MAX_SERIAL = 60_000;

/**
 * Converte o texto da planilha em `YYYY-MM-DD`.
 * Aceita `dd/mm/aaaa`, `dd-mm-aa`, `aaaa-mm-dd`, ISO e serial do Excel.
 */
export function normalizeDate(value: string): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;

  // Serial do Excel (número puro entre 1 e 60000).
  if (/^\d{1,5}(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial > 0 && serial <= EXCEL_MAX_SERIAL) {
      const date = new Date(EXCEL_EPOCH_MS + Math.round(serial * 86_400_000));
      return toIsoDate(date);
    }
  }

  // aaaa-mm-dd (com ou sem hora).
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ]|$)/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    if (isValidDateParts(Number(year), Number(month), Number(day))) {
      return `${year}-${month}-${day}`;
    }
    return null;
  }

  // dd/mm/aaaa ou dd-mm-aa.
  const brMatch = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (brMatch) {
    const day = Number(brMatch[1]);
    const month = Number(brMatch[2]);
    let year = Number(brMatch[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    if (!isValidDateParts(year, month, day)) return null;
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // ISO completo (2026-10-29T13:00:00.000Z).
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return toIsoDate(parsed);
  }

  return null;
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  if (year < 1900 || year > 2200) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function toIsoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;
}

/**
 * Converte o texto da planilha em `HH:mm`.
 * Aceita `14:30`, `14h30`, `14:30:00` e fração de dia do Excel.
 */
export function normalizeTime(value: string): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;

  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(text)) {
    const [hours, minutes] = text.split(":");
    const hour = Number(hours);
    const minute = Number(minutes);
    if (!isValidTime(hour, minute)) return null;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  const hMatch = text.match(/^(\d{1,2})\s*h(?:ora)?\s*(\d{1,2})?$/i);
  if (hMatch) {
    const hour = Number(hMatch[1]);
    const minute = Number(hMatch[2] ?? 0);
    if (!isValidTime(hour, minute)) return null;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  // Fração de dia do Excel (0.5 = 12:00).
  if (/^\d+([.,]\d+)?$/.test(text)) {
    const fraction = Number(text.replace(",", "."));
    if (fraction > 0 && fraction < 1) {
      const totalMinutes = Math.round(fraction * 24 * 60);
      const hour = Math.floor(totalMinutes / 60) % 24;
      const minute = totalMinutes % 60;
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }

  return null;
}

function isValidTime(hour: number, minute: number): boolean {
  return Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

/**
 * Telefone em dígitos nacionais (10–11), o formato usado no CRM.
 * Devolve null quando o número não serve como identidade.
 */
export function normalizePhone(value: string): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const digits = text.replace(/\D/g, "");
  if (!digits) return null;
  return salonClientWhatsappKey(digits);
}

/**
 * Valor monetário em número. Aceita `1.234,56`, `1234.56`, `R$ 50,00` e
 * `1234,56`.
 */
export function normalizeMoney(value: string): number | null {
  let text = String(value ?? "").trim();
  if (!text) return null;

  text = text.replace(/r\$\s*/gi, "").replace(/\s/g, "").replace(/%$/, "");

  const hasComma = text.includes(",");
  const hasDot = text.includes(".");

  if (hasComma && hasDot) {
    // O último separador é o decimal.
    const decimalIndex = Math.max(text.lastIndexOf(","), text.lastIndexOf("."));
    const integerPart = text.slice(0, decimalIndex).replace(/[.,]/g, "");
    const decimalPart = text.slice(decimalIndex + 1).replace(/[^0-9]/g, "");
    text = `${integerPart || "0"}.${decimalPart || "0"}`;
  } else if (hasComma) {
    // Vírgula como separador de milhar ("1,234") ou decimal ("50,00").
    const onlyOneComma = text.indexOf(",") === text.lastIndexOf(",");
    const digitsAfter = text.length - text.indexOf(",") - 1;
    text = onlyOneComma && digitsAfter !== 3
      ? text.replace(",", ".")
      : text.replace(/,/g, "");
  } else if (hasDot) {
    const onlyOneDot = text.indexOf(".") === text.lastIndexOf(".");
    const digitsAfter = text.length - text.indexOf(".") - 1;
    if (!onlyOneDot || digitsAfter === 3) text = text.replace(/\./g, "");
  }

  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100) / 100;
}

/** Inteiro não negativo (usado em duração em minutos). */
export function normalizeInteger(value: string): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

/** E-mail válido (verificação simples, sem bloquear domínios válidos). */
export function normalizeEmail(value: string): string | null {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text)) return null;
  return text.slice(0, 200);
}
