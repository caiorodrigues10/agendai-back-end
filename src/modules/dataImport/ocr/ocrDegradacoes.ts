/**
 * Dataset **degradado** para medir o pré-processamento do OCR.
 *
 * Deriva das imagens sintéticas (`ocrImagensSinteticas`) e aplica, em
 * memória, as degradações que uma foto real de celular traz: torta, com
 * sombra de um lado, sem contraste, borrada, com ruído, recomprimida e
 * perto do piso de resolução.
 *
 * Nada aqui é foto de cliente: as imagens são desenhadas (SVG → PNG) e
 * degradadas na hora. O dataset não é versionado como arquivo — é gerado
 * pelo benchmark (`scripts/ocr-preprocess-bench.ts`).
 */
import sharp from "sharp";
import {
  gerarImagensSinteticas,
  groundTruthSinteticas,
  type ImagemSintetica,
  type TabelaSinteticaDef,
} from "./ocrImagensSinteticas";
import {
  OCR_MIN_TABLE_WIDTH_PX_TELEFONE,
  OCR_MIN_TABLE_WIDTH_PX_VALOR,
} from "./ocr.constants";
import { larguraTabelaAproximada } from "./ocrPreprocess";

/** Degradações geradas para cada imagem sintética. */
export const VARIANTES_DEGRADADAS = [
  "original",
  "exif-girada",
  "rotacao-4",
  "rotacao+3",
  "sombra",
  "contraste-baixo",
  "desfoque-leve",
  "ruido",
  "jpeg-baixo",
  "piso-693",
  "piso-924",
] as const;

export type VarianteDegradada = (typeof VARIANTES_DEGRADADAS)[number];

/** Uma imagem do dataset degradado (buffer em memória + a régua do piso). */
export interface ImagemDegradada {
  /** Identificador único (base + variante). */
  id: string;
  /** Nome da imagem sintética de origem. */
  base: string;
  /** Degradação aplicada. */
  variante: VarianteDegradada;
  /** Arquivo que o OCR recebe (PNG ou JPEG, conforme a variante). */
  buffer: Buffer;
  larguraPx: number;
  alturaPx: number;
  /** Largura da região da tabela na variante (a régua do piso). */
  larguraTabelaPx: number;
}

/** Sombra em gradiente (o lado direito da foto fica escuro). */
async function aplicarSombra(buffer: Buffer): Promise<Buffer> {
  const metadata = await sharp(buffer).metadata();
  const largura = metadata.width ?? 0;
  const altura = metadata.height ?? 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000000" stop-opacity="0"/><stop offset="0.55" stop-color="#000000" stop-opacity="0.12"/><stop offset="1" stop-color="#000000" stop-opacity="0.55"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;

  return sharp(buffer)
    .composite([{ input: Buffer.from(svg), blend: "over" }])
    .png()
    .toBuffer();
}

/** Ruído gaussiano (sensibilidade do sensor + ISO alto). */
async function aplicarRuido(buffer: Buffer): Promise<Buffer> {
  const metadata = await sharp(buffer).metadata();
  const largura = metadata.width ?? 0;
  const altura = metadata.height ?? 0;
  const ruido = await sharp({
    create: {
      width: largura,
      height: altura,
      channels: 3,
      background: "#808080",
      noise: { type: "gaussian", mean: 128, sigma: 34 },
    },
  })
    .ensureAlpha(0.25)
    .png()
    .toBuffer();

  return sharp(buffer)
    .composite([{ input: ruido, blend: "over" }])
    .png()
    .toBuffer();
}

/**
 * Redimensiona para que a **extensão do texto** (a régua de produção:
 * o que o OCR mede nas palavras) fique com a largura alvo.
 */
async function redimensionarParaPiso(
  buffer: Buffer,
  larguraTabelaAlvoPx: number,
): Promise<{ buffer: Buffer; larguraPx: number; larguraTabelaPx: number }> {
  const larguraTabelaAtual = await larguraTabelaAproximada(buffer);
  const metadata = await sharp(buffer).metadata();
  const larguraAtual = metadata.width ?? 0;

  if (!larguraTabelaAtual || !larguraAtual) {
    return { buffer, larguraPx: larguraAtual, larguraTabelaPx: larguraTabelaAtual };
  }

  const fator = larguraTabelaAlvoPx / larguraTabelaAtual;
  const buffer2 = await sharp(buffer)
    .resize({
      width: Math.round(larguraAtual * fator),
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();

  return {
    buffer: buffer2,
    larguraPx: Math.round(larguraAtual * fator),
    larguraTabelaPx: larguraTabelaAlvoPx,
  };
}

/**
 * Gera o dataset degradado completo: cada imagem sintética em todas as
 * variações (nenhuma foto real entra aqui).
 */
export async function gerarDatasetDegradado(): Promise<ImagemDegradada[]> {
  const imagens = gerarImagensSinteticas();
  const dataset: ImagemDegradada[] = [];

  for (const imagem of imagens) {
    dataset.push(
      ...(await gerarVariantesDaImagem(imagem)),
    );
  }

  return dataset;
}

/** Gera as variantes de uma imagem sintética. */
export async function gerarVariantesDaImagem(
  imagem: ImagemSintetica,
): Promise<ImagemDegradada[]> {
  const variantes: ImagemDegradada[] = [];

  const adicionar = async (
    variante: VarianteDegradada,
    buffer: Buffer,
    larguraTabelaPx?: number,
  ): Promise<void> => {
    const metadata = await sharp(buffer).metadata();
    variantes.push({
      id: `${imagem.nome}::${variante}`,
      base: imagem.nome,
      variante,
      buffer,
      larguraPx: metadata.width ?? 0,
      alturaPx: metadata.height ?? 0,
      larguraTabelaPx: larguraTabelaPx ?? imagem.larguraTabelaPx,
    });
  };

  await adicionar("original", imagem.buffer);

  // Foto de celular deitada: os pixels ficam deitados e a orientação vem no
  // EXIF. O Tesseract não lê EXIF — sem `autoOrient` a tabela sai de lado.
  await adicionar(
    "exif-girada",
    await sharp(imagem.buffer)
      .rotate(-90, { background: "#ffffff" })
      .withMetadata({ orientation: 6 })
      .png()
      .toBuffer(),
    imagem.larguraTabelaPx,
  );

  await adicionar(
    "rotacao-4",
    await sharp(imagem.buffer).rotate(-4, { background: "#ffffff" }).png().toBuffer(),
  );

  await adicionar(
    "rotacao+3",
    await sharp(imagem.buffer).rotate(3, { background: "#ffffff" }).png().toBuffer(),
  );

  await adicionar("sombra", await aplicarSombra(imagem.buffer));

  await adicionar(
    "contraste-baixo",
    await sharp(imagem.buffer).linear(0.35, 120).png().toBuffer(),
  );

  await adicionar(
    "desfoque-leve",
    await sharp(imagem.buffer).blur(1.6).png().toBuffer(),
  );

  await adicionar("ruido", await aplicarRuido(imagem.buffer));

  await adicionar(
    "jpeg-baixo",
    await sharp(imagem.buffer).jpeg({ quality: 15 }).toBuffer(),
  );

  const pisoTelefone = await redimensionarParaPiso(
    imagem.buffer,
    OCR_MIN_TABLE_WIDTH_PX_TELEFONE,
  );
  await adicionar(
    "piso-693",
    pisoTelefone.buffer,
    pisoTelefone.larguraTabelaPx,
  );

  const pisoValor = await redimensionarParaPiso(
    imagem.buffer,
    OCR_MIN_TABLE_WIDTH_PX_VALOR,
  );
  await adicionar("piso-924", pisoValor.buffer, pisoValor.larguraTabelaPx);

  return variantes;
}

/**
 * Ground truth do dataset: para cada imagem base, as linhas e a coluna de
 * cada campo medido.
 */
export function groundTruthDoDataset(): Map<string, TabelaSinteticaDef> {
  const mapa = new Map<string, TabelaSinteticaDef>();
  for (const tabela of groundTruthSinteticas()) mapa.set(tabela.nome, tabela);
  return mapa;
}
