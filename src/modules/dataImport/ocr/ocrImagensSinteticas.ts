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
  return [
    gerarTabelaSintetica({
      nome: "clientes-larga.png",
      larguraPx: 1200,
      titulo: "Clientes",
      cabecalhos: ["Nome", "Telefone", "Valor"],
      linhas: [
        ["Ana Souza", "11987654321", "120,00"],
        ["Bruno Lima", "11976543210", "80,50"],
        ["Carla Dias", "11965432109", "45,00"],
      ],
    }),
    gerarTabelaSintetica({
      nome: "clientes-estreita.png",
      larguraPx: 500,
      titulo: "Clientes",
      cabecalhos: ["Nome", "Telefone"],
      linhas: [["Ana Souza", "11987654321"]],
    }),
    gerarTabelaSintetica({
      nome: "servicos.png",
      larguraPx: 1100,
      titulo: "Servicos",
      cabecalhos: ["Servico", "Preco", "Duracao"],
      linhas: [
        ["Corte", "60,00", "30"],
        ["Barba", "40,00", "20"],
      ],
    }),
  ];
}
