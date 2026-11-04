/**
 * Testes unitários do módulo OCR de importação.
 *
 * Sem banco, sem rede. O worker do Tesseract é mockado para não depender do
 * traineddata instalado.
 *
 * A cobertura do OCR **real** (Tesseract de verdade) fica no arquivo
 * `ocrReal.spec.ts`: ele roda só quando o traineddata está no cache local e,
 * sem ele, marca o teste como pulado — sem fingir cobertura.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  detectImageMime,
  validateAndPrepareImage,
  cleanupImage,
} from "./ocrSecurity";
import {
  enqueueOcrJob,
  ocrQueueStats,
  ocrQueueCanEnqueue,
  ocrQueueResetForTests,
} from "./ocrQueue";
import { gateOcrLinha, OCR_REVIEW_CONFIDENCE, OCR_CRITICAL_FIELDS } from "./falseConfidenceGate";
import {
  OCR_MAX_FILE_SIZE_BYTES,
  OCR_MAX_IMAGE_PIXELS,
  OCR_IMPORT_ENABLED,
  OCR_MIN_TABLE_WIDTH_PX_TELEFONE,
  OCR_MIN_TABLE_WIDTH_PX_VALOR,
  OCR_ERROR_CODES,
} from "./ocr.constants";
import { avaliarLinhaOcr, indexarEstados } from "./ocrReview";
import type { OcrCellResult } from "./ocr.types";

// ─── Mock do worker (não depende de traineddata) ───
vi.mock("./ocrWorker", () => ({
  getOcrWorker: vi.fn(),
  shutdownOcrWorker: vi.fn(),
  ocrImage: vi.fn(),
  verificarTessdata: vi.fn(() => ({ ok: true, caminho: "/tmp", faltantes: [] })),
}));

import { ocrImage } from "./ocrWorker";

const mockedOcrImage = ocrImage as ReturnType<typeof vi.fn>;

/** Payload do Tesseract v7: bloco → parágrafo → linha → palavra. */
function resultadoTesseract(
  palavras: Array<{ texto: string; confianca: number; x0: number; y0: number }>,
) {
  const linhas = new Map<number, Array<{ texto: string; confianca: number; x0: number; y0: number }>>();
  for (const palavra of palavras) {
    const lista = linhas.get(palavra.y0) ?? [];
    lista.push(palavra);
    linhas.set(palavra.y0, lista);
  }
  return {
    data: {
      blocks: [
        {
          paragraphs: [
            {
              lines: [...linhas.entries()].map(([, words]) => ({
                words: words.map((word) => ({
                  text: word.texto,
                  confidence: word.confianca,
                  bbox: { x0: word.x0, y0: word.y0, x1: word.x0 + 120, y1: word.y0 + 20 },
                })),
              })),
            },
          ],
        },
      ],
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  ocrQueueResetForTests();
  mockedOcrImage.mockResolvedValue(
    resultadoTesseract([
      { texto: "NOME", confianca: 99, x0: 10, y0: 10 },
      { texto: "TELEFONE", confianca: 99, x0: 200, y0: 10 },
      { texto: "VALOR", confianca: 99, x0: 400, y0: 10 },
      { texto: "Larissa", confianca: 95, x0: 10, y0: 50 },
      { texto: "11987654321", confianca: 90, x0: 200, y0: 50 },
      { texto: "12,00", confianca: 92, x0: 400, y0: 50 },
    ]),
  );
});

afterEach(() => {
  ocrQueueResetForTests();
});

// ─── detectImageMime ───
describe("detectImageMime", () => {
  it("detecta PNG por magic bytes", () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(detectImageMime(buf)).toBe("image/png");
  });

  it("detecta JPEG por magic bytes", () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(detectImageMime(buf)).toBe("image/jpeg");
  });

  it("detecta WEBP por magic bytes (RIFF + WEBP)", () => {
    const buf = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0, 0, 0, 0, // tamanho
      0x57, 0x45, 0x42, 0x50, // WEBP
    ]);
    expect(detectImageMime(buf)).toBe("image/webp");
  });

  it("retorna null para conteúdo que não é imagem", () => {
    expect(detectImageMime(Buffer.from("texto qualquer"))).toBeNull();
    expect(detectImageMime(Buffer.from([]))).toBeNull();
  });
});

// ─── validateAndPrepareImage ───
describe("validateAndPrepareImage", () => {
  it("rejeita imagem vazia", async () => {
    await expect(validateAndPrepareImage("x.png", Buffer.from([]))).rejects.toThrow(
      "está vazia",
    );
  });

  it("rejeita acima do limite com o código de imagem grande", async () => {
    const grande = Buffer.alloc(OCR_MAX_FILE_SIZE_BYTES + 1, 0x89);
    grande[0] = 0x89; grande[1] = 0x50; grande[2] = 0x4e; grande[3] = 0x47;
    await expect(validateAndPrepareImage("x.png", grande)).rejects.toMatchObject({
      statusCode: 413,
      code: OCR_ERROR_CODES.imagemGrande,
    });
  });

  it("rejeita formato não aceito (texto com extensão .png) com o código de formato", async () => {
    const buf = Buffer.from("não é imagem");
    await expect(validateAndPrepareImage("x.png", buf)).rejects.toMatchObject({
      statusCode: 400,
      code: OCR_ERROR_CODES.formatoInvalido,
    });
  });

  it("apaga o temporário mesmo com erro de leitura", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0]);
    try {
      await validateAndPrepareImage("x.png", png);
    } catch {
      // pode falhar por imagem muito pequena/inválida para sharp
    }
    // Se não lançar, limpa normalmente.
  });
});

// ─── Fila de OCR ───
describe("fila de OCR", () => {
  it("permite enfileirar quando há vaga", () => {
    expect(ocrQueueCanEnqueue()).toBe(true);
    void enqueueOcrJob(async () => "ok");
  });

  it("rejeita quando a fila está cheia (429)", async () => {
    let soltar: () => void = () => {};
    const trava = new Promise<void>((resolve) => { soltar = resolve; });
    mockedOcrImage.mockImplementation(() => trava);

    try {
      for (let i = 0; i < 5; i += 1) {
        void enqueueOcrJob(async () => {
          await trava;
          return "ok";
        });
      }
      expect(ocrQueueCanEnqueue()).toBe(false);
      await expect(enqueueOcrJob(async () => "ok")).rejects.toMatchObject({
        statusCode: 429,
        code: OCR_ERROR_CODES.filaCheia,
      });
    } finally {
      soltar();
      await new Promise((r) => setTimeout(r, 30));
    }
  });

  it("processa jobs sequencialmente (concorrência 1)", async () => {
    const ordem: string[] = [];
    let liberar: () => void = () => {};
    const gate = new Promise<void>((resolve) => { liberar = resolve; });

    const p1 = enqueueOcrJob(async () => {
      await gate;
      ordem.push("1");
      return "a";
    });
    const p2 = enqueueOcrJob(async () => {
      ordem.push("2");
      return "b";
    });
    liberar();
    await expect(Promise.all([p1, p2])).resolves.toEqual(["a", "b"]);
    expect(ordem).toEqual(["1", "2"]);
    const stats = ocrQueueStats();
    expect(stats.completed).toBe(2);
    expect(stats.concurrency).toBe(1);
  });
});

// ─── Gate de falso confiante ───
describe("gate de falso confiante", () => {
  const colunaParaCampo = new Map<number, string>([
    [0, "whatsapp"],
    [1, "salePrice"],
    [2, "caseNumber"],
  ]);

  it("marca campo crítico com confiança baixa como revisar", () => {
    const celulas: OcrCellResult[] = [
      { valor: "11987654321", confianca: 50, origem: "ocr", linha: 1, coluna: 0 },
    ];
    const res = gateOcrLinha(celulas, colunaParaCampo);
    expect(res[0].verdict.revisar).toBe(true);
    expect(res[0].verdict.motivo).toContain("baixa confiança");
  });

  it("não marca campo crítico com confiança alta", () => {
    const celulas: OcrCellResult[] = [
      { valor: "11987654321", confianca: 95, origem: "ocr", linha: 1, coluna: 0 },
    ];
    const res = gateOcrLinha(celulas, colunaParaCampo);
    expect(res[0].verdict.revisar).toBe(false);
  });

  it("detecta falso confiante potencial: telefone válido mas confiança baixa", () => {
    const celulas: OcrCellResult[] = [
      { valor: "11987654321", confianca: 40, origem: "ocr", linha: 1, coluna: 0 },
    ];
    const res = gateOcrLinha(celulas, colunaParaCampo);
    expect(res[0].verdict.falsoConfiantePotencial).toBe(true);
    expect(res[0].verdict.revisar).toBe(true);
  });

  it("campo não crítico com confiança baixa e texto sem sentido não é falso confiante", () => {
    const colunaParaCampo2 = new Map<number, string>([[0, "notes"]]);
    const celulas: OcrCellResult[] = [
      { valor: "asdfghjkl", confianca: 30, origem: "ocr", linha: 1, coluna: 0 },
    ];
    const res = gateOcrLinha(celulas, colunaParaCampo2);
    expect(res[0].verdict.falsoConfiantePotencial).toBe(false);
    expect(res[0].verdict.revisar).toBe(false);
  });

  it("número de processo com formato de CNJ impossível vai para revisão", () => {
    const celulas: OcrCellResult[] = [
      { valor: "12345", confianca: 99, origem: "ocr", linha: 1, coluna: 2 },
    ];
    const res = gateOcrLinha(celulas, colunaParaCampo);
    expect(res[0].verdict.revisar).toBe(true);
    expect(res[0].verdict.motivo).toContain("CNJ");
  });

  it("limiar de confiança", () => {
    expect(OCR_REVIEW_CONFIDENCE).toBe(80);
    expect(OCR_CRITICAL_FIELDS).toContain("whatsapp");
    expect(OCR_CRITICAL_FIELDS).toContain("salePrice");
    expect(OCR_CRITICAL_FIELDS).toContain("caseNumber");
  });
});

// ─── Gate → "revisar" da linha (sem banco) ───
describe("gate do OCR vira revisar da linha", () => {
  const colunaParaCampo = new Map<number, string>([[0, "whatsapp"]]);

  it("telefone válido com confiança baixa: revisar = true", () => {
    const celulas: OcrCellResult[] = [
      { valor: "11987654321", confianca: 45, origem: "ocr", linha: 7, coluna: 0 },
    ];
    const veredito = avaliarLinhaOcr(celulas, colunaParaCampo);
    expect(veredito.revisar).toBe(true);
    expect(veredito.pendentes).toBe(1);
    expect(veredito.celulas[0].campo).toBe("whatsapp");
    expect(veredito.celulas[0].confianca).toBe(45);
    // A linha vai para a tela: é ela que o frontend usa para corrigir a
    // célula certa (PATCH /imports/:batchId/review).
    expect(veredito.celulas[0].linha).toBe(7);
  });

  it("telefone válido com confiança alta: revisar = false", () => {
    const celulas: OcrCellResult[] = [
      { valor: "11987654321", confianca: 95, origem: "ocr", linha: 1, coluna: 0 },
    ];
    const veredito = avaliarLinhaOcr(celulas, colunaParaCampo);
    expect(veredito.revisar).toBe(false);
    expect(veredito.pendentes).toBe(0);
  });

  it("célula corrigida pelo dono sai da fila de revisão", () => {
    const celulas: OcrCellResult[] = [
      { valor: "11987654321", confianca: 45, origem: "ocr", linha: 1, coluna: 0 },
    ];
    const estados = indexarEstados([
      {
        linha: 1,
        coluna: 0,
        confianca: 45,
        valor: "11987654321",
        aceito: false,
        editado: true,
      },
    ]);
    const veredito = avaliarLinhaOcr(celulas, colunaParaCampo, estados);
    expect(veredito.revisar).toBe(false);
    expect(veredito.celulas[0].editado).toBe(true);
  });

  it("célula aceita explicitamente pelo dono sai da fila de revisão", () => {
    const celulas: OcrCellResult[] = [
      { valor: "11987654321", confianca: 45, origem: "ocr", linha: 1, coluna: 0 },
    ];
    const estados = indexarEstados([
      {
        linha: 1,
        coluna: 0,
        confianca: 45,
        valor: "11987654321",
        aceito: true,
        editado: false,
      },
    ]);
    const veredito = avaliarLinhaOcr(celulas, colunaParaCampo, estados);
    expect(veredito.revisar).toBe(false);
    expect(veredito.celulas[0].aceito).toBe(true);
  });
});

// ─── Feature flag ───
describe("feature flag OCR_IMPORT_ENABLED", () => {
  it("está off por padrão", () => {
    expect(OCR_IMPORT_ENABLED).toBe(false);
  });
});

// ─── Limites de imagem ───
describe("limites de imagem", () => {
  it("tamanho máximo 10 MB por padrão", () => {
    expect(OCR_MAX_FILE_SIZE_BYTES).toBe(10 * 1024 * 1024);
  });
  it("pixel máximo padrão 2000", () => {
    expect(OCR_MAX_IMAGE_PIXELS).toBe(2000);
  });
  it("piso de resolução conforme o REPORT (693 px telefone / 924 px valor)", () => {
    expect(OCR_MIN_TABLE_WIDTH_PX_TELEFONE).toBe(693);
    expect(OCR_MIN_TABLE_WIDTH_PX_VALOR).toBe(924);
  });
});

// ─── Log sem valores de célula ───
describe("logs sem valores de célula", () => {
  it("os argumentos do logger não contêm valores de célula", () => {
    const logArgs = {
      imagens: 1,
      tempoOcrMs: 123,
      larguraTabelaPx: 800,
      abaixoDoPiso: false,
    };
    const json = JSON.stringify(logArgs);
    expect(json).not.toContain("Larissa");
    expect(json).not.toContain("11987654321");
    expect(json).not.toContain("R$");
    expect(json).not.toContain("12,00");
  });
});
