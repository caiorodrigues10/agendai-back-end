/**
 * OCR **real** (Tesseract de verdade) sobre imagens sintéticas.
 *
 * Sem traineddata local o teste é **pulado** — com o motivo explícito. Não
 * há rede nesta suíte: sem o arquivo do modelo local, o Tesseract tentaria
 * baixar e o teste passaria a depender de internet.
 *
 * Onde o traineddata precisa estar:
 *   • `OCR_TESSDATA_PATH` (padrão `.tesseract-cache`), relativo ao diretório
 *     de trabalho do processo;
 *   • um arquivo `<idioma>.traineddata` por idioma de `OCR_LANG` ("por+eng").
 *
 * Para rodar: baixe/empacote `por.traineddata` e `eng.traineddata` nesse
 * caminho e rode `npm test -- src/modules/dataImport/ocr/ocrReal.spec.ts`.
 */
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { extrairImagem } from "./ocrExtractor";
import { verificarTessdata } from "./ocrWorker";
import { gerarImagensSinteticas } from "./ocrImagensSinteticas";
import {
  OCR_MIN_TABLE_WIDTH_PX_TELEFONE,
  OCR_MIN_TABLE_WIDTH_PX_VALOR,
} from "./ocr.constants";

const imagens = gerarImagensSinteticas();

/** O teste de OCR real só roda com o traineddata no cache local. */
const tessdata = verificarTessdata();
const temTessdata = tessdata.ok;

describe("imagens sintéticas do OCR", () => {
  it("gera 3 imagens PNG em memória (nenhuma imagem real)", () => {
    expect(imagens).toHaveLength(3);
    for (const imagem of imagens) {
      expect(imagem.buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(true);
      expect(imagem.buffer.length).toBeGreaterThan(0);
      expect(imagem.larguraPx).toBeGreaterThan(0);
    }
  });

  it("a tabela larga fica acima do piso e a estreita abaixo", () => {
    const larga = imagens[0];
    const estreita = imagens[1];
    expect(larga.larguraTabelaPx).toBeGreaterThanOrEqual(OCR_MIN_TABLE_WIDTH_PX_TELEFONE);
    expect(estreita.larguraTabelaPx).toBeLessThan(OCR_MIN_TABLE_WIDTH_PX_TELEFONE);
  });
});

describe.skipIf(!temTessdata)("OCR real com Tesseract (traineddata local)", () => {
  it("lê a tabela de clientes da imagem sintética e devolve a largura da tabela", async () => {
    const resultado = await extrairImagem(
      imagens[0].buffer,
      imagens[0].nome,
      imagens[0].larguraPx,
    );

    expect(resultado.headers.length).toBeGreaterThanOrEqual(2);
    expect(resultado.headers[0]).toBe("Coluna 1");
    expect(resultado.celulas.length).toBeGreaterThan(0);
    expect(resultado.larguraTabelaPx).toBeGreaterThanOrEqual(
      OCR_MIN_TABLE_WIDTH_PX_TELEFONE,
    );

    const texto = resultado.sheet.rows
      .map((linha) => Object.values(linha).join(" "))
      .join(" ");
    expect(texto.length).toBeGreaterThan(0);
  }, 120_000);

  it("lê a tabela de serviços da segunda imagem sintética", async () => {
    const resultado = await extrairImagem(
      imagens[2].buffer,
      imagens[2].nome,
      imagens[2].larguraPx,
    );
    expect(resultado.headers.length).toBeGreaterThanOrEqual(2);
    expect(resultado.celulas.length).toBeGreaterThan(0);
  }, 120_000);
});

if (!temTessdata) {
  describe("OCR real — sem traineddata local", () => {
    it("o teste de OCR real fica pulado (sem fingir cobertura)", () => {
      // Prova explícita do motivo do skip.
      expect(temTessdata).toBe(false);
      expect(tessdata.faltantes.length).toBeGreaterThan(0);
      expect(existsSync(resolve(tessdata.caminho))).toBe(false);
    });
  });
}
