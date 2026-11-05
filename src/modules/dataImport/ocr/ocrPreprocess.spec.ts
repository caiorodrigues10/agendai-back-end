/**
 * Testes do pré-processamento de imagem do OCR e da métrica do benchmark.
 *
 * Sem banco, sem rede e sem imagem real: tudo sai das imagens sintéticas
 * (SVG → PNG) geradas em memória.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import sharp from "sharp";
import {
  preprocessOcrImage,
  estimarDesvio,
  escalaAtePiso,
  larguraTabelaAproximada,
  dimensoesImagem,
  PREPROCESS_STEPS,
  NOMES_ETAPAS_PREPROCESS,
  type PreprocessSteps,
} from "./ocrPreprocess";
import { gerarImagensSinteticas } from "./ocrImagensSinteticas";

const [TABELA] = gerarImagensSinteticas();
const GROUND_TRUTH = {
  nome: TABELA.nome,
  larguraPx: TABELA.larguraPx,
  titulo: "Clientes",
  cabecalhos: ["Nome", "Telefone", "Valor"],
  colunas: [
    { indice: 0, campo: "nome" as const },
    { indice: 1, campo: "telefone" as const },
    { indice: 2, campo: "valor" as const },
  ],
  linhas: [["Ana Souza", "11987654321", "120,00"]],
};

/** Todas as etapas desligadas. */
const SEM_ETAPAS: PreprocessSteps = {
  exifRotate: false,
  grayscale: false,
  normalise: false,
  clahe: false,
  median: false,
  scaleToFloor: false,
  deskew: false,
};

describe("pré-processamento — etapas ligáveis", () => {
  it("toda etapa tem nome e existe na lista", () => {
    expect(NOMES_ETAPAS_PREPROCESS).toEqual([
      "exifRotate",
      "grayscale",
      "normalise",
      "clahe",
      "median",
      "scaleToFloor",
      "deskew",
    ]);
    for (const nome of NOMES_ETAPAS_PREPROCESS) {
      expect(nome in PREPROCESS_STEPS).toBe(true);
    }
  });

  it("com todas as etapas desligadas a imagem volta intacta", async () => {
    const resultado = await preprocessOcrImage(TABELA.buffer, { steps: SEM_ETAPAS });
    expect(resultado.equals(TABELA.buffer)).toBe(true);
  });

  it("as etapas ligadas por padrão são só as que o benchmark adotou", () => {
    expect(PREPROCESS_STEPS.exifRotate).toBe(true);
    expect(PREPROCESS_STEPS.deskew).toBe(true);
    expect(PREPROCESS_STEPS.grayscale).toBe(false);
    expect(PREPROCESS_STEPS.normalise).toBe(false);
    expect(PREPROCESS_STEPS.clahe).toBe(false);
    expect(PREPROCESS_STEPS.median).toBe(false);
    expect(PREPROCESS_STEPS.scaleToFloor).toBe(false);
  });
});

describe("pré-processamento — deskew por perfil de projeção", () => {
  it("acha o desvio contrario ao giro aplicado", async () => {
    const girada = await sharp(TABELA.buffer)
      .rotate(3, { background: "#ffffff" })
      .png()
      .toBuffer();
    const { anguloGraus } = await estimarDesvio(girada);
    expect(anguloGraus).toBeGreaterThan(-3.6);
    expect(anguloGraus).toBeLessThan(-2.4);
  });

  it("endireita a tabela girada", async () => {
    const girada = await sharp(TABELA.buffer)
      .rotate(3, { background: "#ffffff" })
      .png()
      .toBuffer();
    const endireitada = await preprocessOcrImage(girada, {
      steps: { ...SEM_ETAPAS, deskew: true },
    });
    const { anguloGraus } = await estimarDesvio(endireitada);
    expect(Math.abs(anguloGraus)).toBeLessThan(0.6);
  });

  it("não roda fora do limite de ±5 graus", async () => {
    const muitoGirada = await sharp(TABELA.buffer)
      .rotate(12, { background: "#ffffff" })
      .png()
      .toBuffer();
    const { anguloGraus } = await estimarDesvio(muitoGirada);
    expect(Math.abs(anguloGraus)).toBeLessThanOrEqual(5);
  });
});

describe("pré-processamento — orientação por EXIF", () => {
  it("aplica a orientação de foto de celular deitada", async () => {
    const comExif = await sharp(TABELA.buffer)
      .rotate(-90, { background: "#ffffff" })
      .withMetadata({ orientation: 6 })
      .png()
      .toBuffer();

    const antes = await dimensoesImagem(comExif);
    expect(antes.larguraPx).toBeLessThan(antes.alturaPx);

    const orientada = await preprocessOcrImage(comExif, {
      steps: { ...SEM_ETAPAS, exifRotate: true },
    });
    const depois = await dimensoesImagem(orientada);
    expect(depois.larguraPx).toBe(antes.alturaPx);
    expect(depois.alturaPx).toBe(antes.larguraPx);
  });
});

describe("pré-processamento — régua e piso", () => {
  it("a régua aproximada mede a extensão do texto da tabela", async () => {
    const largura = await larguraTabelaAproximada(TABELA.buffer);
    expect(largura).toBeGreaterThan(600);
    expect(largura).toBeLessThan(900);
  });

  it("amplia a imagem que está abaixo do piso", async () => {
    const pequena = await sharp(TABELA.buffer)
      .resize({ width: 400 })
      .png()
      .toBuffer();
    const antes = await dimensoesImagem(pequena);
    const ampliada = await escalaAtePiso(pequena, 693);
    const depois = await dimensoesImagem(ampliada);
    expect(depois.larguraPx).toBeGreaterThan(antes.larguraPx);
  });

  it("não mexe na imagem que já está no piso", async () => {
    const resultado = await escalaAtePiso(TABELA.buffer, 693);
    expect(resultado.equals(TABELA.buffer)).toBe(true);
  });
});
