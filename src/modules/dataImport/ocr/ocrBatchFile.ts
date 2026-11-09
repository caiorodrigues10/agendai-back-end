/**
 * Arquivo do lote de OCR: a tabela lida da imagem e o estado da revisão.
 *
 * A tabela é gravada como CSV — o mesmo formato que o resto do assistente já
 * lê — e a confiança por célula (e o que o dono já revisou) vai num arquivo
 * lateral JSON, ao lado do CSV.
 *
 * Por que um arquivo lateral e não uma coluna no banco: o `ImportBatch` já
 * guarda `filePath`/`mapping` e o esquema do Prisma não precisa mudar
 * (sem migration, sem decisão do dono sobre enum novo).
 */
import { readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { AppError } from "@/shared/errors/AppError";
import { deleteTempFile, saveTempFile } from "../utils/tempFiles";
import type { OcrCellResult, OcrCellState, OcrSidecar } from "./ocr.types";

/** Sufixo do arquivo lateral do lote de OCR. */
export const OCR_SIDECAR_SUFFIX = ".ocr.json";

/** Caminho do arquivo lateral de um CSV de lote. */
export function caminhoSidecarOcr(filePath: string): string {
  return `${filePath}${OCR_SIDECAR_SUFFIX}`;
}

/**
 * Apaga os arquivos do lote: o CSV **e** o arquivo lateral.
 *
 * O `.ocr.json` guarda o valor lido em cada célula (nome, telefone, valor) —
 * é dado do cliente. Ele precisa sumir junto com o CSV, senão fica no disco
 * depois de o lote ser cancelado, concluído ou expirado.
 */
export async function apagarArquivosLote(filePath: string | null | undefined): Promise<void> {
  if (!filePath) return;
  await deleteTempFile(filePath);
  await deleteTempFile(caminhoSidecarOcr(filePath));
}

/**
 * Escrita atômica: grava num arquivo temporário e renomeia.
 *
 * Sem isso, uma leitura concorrente durante a escrita veria um JSON
 * pela metade — e `lerSidecarOcr` devolveria `null`, o que faria o lote
 * perder a revisão por completo.
 */
async function escreverAtomicamente(caminho: string, conteudo: string): Promise<void> {
  const temporario = `${caminho}.${randomUUID()}.tmp`;
  await writeFile(temporario, conteudo, { encoding: "utf8", mode: 0o600 });
  await rename(temporario, caminho);
}

/**
 * Fila por arquivo: as escritas de um mesmo lote acontecem uma de cada vez.
 *
 * Duas correções simultâneas na mesma célula não podem se sobrescrever: a
 * segunda relê o arquivo já com a primeira aplicada.
 *
 * Limite conhecido: o trava é **dentro do processo**. Se a API rodar em
 * mais de uma instância, as duas podem escrever o mesmo lote ao mesmo
 * tempo (a escrita é atômica, então o arquivo não fica corrompido, mas uma
 * correção pode perder a outra).
 */
const filasPorArquivo = new Map<string, Promise<unknown>>();

async function emSequencia<T>(chave: string, tarefa: () => Promise<T>): Promise<T> {
  const anterior = filasPorArquivo.get(chave) ?? Promise.resolve();
  let liberar: () => void = () => undefined;
  const atual = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  const proxima = anterior.then(() => atual, () => atual);
  filasPorArquivo.set(chave, proxima);
  await anterior.catch(() => undefined);
  try {
    return await tarefa();
  } finally {
    liberar();
    if (filasPorArquivo.get(chave) === proxima) filasPorArquivo.delete(chave);
  }
}

/** Escapa um valor para CSV (separador `;`, como o Excel em pt-BR). */
function escaparCsv(valor: string): string {
  const limpo = String(valor ?? "").replace(/\r\n|\r|\n/g, " ");
  return `"${limpo.replace(/"/g, '""')}"`;
}

/** Monta o CSV da tabela lida (cabeçalho + linhas). */
export function montarCsvOcr(headers: string[], celulas: OcrCellState[]): string {
  const porLinha = new Map<number, Map<number, string>>();
  for (const celula of celulas) {
    const linha = porLinha.get(celula.linha) ?? new Map<number, string>();
    linha.set(celula.coluna, celula.valor);
    porLinha.set(celula.linha, linha);
  }

  const linhas: string[] = [headers.map(escaparCsv).join(";")];
  for (const linha of [...porLinha.keys()].sort((a, b) => a - b)) {
    const valores = porLinha.get(linha)!;
    linhas.push(
      headers
        .map((_, coluna) => escaparCsv(valores.get(coluna) ?? ""))
        .join(";"),
    );
  }

  // BOM: o Excel em pt-BR abre o CSV com acentos sem mojibake.
  return `﻿${linhas.join("\r\n")}\r\n`;
}

/** Estado inicial das células a partir do que o OCR leu. */
export function estadosIniciais(celulas: OcrCellResult[][]): OcrCellState[] {
  const estados: OcrCellState[] = [];
  for (const linha of celulas) {
    for (const celula of linha) {
      estados.push({
        linha: celula.linha,
        coluna: celula.coluna,
        confianca: celula.confianca,
        valor: celula.valor,
        aceito: false,
        editado: false,
      });
    }
  }
  return estados;
}

/**
 * Grava o lote de OCR em disco: o CSV da tabela e o arquivo lateral com a
 * confiança por célula.
 */
export async function salvarArquivoLoteOcr(params: {
  headers: string[];
  celulas: OcrCellResult[][];
  larguraTabelaPx: number;
  larguraImagemPx: number;
}): Promise<{ filePath: string; sidecar: OcrSidecar }> {
  const sidecar: OcrSidecar = {
    versao: 1,
    origem: "ocr",
    headers: params.headers,
    larguraTabelaPx: params.larguraTabelaPx,
    larguraImagemPx: params.larguraImagemPx,
    celulas: estadosIniciais(params.celulas),
  };

  const csv = montarCsvOcr(params.headers, sidecar.celulas);
  const filePath = await saveTempFile(Buffer.from(csv, "utf8"), ".csv");
  await writeFile(caminhoSidecarOcr(filePath), JSON.stringify(sidecar), {
    encoding: "utf8",
    mode: 0o600,
  });

  return { filePath, sidecar };
}

/**
 * Lê o arquivo lateral do lote — `null` quando o lote não vem de OCR
 * (planilha) ou quando o arquivo sumiu.
 */
export async function lerSidecarOcr(filePath: string): Promise<OcrSidecar | null> {
  if (!filePath) return null;
  try {
    const bruto = await readFile(caminhoSidecarOcr(filePath), "utf8");
    const dados = JSON.parse(bruto) as OcrSidecar;
    if (!dados || dados.origem !== "ocr" || !Array.isArray(dados.celulas)) {
      return null;
    }
    return dados;
  } catch {
    return null;
  }
}

/**
 * Aplica as edições do dono (valor corrigido e/ou aceite explícito) e
 * reescreve o CSV do lote.
 *
 * O CSV é reescrito a partir do arquivo lateral: é ele que guarda o valor
 * corrigido, a confiança original e o estado da revisão.
 *
 * O arquivo é relido **dentro da fila** do arquivo: assim duas correções
 * simultâneas não se perdem, e a escrita é atômica (nenhum leitor vê um
 * arquivo pela metade).
 */
export async function aplicarEdicaoOcr(params: {
  filePath: string;
  linha: number;
  coluna: number;
  valor?: string;
  aceitar?: boolean;
}): Promise<OcrSidecar> {
  const { filePath, linha, coluna } = params;
  return emSequencia(filePath, async () => {
    const sidecar = await lerSidecarOcr(filePath);
    if (!sidecar) {
      throw new AppError(
        "Este lote não veio de uma imagem: não há células para revisar.",
        400,
      );
    }
    const headers = sidecar.headers;
    const celula = sidecar.celulas.find(
      (c) => c.linha === linha && c.coluna === coluna,
    );
    if (!celula) {
      throw new AppError(
        `A célula linha ${linha}, coluna ${coluna + 1} não existe nesta imagem.`,
        400,
      );
    }

    if (typeof params.valor === "string" && params.valor.trim() !== celula.valor) {
      celula.valor = params.valor.trim();
      celula.editado = true;
      celula.aceito = false;
    }
    if (params.aceitar === true) {
      celula.aceito = true;
    }

    await escreverAtomicamente(
      caminhoSidecarOcr(filePath),
      JSON.stringify(sidecar),
    );
    await escreverAtomicamente(filePath, montarCsvOcr(headers, sidecar.celulas));

    return sidecar;
  });
}

/**
 * Células do OCR por linha, com o valor **atual** (o que o dono corrigiu).
 *
 * A confiança é a original da leitura: corrigir o texto não aumenta a
 * confiança do motor — é por isso que a célula corrigida sai da fila de
 * revisão por decisão do dono, não porque o OCR ficou mais seguro.
 */
export function celulasPorLinha(sidecar: OcrSidecar): Map<number, OcrCellResult[]> {
  const porLinha = new Map<number, OcrCellResult[]>();
  for (const celula of sidecar.celulas) {
    const lista = porLinha.get(celula.linha) ?? [];
    lista.push({
      valor: celula.valor,
      confianca: celula.confianca,
      origem: "ocr",
      linha: celula.linha,
      coluna: celula.coluna,
    });
    porLinha.set(celula.linha, lista);
  }
  for (const lista of porLinha.values()) {
    lista.sort((a, b) => a.coluna - b.coluna);
  }
  return porLinha;
}

/**
 * Alinha as linhas lidas do CSV com as linhas do OCR.
 *
 * O leitor de CSV pode descartar linhas de total/rodapé; como o CSV do OCR é
 * escrito por nós, a correspondência é feita pelo conteúdo: cada linha lida
 * casa com a linha do OCR de mesmo conteúdo. O índice devolvido é o da linha
 * do CSV; `-1` marca linha sem par no OCR.
 */
export function alinharLinhasOcr(
  sidecar: OcrSidecar,
  linhasCsv: Array<Record<string, string>>,
): number[] {
  const porLinha = celulasPorLinha(sidecar);
  const linhasOcr = [...porLinha.keys()].sort((a, b) => a - b);
  const alinhamento: number[] = [];
  let cursor = 0;

  for (const linhaCsv of linhasCsv) {
    let encontrado = -1;
    while (cursor < linhasOcr.length) {
      const linhaOcr = linhasOcr[cursor];
      cursor += 1;
      if (linhaOcr === undefined) break;
      const celulas = porLinha.get(linhaOcr) ?? [];
      const iguais = sidecar.headers.every((header, coluna) => {
        const celula = celulas.find((c) => c.coluna === coluna);
        const esperado = String(celula?.valor ?? "").trim();
        const lido = String(linhaCsv[header] ?? "").trim();
        return esperado === lido;
      });
      if (iguais) {
        encontrado = linhaOcr;
        break;
      }
    }
    alinhamento.push(encontrado);
  }

  return alinhamento;
}
