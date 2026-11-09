/**
 * Integração do pré-processamento com a importação por imagem.
 *
 * Prova o que a flag `OCR_PREPROCESS` faz no caminho real do serviço:
 *   • `off` → o Tesseract lê a imagem como veio (sem pré-processamento);
 *   • `on`  → o pré-processamento roda **antes** do OCR.
 *
 * Sem banco e sem Tesseract: o motor de OCR, o extrator e a gravação do
 * lote são simulados; a validação da imagem é a real (com o temporário
 * apagado no `finally`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  process.env.OCR_IMPORT_ENABLED = "on";
});

vi.mock("./ocrWorker", () => ({
  OCR_TESSDATA_PATH: "/tmp/tessdata-preprocess",
  caminhoTessdata: () => "/tmp/tessdata-preprocess",
  linguasTessdata: () => ["eng"],
  verificarTessdata: () => ({ ok: true, caminho: "/tmp/tessdata-preprocess", faltantes: [] }),
  erroTessdataAusente: () => new Error("traineddata ausente"),
  shutdownOcrWorker: vi.fn(),
  getOcrWorker: vi.fn(),
  ocrImage: vi.fn(),
}));

vi.mock("./ocrExtractor", () => ({
  extrairImagem: vi.fn(async () => ({
    headers: ["Coluna 1", "Coluna 2"],
    celulas: [
      [
        { valor: "Ana Souza", confianca: 95, origem: "ocr", linha: 1, coluna: 0 },
        { valor: "11987654321", confianca: 91, origem: "ocr", linha: 1, coluna: 1 },
      ],
    ],
    sheet: {
      sheetName: null,
      headers: ["Coluna 1", "Coluna 2"],
      rows: [{ "Coluna 1": "Ana Souza", "Coluna 2": "11987654321" }],
      sheetNames: [],
      selectedSheet: null,
    },
    larguraTabelaPx: 820,
    larguraImagemPx: 1200,
  })),
}));

vi.mock("./ocrBatchFile", () => ({
  salvarArquivoLoteOcr: vi.fn(async () => ({
    filePath: "/tmp/lote-ocr-teste.csv",
    sidecar: { caminho: "/tmp/lote-ocr-teste.ocr.json" },
  })),
}));

const preprocessMock = vi.hoisted(() => ({
  preprocessOcrImage: vi.fn(async (buffer: Buffer) => buffer),
  dimensoesImagem: vi.fn(async () => ({ larguraPx: 1200, alturaPx: 218 })),
}));

vi.mock("./ocrPreprocess", () => preprocessMock);

import { gerarImagensSinteticas } from "./ocrImagensSinteticas";
import { extrairImagem } from "./ocrExtractor";

const [IMAGEM] = gerarImagensSinteticas();

async function importarCom(flag: string) {
  vi.resetModules();
  process.env.OCR_PREPROCESS = flag;
  const { importarImagemOcr } = await import("./ocrImportService");
  return importarImagemOcr(IMAGEM.nome, IMAGEM.buffer);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  delete process.env.OCR_PREPROCESS;
  vi.resetModules();
});

describe("flag OCR_PREPROCESS", () => {
  it("off não chama o pré-processamento", async () => {
    const resultado = await importarCom("off");
    expect(preprocessMock.preprocessOcrImage).not.toHaveBeenCalled();
    expect(resultado.operacao.preprocessAtivo).toBe(false);
  });

  it("on chama o pré-processamento antes do OCR", async () => {
    const resultado = await importarCom("on");
    expect(preprocessMock.preprocessOcrImage).toHaveBeenCalledTimes(1);
    expect(resultado.operacao.preprocessAtivo).toBe(true);
    expect(resultado.operacao.tempoPreprocessMs).toBeGreaterThanOrEqual(0);
  });

  it("o OCR recebe a imagem que o pré-processamento devolveu", async () => {
    const marca = Buffer.from("marcado-pelo-preprocessamento");
    preprocessMock.preprocessOcrImage.mockResolvedValueOnce(marca as never);
    await importarCom("on");
    expect(extrairImagem).toHaveBeenCalledTimes(1);
    expect((extrairImagem as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(marca);
  });

  it("o padrão (sem variável) é ligado", async () => {
    vi.resetModules();
    delete process.env.OCR_PREPROCESS;
    const { OCR_PREPROCESS } = await import("./ocr.constants");
    expect(OCR_PREPROCESS).toBe(true);
  });

  it("o temporário da imagem é apagado mesmo com erro no OCR", async () => {
    vi.resetModules();
    process.env.OCR_PREPROCESS = "on";
    const { importarImagemOcr } = await import("./ocrImportService");
    const { extrairImagem: extrairMock } = await import("./ocrExtractor");
    (extrairMock as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("falha no OCR"),
    );

    const { importTempDirectory } = await import("../utils/tempFiles");
    const { readdir } = await import("node:fs/promises");
    const antes = new Set(await readdir(importTempDirectory()));

    await expect(importarImagemOcr(IMAGEM.nome, IMAGEM.buffer)).rejects.toThrow(
      "falha no OCR",
    );

    const depois = await readdir(importTempDirectory());
    expect(depois.filter((arquivo) => !antes.has(arquivo))).toHaveLength(0);
  });
});
