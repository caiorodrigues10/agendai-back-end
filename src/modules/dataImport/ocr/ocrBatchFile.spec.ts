/**
 * Arquivos do lote de OCR: o CSV e o arquivo lateral (.ocr.json).
 *
 * O .ocr.json guarda o valor lido em cada célula (dado do cliente): ele é
 * escrito com permissão de dono only, é reescrito de forma atômica e some
 * junto com o CSV quando o lote é cancelado, concluído ou expirado.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import {
  apagarArquivosLote,
  aplicarEdicaoOcr,
  caminhoSidecarOcr,
  celulasPorLinha,
  lerSidecarOcr,
  montarCsvOcr,
  salvarArquivoLoteOcr,
} from "./ocrBatchFile";
import type { OcrCellResult } from "./ocr.types";

const celulas: OcrCellResult[][] = [
  [
    { valor: "Maria Silva", confianca: 92, origem: "ocr", linha: 1, coluna: 0 },
    { valor: "11987654321", confianca: 45, origem: "ocr", linha: 1, coluna: 1 },
    { valor: "120,50", confianca: 88, origem: "ocr", linha: 1, coluna: 2 },
  ],
  [
    { valor: "Joao Souza", confianca: 91, origem: "ocr", linha: 2, coluna: 0 },
    { valor: "11955556666", confianca: 44, origem: "ocr", linha: 2, coluna: 1 },
    { valor: "80,00", confianca: 90, origem: "ocr", linha: 2, coluna: 2 },
  ],
];

describe("arquivos do lote de OCR", () => {
  let filePath = "";

  beforeEach(async () => {
    const resultado = await salvarArquivoLoteOcr({
      headers: ["Coluna 1", "Coluna 2", "Coluna 3"],
      celulas,
      larguraTabelaPx: 980,
      larguraImagemPx: 1400,
    });
    filePath = resultado.filePath;
  });

  afterEach(async () => {
    await apagarArquivosLote(filePath);
  });

  it("grava o CSV e o .ocr.json só para o dono do processo (0600)", async () => {
    const statCsv = await stat(filePath);
    const statSidecar = await stat(caminhoSidecarOcr(filePath));
    // 0o600 = leitura/escrita só do dono.
    expect(statCsv.mode & 0o777).toBe(0o600);
    expect(statSidecar.mode & 0o777).toBe(0o600);
  });

  it("o .ocr.json guarda o valor lido de cada célula (e a confiança)", async () => {
    const sidecar = await lerSidecarOcr(filePath);
    expect(sidecar).not.toBeNull();
    const celula = sidecar!.celulas.find((c) => c.linha === 1 && c.coluna === 1)!;
    expect(celula.valor).toBe("11987654321");
    expect(celula.confianca).toBe(45);
    expect(celula.aceito).toBe(false);
    expect(celula.editado).toBe(false);
  });

  it("apagar os arquivos do lote apaga o CSV e o .ocr.json", async () => {
    const sidecar = caminhoSidecarOcr(filePath);
    await apagarArquivosLote(filePath);
    await expect(access(filePath, constants.F_OK)).rejects.toThrow();
    await expect(access(sidecar, constants.F_OK)).rejects.toThrow();
  });

  it("apagar um lote que não veio de imagem não quebra (o .ocr.json não existe)", async () => {
    const csvSemLateral = `${filePath}.sem-lateral`;
    await writeFile(csvSemLateral, '"a";"b"\r\n', { mode: 0o600 });
    await apagarArquivosLote(csvSemLateral);
    await expect(access(csvSemLateral, constants.F_OK)).rejects.toThrow();
  });

  it("correção do dono: o valor novo vai para o .ocr.json e para o CSV", async () => {
    await aplicarEdicaoOcr({
      filePath,
      linha: 1,
      coluna: 1,
      valor: "11999998888",
    });

    const sidecar = await lerSidecarOcr(filePath);
    const celula = sidecar!.celulas.find((c) => c.linha === 1 && c.coluna === 1)!;
    expect(celula.valor).toBe("11999998888");
    expect(celula.editado).toBe(true);

    const csv = await readFile(filePath, "utf8");
    expect(csv).toContain("11999998888");
    expect(csv).not.toContain("11987654321");
  });

  it("duas correções simultâneas na MESMA célula não corrompem o arquivo", async () => {
    // Duas requisições de revisão ao mesmo tempo (o dono clicou duas vezes,
    // ou duas abas abertas).
    const [resultadoA, resultadoB] = await Promise.all([
      aplicarEdicaoOcr({ filePath, linha: 1, coluna: 1, valor: "11911112222" }),
      aplicarEdicaoOcr({ filePath, linha: 1, coluna: 1, valor: "11933334444" }),
    ]);

    // Nenhuma das duas leituras pode falhar (o arquivo nunca fica pela metade).
    expect(resultadoA.celulas).toBeDefined();
    expect(resultadoB.celulas).toBeDefined();

    const sidecar = await lerSidecarOcr(filePath);
    expect(sidecar).not.toBeNull();
    const celula = sidecar!.celulas.find((c) => c.linha === 1 && c.coluna === 1)!;
    // O arquivo continua válido e com UM dos dois valores (a última escrita
    // vence) — o que não pode acontecer é JSON quebrado ou valor misturado.
    expect(["11911112222", "11933334444"]).toContain(celula.valor);
    expect(celula.valor).not.toBe("11987654321");

    // O CSV continua legível e coerente com o sidecar.
    const csv = await readFile(filePath, "utf8");
    expect(csv).toContain(celula.valor);
    const linhas = csv.trim().split("\r\n");
    expect(linhas).toHaveLength(3);
    expect(linhas[1]).toContain(celula.valor);
  });

  it("duas correções simultâneas em células diferentes preservam as duas", async () => {
    await Promise.all([
      aplicarEdicaoOcr({ filePath, linha: 1, coluna: 1, valor: "11911112222" }),
      aplicarEdicaoOcr({ filePath, linha: 2, coluna: 1, valor: "11955550000" }),
    ]);

    const sidecar = await lerSidecarOcr(filePath);
    expect(sidecar).not.toBeNull();
    const porLinha = celulasPorLinha(sidecar!);
    expect(porLinha.get(1)!.find((c) => c.coluna === 1)!.valor).toBe("11911112222");
    expect(porLinha.get(2)!.find((c) => c.coluna === 1)!.valor).toBe("11955550000");
  });

  it("o CSV do lote sai com BOM, separador ';' e tudo entre aspas", () => {
    const csv = montarCsvOcr(["Coluna 1", "Coluna 2"], [
      { linha: 1, coluna: 0, valor: "Silva, Maria", confianca: 90, aceito: false, editado: false },
      { linha: 1, coluna: 1, valor: '5"5', confianca: 90, aceito: false, editado: false },
    ]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"Silva, Maria";"5""5"');
  });
});
