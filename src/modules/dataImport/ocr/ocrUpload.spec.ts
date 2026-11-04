/**
 * Testes do **upload** de imagem (sem banco).
 *
 * A checagem da imagem acontece antes de qualquer acesso ao banco: por isso
 * estes testes rodam sem banco e provam o que o dono vê:
 *   • flag `OCR_IMPORT_ENABLED=off` → recusa com mensagem clara;
 *   • flag `on` sem traineddata local → recusa com erro explícito de que o
 *     reconhecedor não está instalado (e **não** tenta baixar da rede).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { DataImportUseCases } from "../dataImportUseCases";
import { validateImportFile } from "../utils/fileValidation";
import { gerarImagensSinteticas } from "./ocrImagensSinteticas";
import { OCR_ERROR_CODES } from "./ocr.constants";

const [imagem] = gerarImagensSinteticas();

/** Buffer com assinatura de PNG (sem imagem real). */
const pngMinimo = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);

afterEach(() => {
  delete process.env.OCR_IMPORT_ENABLED;
  vi.resetModules();
});

describe("upload de imagem — feature flag desligada", () => {
  it("recusa a imagem com mensagem clara (sem tocar no banco)", async () => {
    const useCases = new DataImportUseCases();
    await expect(
      useCases.upload({
        barbershopId: "11111111-1111-4111-8111-111111111111",
        fileName: "clientes.png",
        buffer: pngMinimo,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: OCR_ERROR_CODES.desativado,
    });
  });

  it("a planilha (não imagem) não entra no caminho do OCR", () => {
    expect(() => validateImportFile("clientes.csv", Buffer.from("Nome;WhatsApp\n")))
      .not.toThrow();
    expect(() => validateImportFile("clientes.png", pngMinimo)).toThrow();
  });
});

describe("upload de imagem — feature flag ligada sem traineddata", () => {
  it("recusa com erro explícito de traineddata ausente", async () => {
    vi.resetModules();
    process.env.OCR_IMPORT_ENABLED = "on";

    const { DataImportUseCases: UseCasesOn } = await import("../dataImportUseCases");
    const useCases = new UseCasesOn();

    await expect(
      useCases.upload({
        barbershopId: "11111111-1111-4111-8111-111111111111",
        fileName: "clientes.png",
        buffer: imagem.buffer,
      }),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: OCR_ERROR_CODES.traineddataAusente,
    });
  });
});
