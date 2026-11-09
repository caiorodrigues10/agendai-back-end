/**
 * Pré-processamento de imagem para o OCR de importação.
 *
 * O Tesseract lê melhor imagens "limpas": em cinza, com contraste regular,
 * sem ruído e com a linha da tabela reta. Este módulo aplica essas etapas
 * **uma a uma**, cada uma ligável por constante, para que só entre no
 * caminho o que a medição do benchmark provou que ajuda (ver README).
 *
 * Limite conhecido: **não há correção de perspectiva**. Foto de tabela
 * tirada de viés (leitura de um papel em ângulo) continua torta para o
 * OCR: o deskew aqui só corrige o **desvio de rotação no plano** (a linha
 * da tabela girada, até ±5°), que é diferente de perspectiva (a tabela
 * trapezoidal, que exigiria identificar 4 cantos e remapear a imagem).
 */
import sharp from "sharp";
import { OCR_MIN_TABLE_WIDTH_PX_TELEFONE } from "./ocr.constants";

/** Cada etapa do pré-processamento, ligável individualmente. */
export interface PreprocessSteps {
  /** Orienta a imagem pelo EXIF (celular deitado vira retrato). */
  exifRotate: boolean;
  /** Converte para cinza (o Tesseract não precisa de cor). */
  grayscale: boolean;
  /** Estica o contraste (percentis 1%–99%). */
  normalise: boolean;
  /** CLAHE: equalização local, segura para sombra de um lado só. */
  clahe: boolean;
  /** Filtro de mediana 3×3: tira ruído sem borrar as letras. */
  median: boolean;
  /** Amplia a imagem até o piso de largura (693 px). */
  scaleToFloor: boolean;
  /** Corrige o desvio de rotação (até ±5°, passo 0,5°). */
  deskew: boolean;
}

/**
 * Etapas ligadas por padrão.
 *
 * O benchmark (README, seção "Importação por imagem (OCR)") mediu cada etapa
 * isoladamente contra a linha de base: só entra aqui a etapa que **melhorou
 * o acerto sem aumentar o falso confiante**. Etapa que piorou ou não mudou
 * ficou desligada.
 *
 * Adotadas: `exifRotate` (foto de celular deitada) e `deskew` (linha da
 * tabela torta). Descartadas pelo benchmark: `grayscale`, `normalise`,
 * `clahe`, `median` e `scaleToFloor` (esta última, no alvo de 924 px,
 * ganhava acerto mas aumentava o falso confiante).
 */
export const PREPROCESS_STEPS: PreprocessSteps = {
  exifRotate: true,
  grayscale: false,
  normalise: false,
  clahe: false,
  median: false,
  scaleToFloor: false,
  deskew: true,
};

/** Nomes das etapas (para log e para o benchmark). */
export const NOMES_ETAPAS_PREPROCESS = [
  "exifRotate",
  "grayscale",
  "normalise",
  "clahe",
  "median",
  "scaleToFloor",
  "deskew",
] as const;

export type NomeEtapaPreprocess = (typeof NOMES_ETAPAS_PREPROCESS)[number];

/** Desvio máximo corrigido pelo deskew (graus). */
export const DESVIO_MAX_GRAUS = 5;

/** Passo da busca do deskew (graus). */
export const DESVIO_PASSO_GRAUS = 0.5;

/** Largura (px) da imagem reduzida usada só na busca do ângulo. */
const LARGURA_BUSCA_DESVIO = 900;

/** Ampliação máxima aceita pela etapa de piso (evita imagem gigante). */
const FATOR_AMPLIACAO_MAXIMO = 3;

/**
 * Limiar de Otsu sobre o histograma de cinza.
 *
 * Implementação própria (sem dependência nova): separa o texto do papel
 * mesmo em baixo contraste, onde um limiar fixo (128) não funciona.
 */
function limiarOtsu(histograma: Uint32Array, totalPixels: number): number {
  let soma = 0;
  for (let i = 0; i < 256; i += 1) soma += i * histograma[i];

  let somaBackground = 0;
  let pesoBackground = 0;
  let melhorVariancia = -1;
  let limiar = 128;

  for (let t = 0; t < 256; t += 1) {
    pesoBackground += histograma[t];
    if (pesoBackground === 0) continue;
    const pesoForeground = totalPixels - pesoBackground;
    if (pesoForeground === 0) break;

    somaBackground += t * histograma[t];
    const mediaBackground = somaBackground / pesoBackground;
    const mediaForeground = (soma - somaBackground) / pesoForeground;
    const variancia =
      (pesoBackground * pesoForeground * (mediaBackground - mediaForeground) ** 2) /
      (totalPixels * totalPixels);

    if (variancia > melhorVariancia) {
      melhorVariancia = variancia;
      limiar = t;
    }
  }

  return limiar;
}

/**
 * Converte a imagem em uma máscara de tinta (1 = escuro/texto).
 *
 * A máscara é calculada sobre uma cópia reduzida e em cinza: é só para
 * **procurar o ângulo**, não para o OCR.
 */
async function mascaraTinta(
  buffer: Buffer,
): Promise<{
  mascara: Uint8Array;
  largura: number;
  altura: number;
  /** Fator de redução da largura (1 = sem redução). */
  escalaLargura: number;
}> {
  const metadata = await sharp(buffer).metadata();
  const larguraOriginal = metadata.width ?? 0;

  const { data, info } = await sharp(buffer)
    .grayscale()
    .resize({
      width: LARGURA_BUSCA_DESVIO,
      withoutEnlargement: true,
      fit: "inside",
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const largura = info.width;
  const altura = info.height;
  const histograma = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 1) histograma[data[i]] += 1;

  const limiar = limiarOtsu(histograma, data.length);
  const mascara = new Uint8Array(largura * altura);
  for (let i = 0; i < data.length; i += 1) {
    mascara[i] = data[i] <= limiar ? 1 : 0;
  }

  return {
    mascara,
    largura,
    altura,
    escalaLargura: larguraOriginal > 0 ? largura / larguraOriginal : 1,
  };
}

/**
 * Largura aproximada da **região da tabela**, em px da imagem original.
 *
 * É a extensão horizontal da tinta (o mesmo que o extrator mede nas
 * palavras lidas: x1 - x0). Serve de régua para o piso de resolução
 * quando a tabela ainda não foi lida.
 */
export async function larguraTabelaAproximada(buffer: Buffer): Promise<number> {
  const { mascara, largura, altura, escalaLargura } = await mascaraTinta(buffer);
  let minX = largura;
  let maxX = -1;

  for (let y = 0; y < altura; y += 1) {
    for (let x = 0; x < largura; x += 1) {
      if (!mascara[y * largura + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }

  if (maxX < 0) return 0;
  return Math.round((maxX - minX) / escalaLargura);
}

/**
 * Perfil de projeção: soma da tinta projetada numa direção.
 *
 * O texto em linha reta aparece como picos estreitos no perfil; o texto
 * torto espalha a tinta. O escore (soma dos quadrados das diferenças
 * entre bins vizinhos) é maior quando as linhas estão retas.
 */
function escorePerfilProjecao(
  mascara: Uint8Array,
  largura: number,
  altura: number,
  anguloGraus: number,
): number {
  const radiano = (anguloGraus * Math.PI) / 180;
  const seno = Math.sin(radiano);
  const cosseno = Math.cos(radiano);
  const centroX = largura / 2;
  const centroY = altura / 2;
  const alcance = Math.ceil(Math.hypot(largura, altura)) + 1;

  const bins = new Float64Array(alcance * 2 + 1);
  for (let y = 0; y < altura; y += 1) {
    const dy = y - centroY;
    for (let x = 0; x < largura; x += 1) {
      if (!mascara[y * largura + x]) continue;
      const u = (x - centroX) * seno + dy * cosseno;
      const indice = Math.round(u) + alcance;
      bins[indice] += 1;
    }
  }

  let escore = 0;
  for (let i = 1; i < bins.length; i += 1) {
    const diferenca = bins[i] - bins[i - 1];
    escore += diferenca * diferenca;
  }
  return escore;
}

/**
 * Procura o ângulo que deixa as linhas da tabela retas.
 *
 * Busca em ±5°, passo 0,5° (21 candidatos). O ângulo devolvido é o que
 * **corrige** a imagem (aplicar `sharp.rotate(angulo)` deixa a tabela reta).
 */
export async function estimarDesvio(
  buffer: Buffer,
): Promise<{ anguloGraus: number; escore: number }> {
  const { mascara, largura, altura } = await mascaraTinta(buffer);

  let melhorAngulo = 0;
  let melhorEscore = -Infinity;
  for (
    let angulo = -DESVIO_MAX_GRAUS;
    angulo <= DESVIO_MAX_GRAUS + 1e-9;
    angulo += DESVIO_PASSO_GRAUS
  ) {
    const escore = escorePerfilProjecao(mascara, largura, altura, angulo);
    if (escore > melhorEscore) {
      melhorEscore = escore;
      melhorAngulo = angulo;
    }
  }

  return { anguloGraus: Number(melhorAngulo.toFixed(2)), escore: melhorEscore };
}

/**
 * Corrige o desvio de rotação no plano (até ±5°).
 *
 * Não corrige perspectiva: a tabela continue trapezoidal, com as colunas
 * convergindo. Isso é limite conhecido (documentado no README).
 */
export async function corrigirDesvio(buffer: Buffer): Promise<Buffer> {
  const { anguloGraus } = await estimarDesvio(buffer);
  if (Math.abs(anguloGraus) < 0.01) return buffer;
  return sharp(buffer)
    .rotate(anguloGraus, { background: "#ffffff" })
    .png()
    .toBuffer();
}

/**
 * Amplia a imagem até a régua do piso (região da tabela).
 *
 * A régua é a **extensão do texto** (a mesma que o OCR mede): se ela
 * estiver abaixo do piso, a imagem é ampliada na mesma proporção. O
 * piso continua valendo na escala original — ampliar não cria detalhe
 * que a foto não tinha, então o upload abaixo do piso segue recusado.
 */
export async function escalaAtePiso(
  buffer: Buffer,
  larguraAlvoPx: number = OCR_MIN_TABLE_WIDTH_PX_TELEFONE,
): Promise<Buffer> {
  const larguraTabela = await larguraTabelaAproximada(buffer);
  if (!larguraTabela || larguraTabela >= larguraAlvoPx) return buffer;

  const fator = Math.min(larguraAlvoPx / larguraTabela, FATOR_AMPLIACAO_MAXIMO);
  const metadata = await sharp(buffer).metadata();
  const largura = metadata.width ?? 0;
  if (!largura) return buffer;

  return sharp(buffer)
    .resize({
      width: Math.round(largura * fator),
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
}

/** Opções do pré-processamento. */
export interface PreprocessOpcoes {
  /** Etapas ligadas (padrão: `PREPROCESS_STEPS`). */
  steps?: PreprocessSteps;
  /** Largura alvo da tabela em px (padrão: o piso de telefone, 693 px). */
  larguraTabelaAlvoPx?: number;
}

/** Dimensões da imagem (o `sharp` não devolve isso junto com o buffer). */
export async function dimensoesImagem(
  buffer: Buffer,
): Promise<{ larguraPx: number; alturaPx: number }> {
  const metadata = await sharp(buffer).metadata();
  return { larguraPx: metadata.width ?? 0, alturaPx: metadata.height ?? 0 };
}

/**
 * Aplica o pré-processamento e devolve a imagem pronta para o OCR.
 *
 * A ordem importa: EXIF primeiro (a imagem precisa estar reta para todo o
 * resto), depois o piso (as etapas seguintes trabalham em pixels maiores),
 * depois o desvio, e por fim o contraste/limpeza (grayscale → clahe →
 * normalise → median).
 */
export async function preprocessOcrImage(
  buffer: Buffer,
  opcoes: PreprocessOpcoes = {},
): Promise<Buffer> {
  const steps = opcoes.steps ?? PREPROCESS_STEPS;
  const larguraAlvo = opcoes.larguraTabelaAlvoPx ?? OCR_MIN_TABLE_WIDTH_PX_TELEFONE;

  let atual = buffer;

  if (steps.exifRotate) {
    atual = await sharp(atual).autoOrient().png().toBuffer();
  }

  if (steps.scaleToFloor) {
    atual = await escalaAtePiso(atual, larguraAlvo);
  }

  if (steps.deskew) {
    atual = await corrigirDesvio(atual);
  }

  if (steps.grayscale) {
    atual = await sharp(atual).grayscale().png().toBuffer();
  }

  if (steps.clahe) {
    atual = await sharp(atual)
      .clahe({ width: 8, height: 8, maxSlope: 3 })
      .png()
      .toBuffer();
  }

  if (steps.normalise) {
    atual = await sharp(atual).normalise().png().toBuffer();
  }

  if (steps.median) {
    atual = await sharp(atual).median(3).png().toBuffer();
  }

  return atual;
}
