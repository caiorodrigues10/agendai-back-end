import { normalizeText } from "../dateParser";

/**
 * Extração de entidades da mensagem do dono.
 *
 * Determinístico: valores em R$, nomes de clientes/profissionais/serviços e
 * o "assunto" livre da frase. Nada aqui consulta o banco — a resolução
 * (fuzzy de nome, serviço, profissional) acontece nos handlers, que usam os
 * use cases do app.
 */

const WORD_NUMBERS: Record<string, number> = {
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  cento: 100,
  duzentos: 200,
  duzentas: 200,
  trezentos: 300,
  trezentas: 300,
  quatrocentos: 400,
  quatrocentas: 400,
  quinhentos: 500,
  quinhentas: 500,
  seiscentos: 600,
  seiscentas: 600,
  setecentos: 700,
  setecentas: 700,
  oitocentos: 800,
  oitocentas: 800,
  novecentos: 900,
  novecentas: 900,
  mil: 1000,
};

/**
 * Valor monetário em R$ no texto do dono.
 *
 * Aceita: "r$ 80", "80 reais", "80,50", "1.500", "1,5k", "1,5 mil",
 * "oitenta" (até mil por extenso) e número puro ("gastei 80 de produto").
 */
export function extractOwnerBotAmount(raw: string): number | undefined {
  const text = normalizeText(raw).replace(/\s+/g, " ");
  if (!text) return undefined;

  const withSymbol = text.match(/(?:r\$|rs\$?)\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/);
  if (withSymbol) return parseAmount(withSymbol[1]);

  const withReais = text.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:reais|real)/);
  if (withReais) return parseAmount(withReais[1]);

  const withK = text.match(/(\d+(?:[.,]\d+)?)\s*(k|mil)\b/);
  if (withK) {
    const base = parseAmount(withK[1]) ?? 0;
    return Math.round(base * 1000 * 100) / 100;
  }

  const words = Object.keys(WORD_NUMBERS)
    .sort((a, b) => b.length - a.length)
    .find((word) => new RegExp(`\\b${word}\\b`).test(text));
  if (words) {
    const value = WORD_NUMBERS[words];
    // "cento e vinte" = 120
    const compound = text.match(/\bcento e (vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa)\b/);
    if (compound) {
      return 100 + (WORD_NUMBERS[compound[1]] ?? 0);
    }
    return value;
  }

  // Número solto ("gastei 80 de produto", "paguei 45"). Só depois dos
  // prefixos explícitos para não capturar anos ou horários por engano.
  const bare = text.match(/\b(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\b/);
  if (bare) {
    const parsed = parseAmount(bare[1]);
    if (parsed !== undefined && parsed > 0) return parsed;
  }

  return undefined;
}

function parseAmount(rawValue: string): number | undefined {
  let value = rawValue.trim();
  if (!value) return undefined;
  // "1.500,00" (pt-BR) vs "1,500.00" (inglês)
  if (/,\d{1,2}$/.test(value)) {
    value = value.replace(/\./g, "").replace(",", ".");
  } else if (/\.\d{3}(?:\.\d{3})*$/.test(value)) {
    value = value.replace(/,/g, "").replace(/\./g, "");
  } else {
    value = value.replace(",", ".");
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Nome citado pelo dono ("quem é a maria", "do pedro", "da ana").
 * Devolve o nome em caixa alta, como está no cadastro.
 */
export function extractOwnerBotPersonName(raw: string): string | undefined {
  const text = normalizeText(raw);
  const patterns = [
    /\b(?:quem e|qual e|sobre)\s+(?:o|a|ao|da|do)?\s*([a-z][a-z\s]{1,40}?)(?:\s+(?:hoje|ontem|amanha| esse| essa| esse| esse))?$/,
    /\b(?:do|da|de|para|pra)\s+([a-z][a-z\s]{1,40}?)(?:\s+(?:hoje|ontem|amanha))?$/,
    /\bcliente\s+([a-z][a-z\s]{1,40}?)(?:\s+(?:hoje|ontem|amanha))?$/,
    /\b([a-z]+(?:\s+[a-z]+)?)\s+(?:veio|falou|pagou|quer|cancelou|agendou)\b/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const name = match[1].trim().replace(/\s+/g, " ");
      if (name && name.length >= 2 && !isStopWord(name)) return name;
    }
  }
  return undefined;
}

/** Nome de serviço citado ("corte + barba", "o serviço tintura"). */
export function extractOwnerBotServiceName(raw: string): string | undefined {
  const text = normalizeText(raw);
  const match = text.match(/\b(?:servico|atendimento|procedimento|sessao|ordem de servico|os)\s+(?:de\s+|do\s+|da\s+)?([a-z0-9\s+]{2,40}?)(?:\s+(?:hoje|ontem|amanha|por|para))?$/);
  if (match) {
    const name = match[1].trim().replace(/\s+/g, " ");
    if (name && !isStopWord(name)) return name;
  }
  return undefined;
}

const STOP_WORDS = new Set([
  "hoje",
  "ontem",
  "amanha",
  "agora",
  "por",
  "para",
  "com",
  "sem",
  "meu",
  "minha",
  "nos",
  "nas",
  "ele",
  "ela",
  "elea",
  "gente",
  "todos",
  "todas",
  "aqui",
  "la",
]);

function isStopWord(value: string): boolean {
  return STOP_WORDS.has(value.trim());
}

/**
 * Telefone citado pelo dono (11 dígitos, com ou sem +55).
 */
export function extractOwnerBotPhone(raw: string): string | undefined {
  const text = normalizeText(raw);
  const match = text.match(/(?:\+?55\s*)?(\d{2}\s*\d{4,5}[-\s]?\d{4})/);
  if (!match) return undefined;
  const digits = match[1].replace(/\D/g, "");
  if (digits.length === 11) return `55${digits}`;
  if (digits.length === 10) return `55${digits}`;
  return undefined;
}

/**
 * "Assunto" livre: a mensagem sem a parte já consumida pelo gatilho.
 * Serve para descrever o pedido ("produto", "clientes sumidos").
 */
export function extractOwnerBotSubject(raw: string): string {
  return normalizeText(raw).replace(/\s+/g, " ").trim();
}

/** Normaliza texto (sem acentos, minúsculo) — reexportado para o matcher. */
export { normalizeText };
