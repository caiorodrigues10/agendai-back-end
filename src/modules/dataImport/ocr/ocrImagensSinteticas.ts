/**
 * Imagens **sintéticas** para testar o OCR.
 *
 * São tabelas desenhadas com texto (SVG → PNG) geradas em memória: nenhuma
 * foto real entra no repositório nem no teste. O tamanho da tabela é
 * controlado pelo gerador — é o que permite testar o piso de resolução
 * (693 px para telefone, 924 px para valor) sem depender de imagem de
 * ninguém.
 */
import { Resvg } from "@resvg/resvg-js";

export interface ImagemSintetica {
  /** Nome do arquivo de teste. */
  nome: string;
  /** PNG em memória. */
  buffer: Buffer;
  /** Largura da imagem em pixels. */
  larguraPx: number;
  /** Altura da imagem em pixels. */
  alturaPx: number;
  /** Largura da tabela desenhada (a régua do piso de resolução). */
  larguraTabelaPx: number;
}

/** Campos que as tabelas sintéticas carregam (para medir o OCR). */
export type CampoSintetico =
  | "nome"
  | "telefone"
  | "valor"
  | "servico"
  | "preco"
  | "duracao";

/** Coluna da tabela sintética: o índice da coluna e o campo medido. */
export interface ColunaSintetica {
  indice: number;
  campo: CampoSintetico;
}

/**
 * Definição de uma tabela sintética: serve **tanto** para desenhar a imagem
 * **quanto** para saber o valor certo de cada célula (ground truth).
 *
 * Fonte única de verdade: a imagem e a resposta esperada não podem divergir.
 */
export interface TabelaSinteticaDef {
  nome: string;
  larguraPx: number;
  titulo: string;
  cabecalhos: string[];
  colunas: ColunaSintetica[];
  linhas: string[][];
}

/** As tabelas sintéticas usadas nos testes e no benchmark do OCR. */
export const TABELAS_SINTETICAS: TabelaSinteticaDef[] = [
  {
    nome: "clientes-larga.png",
    larguraPx: 1200,
    titulo: "Clientes",
    cabecalhos: ["Nome", "Telefone", "Valor"],
    colunas: [
      { indice: 0, campo: "nome" },
      { indice: 1, campo: "telefone" },
      { indice: 2, campo: "valor" },
    ],
    linhas: [
      ["Ana Souza", "11987654321", "120,00"],
      ["Bruno Lima", "11976543210", "80,50"],
      ["Carla Dias", "11965432109", "45,00"],
    ],
  },
  {
    nome: "clientes-estreita.png",
    larguraPx: 500,
    titulo: "Clientes",
    cabecalhos: ["Nome", "Telefone"],
    colunas: [
      { indice: 0, campo: "nome" },
      { indice: 1, campo: "telefone" },
    ],
    linhas: [["Ana Souza", "11987654321"]],
  },
  {
    nome: "servicos.png",
    larguraPx: 1100,
    titulo: "Servicos",
    cabecalhos: ["Servico", "Preco", "Duracao"],
    colunas: [
      { indice: 0, campo: "servico" },
      { indice: 1, campo: "preco" },
      { indice: 2, campo: "duracao" },
    ],
    linhas: [
      ["Corte", "60,00", "30"],
      ["Barba", "40,00", "20"],
    ],
  },
];

/** Ground truth das tabelas sintéticas (cópia, para ninguém mutar a fonte). */
export function groundTruthSinteticas(): TabelaSinteticaDef[] {
  return TABELAS_SINTETICAS.map((tabela) => ({
    ...tabela,
    cabecalhos: [...tabela.cabecalhos],
    colunas: tabela.colunas.map((coluna) => ({ ...coluna })),
    linhas: tabela.linhas.map((linha) => [...linha]),
  }));
}

/** Escapa o texto que entra no SVG. */
function escaparXml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Desenha uma tabela de texto e devolve o PNG em memória. */
export function gerarTabelaSintetica(params: {
  nome: string;
  larguraPx: number;
  titulo: string;
  cabecalhos: string[];
  linhas: string[][];
  margemPx?: number;
}): ImagemSintetica {
  const margem = params.margemPx ?? 24;
  const alturaLinha = 34;
  const altura = margem * 2 + alturaLinha * (params.linhas.length + 2);
  const larguraTabela = params.larguraPx - margem * 2;

  const colunas = Math.max(params.cabecalhos.length, 1);
  const larguraColuna = Math.floor(larguraTabela / colunas);

  const linhasSvg: string[] = [];
  linhasSvg.push(
    `<text x="${margem}" y="${margem + 24}" font-size="22" font-family="sans-serif" fill="#000">${escaparXml(params.titulo)}</text>`,
  );
  params.cabecalhos.forEach((cabecalho, indice) => {
    linhasSvg.push(
      `<text x="${margem + indice * larguraColuna}" y="${margem + alturaLinha + 24}" font-size="18" font-family="sans-serif" fill="#000">${escaparXml(cabecalho)}</text>`,
    );
  });
  params.linhas.forEach((linha, indiceLinha) => {
    linha.forEach((valor, indiceColuna) => {
      linhasSvg.push(
        `<text x="${margem + indiceColuna * larguraColuna}" y="${margem + alturaLinha * (indiceLinha + 2) + 24}" font-size="18" font-family="sans-serif" fill="#000">${escaparXml(valor)}</text>`,
      );
    });
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${params.larguraPx}" height="${altura}" viewBox="0 0 ${params.larguraPx} ${altura}"><rect width="100%" height="100%" fill="#fff"/>${linhasSvg.join("")}</svg>`;

  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: params.larguraPx },
    font: { loadSystemFonts: true, defaultFontFamily: "sans-serif" },
  })
    .render()
    .asPng();

  return {
    nome: params.nome,
    buffer: png,
    larguraPx: params.larguraPx,
    alturaPx: altura,
    larguraTabelaPx: larguraTabela,
  };
}

/**
 * As três imagens sintéticas usadas nos testes:
 *   1. clientes com telefone e valor, tabela larga (acima do piso);
 *   2. clientes com tabela estreita (abaixo do piso de 693 px);
 *   3. serviços com nome, preço e duração.
 */
export function gerarImagensSinteticas(): ImagemSintetica[] {
  return TABELAS_SINTETICAS.map((tabela) =>
    gerarTabelaSintetica({
      nome: tabela.nome,
      larguraPx: tabela.larguraPx,
      titulo: tabela.titulo,
      cabecalhos: tabela.cabecalhos,
      linhas: tabela.linhas,
    }),
  );
}
