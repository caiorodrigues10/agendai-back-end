/**
 * Métricas do OCR de importação, por campo.
 *
 * Três medidas por célula:
 *   • **acerto exato** — a célula lida é exatamente o texto que estava na
 *     imagem (normalizado só em espaços/caixa);
 *   • **acerto normalizado** — a célula lida vira o **mesmo valor** depois
 *     do normalizador de produção (o que entraria no CRM);
 *   • **falso confiante** — valor **errado** que mesmo assim passa nos
 *     normalizadores de produção **e** foi lido com confiança alta
 *     (>= `OCR_REVIEW_CONFIDENCE`): é o que entraria no CRM como certo.
 */
import { normalizePhone, normalizeMoney, normalizeInteger } from "../utils/rowNormalization";
import { salonClientDisplayName } from "@/modules/clients/utils/ensureSalonClient";
import { OCR_REVIEW_CONFIDENCE } from "./falseConfidenceGate";
import type { OcrSheetResult } from "./ocr.types";
import type { CampoSintetico, TabelaSinteticaDef } from "./ocrImagensSinteticas";

/** Métrica de um campo em uma imagem. */
export interface MetricaCampo {
  campo: CampoSintetico;
  /** Células esperadas (linhas × colunas do campo). */
  total: number;
  acertoExato: number;
  acertoNormalizado: number;
  falsoConfiante: number;
  /** Valor errado que não passou nos normalizadores (nem erro "barato"). */
  erroComum: number;
  /** Soma das confianças das células lidas. */
  somaConfianca: number;
}

/** Métrica de uma imagem (todas as linhas e campos). */
export interface MetricaImagem {
  id: string;
  base: string;
  variante: string;
  campos: Map<CampoSintetico, MetricaCampo>;
  /** Linhas do ground truth que o OCR não leu (nada casou). */
  linhasNaoLidas: number;
}

/** Métrica de uma configuração de pré-processamento. */
export interface MetricaConfig {
  nome: string;
  imagens: MetricaImagem[];
  campos: Map<CampoSintetico, MetricaCampo>;
  acertoExato: number;
  acertoNormalizado: number;
  falsoConfiante: number;
  erroComum: number;
  total: number;
  confiancaMedia: number;
}

/** Chave de comparação textual (espaços colapsados, sem caixa). */
function chaveTexto(valor: string): string {
  return String(valor ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** O valor lido passa no normalizador de produção do campo? */
export function passaNoNormalizador(
  campo: CampoSintetico,
  valor: string,
): boolean {
  switch (campo) {
    case "telefone":
      return normalizePhone(valor) !== null;
    case "valor":
    case "preco":
      return normalizeMoney(valor) !== null;
    case "duracao":
      return normalizeInteger(valor) !== null;
    case "nome":
    case "servico":
      return salonClientDisplayName(valor) !== null;
    default:
      return false;
  }
}

/** O valor lido é o mesmo valor do esperado, depois do normalizador? */
export function igualAfterNormalizador(
  campo: CampoSintetico,
  lido: string,
  esperado: string,
): boolean {
  switch (campo) {
    case "telefone": {
      const a = normalizePhone(lido);
      const b = normalizePhone(esperado);
      return a !== null && b !== null && a === b;
    }
    case "valor":
    case "preco": {
      const a = normalizeMoney(lido);
      const b = normalizeMoney(esperado);
      return a !== null && b !== null && a === b;
    }
    case "duracao": {
      const a = normalizeInteger(lido);
      const b = normalizeInteger(esperado);
      return a !== null && b !== null && a === b;
    }
    case "nome":
    case "servico":
      return chaveTexto(lido) === chaveTexto(esperado);
    default:
      return false;
  }
}

/** Campo vazio na métrica. */
function metricaVazia(campo: CampoSintetico): MetricaCampo {
  return {
    campo,
    total: 0,
    acertoExato: 0,
    acertoNormalizado: 0,
    falsoConfiante: 0,
    erroComum: 0,
    somaConfianca: 0,
  };
}

/**
 * Casa cada linha do ground truth com a linha lida pelo OCR.
 *
 * A linha do ground truth é casada com a linha lida que acerta mais campos
 * (empate resolve pela primeira). Linha sem nenhuma coincidência conta
 * como não lida: os campos dela entram como erro.
 */
function casarLinhas(
  resultado: OcrSheetResult,
  groundTruth: TabelaSinteticaDef,
): Map<number, Map<number, { valor: string; confianca: number }>> {
  const porLinha = new Map<
    number,
    Map<number, { valor: string; confianca: number }>
  >();
  const usados = new Set<number>();

  groundTruth.linhas.forEach((linhaGt, indiceGt) => {
    let melhorIndice = -1;
    let melhorPontos = 0;

    resultado.celulas.forEach((linhaLida, indiceLida) => {
      if (usados.has(indiceLida)) return;
      let pontos = 0;
      for (const coluna of groundTruth.colunas) {
        const esperado = linhaGt[coluna.indice];
        if (esperado === undefined) continue;
        const lida = linhaLida.find((c) => c.coluna === coluna.indice);
        if (!lida) continue;
        if (chaveTexto(lida.valor) === chaveTexto(esperado)) pontos += 1;
      }
      if (pontos > melhorPontos) {
        melhorPontos = pontos;
        melhorIndice = indiceLida;
      }
    });

    if (melhorIndice < 0) return;
    usados.add(melhorIndice);

    const celulas = new Map<number, { valor: string; confianca: number }>();
    for (const coluna of groundTruth.colunas) {
      const lida = resultado.celulas[melhorIndice].find(
        (c) => c.coluna === coluna.indice,
      );
      celulas.set(coluna.indice, {
        valor: lida?.valor ?? "",
        confianca: lida?.confianca ?? 0,
      });
    }
    porLinha.set(indiceGt, celulas);
  });

  return porLinha;
}

/** Avalia uma imagem lida contra o ground truth. */
export function avaliarImagem(
  id: string,
  base: string,
  variante: string,
  resultado: OcrSheetResult,
  groundTruth: TabelaSinteticaDef,
): MetricaImagem {
  const campos = new Map<CampoSintetico, MetricaCampo>();
  for (const coluna of groundTruth.colunas) {
    if (!campos.has(coluna.campo)) campos.set(coluna.campo, metricaVazia(coluna.campo));
  }

  const casamento = casarLinhas(resultado, groundTruth);
  let linhasNaoLidas = 0;

  groundTruth.linhas.forEach((linhaGt, indiceGt) => {
    const celulas = casamento.get(indiceGt);
    if (!celulas) linhasNaoLidas += 1;

    for (const coluna of groundTruth.colunas) {
      const esperado = linhaGt[coluna.indice];
      if (esperado === undefined) continue;
      const metrica = campos.get(coluna.campo)!;
      const lida = celulas?.get(coluna.indice);
      const valor = lida?.valor ?? "";
      const confianca = lida?.confianca ?? 0;

      metrica.total += 1;
      metrica.somaConfianca += confianca;

      if (chaveTexto(valor) === chaveTexto(esperado)) {
        metrica.acertoExato += 1;
        metrica.acertoNormalizado += 1;
        continue;
      }

      if (igualAfterNormalizador(coluna.campo, valor, esperado)) {
        metrica.acertoNormalizado += 1;
      }

      if (passaNoNormalizador(coluna.campo, valor) && confianca >= OCR_REVIEW_CONFIDENCE) {
        metrica.falsoConfiante += 1;
      } else {
        metrica.erroComum += 1;
      }
    }
  });

  return { id, base, variante, campos, linhasNaoLidas };
}

/** Agrega as métricas de várias imagens num total por campo. */
export function agregarCampos(
  imagens: MetricaImagem[],
): Map<CampoSintetico, MetricaCampo> {
  const total = new Map<CampoSintetico, MetricaCampo>();
  for (const imagem of imagens) {
    for (const [campo, metrica] of imagem.campos) {
      const acumulado = total.get(campo) ?? metricaVazia(campo);
      acumulado.total += metrica.total;
      acumulado.acertoExato += metrica.acertoExato;
      acumulado.acertoNormalizado += metrica.acertoNormalizado;
      acumulado.falsoConfiante += metrica.falsoConfiante;
      acumulado.erroComum += metrica.erroComum;
      acumulado.somaConfianca += metrica.somaConfianca;
      total.set(campo, acumulado);
    }
  }
  return total;
}

/** Consolida as métricas de uma configuração. */
export function consolidar(nome: string, imagens: MetricaImagem[]): MetricaConfig {
  const campos = agregarCampos(imagens);
  let acertoExato = 0;
  let acertoNormalizado = 0;
  let falsoConfiante = 0;
  let erroComum = 0;
  let total = 0;
  let somaConfianca = 0;

  for (const metrica of campos.values()) {
    acertoExato += metrica.acertoExato;
    acertoNormalizado += metrica.acertoNormalizado;
    falsoConfiante += metrica.falsoConfiante;
    erroComum += metrica.erroComum;
    total += metrica.total;
    somaConfianca += metrica.somaConfianca;
  }

  return {
    nome,
    imagens,
    campos,
    acertoExato,
    acertoNormalizado,
    falsoConfiante,
    erroComum,
    total,
    confiancaMedia: total > 0 ? somaConfianca / total : 0,
  };
}
