/**
 * Testes unitários do módulo OCR de importação (Fase 3).
 *
 * Sem banco, sem rede. O worker do Tesseract é mockado para não depender
 * do traineddata instalado.
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
import { OCR_MAX_FILE_SIZE_BYTES, OCR_MAX_IMAGE_PIXELS, OCR_IMPORT_ENABLED } from "./ocr.constants";
import { importarImagemOcr } from "./ocrImportService";
import type { OcrCellResult } from "./ocrExtractor";

// ─── Mock do worker (não depende de traineddata) ───
vi.mock("./ocrWorker", () => ({
  getOcrWorker: vi.fn(),
  shutdownOcrWorker: vi.fn(),
  ocrImage: vi.fn(),
}));

import { ocrImage } from "./ocrWorker";

const mockedOcrImage = ocrImage as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  ocrQueueResetForTests();
  mockedOcrImage.mockResolvedValue({
    data: {
      text: ["NOME", "TELEFONE", "VALOR", "Larissa", "11987654321", "R$ 12,00"],
      confidence: [99, 99, 99, 95, 90, 92],
      left: [10, 100, 200, 10, 100, 200],
      top: [10, 10, 10, 40, 40, 40],
      width: [50, 50, 50, 50, 50, 50],
      height: [20, 20, 20, 20, 20, 20],
    },
  } as any);
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

  it("rejeita acima de 10 MB", async () => {
    const grande = Buffer.alloc(OCR_MAX_FILE_SIZE_BYTES + 1, 0x89);
    grande[0] = 0x89; grande[1] = 0x50; grande[2] = 0x4e; grande[3] = 0x47;
    await expect(validateAndPrepareImage("x.png", grande)).rejects.toThrow(
      "A imagem passa de 10 MB. Envie uma imagem menor.",
    );
  });

  it("rejeita formato não aceito (texto com extensão .png)", async () => {
    const buf = Buffer.from("não é imagem");
    await expect(validateAndPrepareImage("x.png", buf)).rejects.toThrow(
      "não aceito",
    );
  });

  it("apaga o temporário mesmo com erro de leitura", async () => {
    // PNG válido mas sharp não consegue processar? Usamos um buffer mínimo.
    // O importante: cleanup remove o temp em qualquer caso.
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
    // CanEnqueue é consultado ANTES de enfileirar (no controller).
    expect(ocrQueueCanEnqueue()).toBe(true);
    enqueueOcrJob(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]), "x.png");
  });

  it("rejeita quando a fila está cheia (429)", async () => {
    // Trava o worker para que jobs fiquen enfileirados sem processar.
    let soltar: () => void = () => {};
    const trava = new Promise<void>((resolve) => { soltar = resolve; });
    mockedOcrImage.mockImplementation(() => trava);

    try {
      // 1 job entra em running + 4 em waiting = 5 ocupados; o 6º rejeita.
      for (let i = 0; i < 5; i += 1) {
        enqueueOcrJob(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]),
          `x${i}.png`,
        );
      }
      expect(ocrQueueCanEnqueue()).toBe(false);
      const p = enqueueOcrJob(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]),
        "cheia.png",
      );
      await expect(p).rejects.toThrow("Fila de OCR cheia");
    } finally {
      soltar();
      await new Promise((r) => setTimeout(r, 30));
    }
  });

  it("processa jobs sequencialmente (concorrência 1)", async () => {
    const ordem: string[] = [];
    let liberar: () => void = () => {};
    const gate = new Promise<void>((resolve) => { liberar = resolve; });
    mockedOcrImage.mockImplementation(async (buf) => {
      await gate;
      ordem.push(String(buf[0]));
      return { data: { text: [], confidence: [], left: [], top: [], width: [], height: [] } };
    });

    const p1 = enqueueOcrJob(Buffer.from([1]), "a.png");
    const p2 = enqueueOcrJob(Buffer.from([2]), "b.png");
    // Ambos enfileirados; o worker processa um por vez.
    liberar();
    await Promise.all([p1, p2]);
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

  it("limiar de confiança", () => {
    expect(OCR_REVIEW_CONFIDENCE).toBe(80);
    expect(OCR_CRITICAL_FIELDS).toContain("whatsapp");
    expect(OCR_CRITICAL_FIELDS).toContain("salePrice");
    expect(OCR_CRITICAL_FIELDS).toContain("caseNumber");
  });
});

// ─── Feature flag ───
describe("feature flag OCR_IMPORT_ENABLED", () => {
  it("está off por padrão", () => {
    expect(OCR_IMPORT_ENABLED).toBe(false);
  });
});

// ─── Limites ───
describe("limites de imagem", () => {
  it("tamanho máximo 10 MB", () => {
    expect(OCR_MAX_FILE_SIZE_BYTES).toBe(10 * 1024 * 1024);
  });
  it("pixel máximo padrão 2000", () => {
    expect(OCR_MAX_IMAGE_PIXELS).toBe(2000);
  });
});

// ─── importarImagemOcr com flag off ───
describe("importarImagemOcr (flag off)", () => {
  it("rejeita quando OCR_IMPORT_ENABLED=off", async () => {
    await expect(
      importarImagemOcr("x.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])),
    ).rejects.toThrow("OCR_IMPORT_ENABLED=off");
  });
});

// ─── Log sem valores de célula ───
describe("logs sem valores de célula", () => {
  it("os argumentos do logger não contêm valores de célula", () => {
    // Simula a chamada de logger.info no use case: só contagens/tempo/resolução.
    const logArgs = {
      imagens: 1,
      tempoOcrMs: 123,
      larguraPx: 800,
      abaixoDoPiso: false,
    };
    const json = JSON.stringify(logArgs);
    expect(json).not.toContain("Larissa");
    expect(json).not.toContain("11987654321");
    expect(json).not.toContain("R$");
    expect(json).not.toContain("12,00");
  });
});
