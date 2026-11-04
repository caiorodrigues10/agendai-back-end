/**
 * Gate de falso confiante para importação por imagem.
 *
 * Critério central do benchmark: uma célula pode estar *errada* mas ainda
 * *passar* nos normalizadores de produção (normalizePhone, normalizeMoney,
 * DV do CNJ, FEE_STATUS_MAP) — então entraria no CRM como se estivesse certa.
 * Células críticas com confiança baixa são marcadas "revisar" e a importação
 * por imagem nunca grava direto: sempre passa por tela de revisão.
 */
import {
  normalizePhone,
  normalizeMoney,
} from "../utils/rowNormalization";
import { salonClientWhatsappKey } from "@/modules/clients/utils/ensureSalonClient";
import { parseCaseStatus } from "../processors/caseImporter";
import { parseFeeStatus } from "../processors/caseFeeImporter";
import type { OcrCellResult } from "./ocrExtractor";

/** Limiar abaixo do qual a confiança do OCR dispara revisão (0-100). */
export const OCR_REVIEW_CONFIDENCE = 80;

/** Campos considerados críticos: erro silencioso neles é falso confiante. */
export const OCR_CRITICAL_FIELDS: string[] = [
  "whatsapp",
  "clientWhatsapp",
  "salePrice",
  "costPrice",
  "originalAmount",
  "paidAmount",
  "caseNumber",
  "percent",
  "feeStatus",
  "caseStatus",
  "status",
];

/** Resultado do gate para uma célula. */
export interface OcrGateVerdict {
  revisar: boolean;
  motivo: string | null;
  /** Se passou nos normalizadores mas com confiança baixa (falso confiante potencial). */
  falsoConfiantePotencial: boolean;
}

/** Verifica se um valor de telefone passa no normalizador. */
function telefoneValido(valor: string): boolean {
  return normalizePhone(valor) !== null;
}

/** Verifica se um valor monetário passa no normalizador. */
function dinheiroValido(valor: string): boolean {
  return normalizeMoney(valor) !== null;
}

/** Verifica se um status de caso/horário é reconhecido. */
function statusReconhecido(valor: string): boolean {
  const s = parseCaseStatus(valor);
  if (!s.warning) return true;
  const f = parseFeeStatus(valor);
  return !f.warning;
}

/** Executa o gate em um conjunto de células de uma linha. */
export function gateOcrLinha(
  celulas: OcrCellResult[],
  colunaParaCampo: Map<number, string>,
): Array<{ coluna: number; campo: string; verdict: OcrGateVerdict }> {
  const resultados: Array<{ coluna: number; campo: string; verdict: OcrGateVerdict }> = [];

  for (const c of celulas) {
    const campo = colunaParaCampo.get(c.coluna) ?? `Coluna ${c.coluna + 1}`;
    const texto = c.valor.trim();
    const confianca = c.confianca ?? 0;
    const abaixoDoLimiar = confianca < OCR_REVIEW_CONFIDENCE || confianca === 0;

    let motivo: string | null = null;
    let falsoConfiantePotencial = false;

    // Campo crítico: confiança baixa => sempre revisar.
    if (OCR_CRITICAL_FIELDS.includes(campo) && abaixoDoLimiar) {
      motivo = `Campo crítico "${campo}" lido por OCR com baixa confiança (${confianca}).`;
    }

    // Passou nos normalizadores mas confiança baixa => falso confiante potencial
    // (independente de já haver motivo de campo crítico).
    if (!falsoConfiantePotencial && abaixoDoLimiar && texto) {
      const passouTelefone = telefoneValido(texto);
      const passouDinheiro = dinheiroValido(texto);
      const passouStatus = statusReconhecido(texto);
      if (passouTelefone || passouDinheiro || passouStatus) {
        falsoConfiantePotencial = true;
        if (!motivo) {
          motivo = `Valor "${texto}" parece válido mas confiança do OCR baixa (${confianca}): pode ser falso confiante.`;
        }
      }
    }

    // Sem texto em campo crítico obrigatório.
    if (!motivo && !texto && OCR_CRITICAL_FIELDS.includes(campo)) {
      motivo = `Campo crítico "${campo}" vazio na imagem.`;
    }

    // Número de processo com formato de CNJ impossível: mesmo com confiança
    // alta, o número lido não é um CNJ — o dono precisa conferir.
    if (!motivo && campo === "caseNumber" && texto && casoNumeroSuspeito(texto)) {
      motivo = `Número de processo "${texto}" não parece um CNJ válido: confira na imagem.`;
    }

    resultados.push({
      coluna: c.coluna,
      campo,
      verdict: {
        revisar: !!motivo || falsoConfiantePotencial,
        motivo,
        falsoConfiantePotencial,
      },
    });
  }

  return resultados;
}

/** Verificação rápida de CNJ/DV do caso (sinaliza se o número parece CNJ mal formado). */
export function casoNumeroSuspeito(caseNumber: string): boolean {
  const digits = caseNumber.replace(/\D/g, "");
  // CNJ tem 20 dígitos; menos que isso já é suspeito.
  return digits.length > 0 && digits.length < 15;
}
