/**
 * Gera o OCR **ESTRUTURADO** (CSV) das imagens reais a partir do texto bruto
 * do OCR local.
 *
 * Entrada : `ocr-output-real/<arquivo>.a-tesseract-texto.txt` (texto bruto).
 * Saída   : `ocr-output-real/<arquivo>.csv` — **mesmas colunas do ground
 *           truth** (`ground-truth-real/<arquivo>.csv`), para o `eval.py
 *           --real` comparar linha a linha.
 *
 * Regras do parser (Sessão 5):
 *   • **Nenhum valor do ground truth pode estar neste arquivo.** Os parsers
 *     trabalham com FORMATO (nº de processo, data, moeda com R$/RS) e com a
 *     POSIÇÃO das colunas — nunca com o texto esperado da resposta. O teste
 *     `test_ocr_para_csv.ts` faz o grep dos valores do GT dentro deste
 *     arquivo e falha se algum aparecer.
 *   • o texto do OCR sai **verbatim**: não se arruma maiúscula/minúscula,
 *     não se corrige número, não se completa célula. O erro do OCR tem que
 *     aparecer no placar (inclusive "m" onde o ground truth tem "M").
 *   • quando não dá para extrair um campo sem conhecer a resposta, o campo
 *     fica **vazio** (célula vazia no CSV, não valor inventado).
 *   • cada imagem tem um parser próprio (os esquemas são diferentes); o
 *     parser genérico do `src/ocr-utils.ts` (`splitLine`) é do dataset
 *     sintético (nome/telefone/valor) e não serve aqui — só a detecção de
 *     token monetário (`looksLikeMoney`) é reaproveitada.
 *
 * Uso (a partir de backend/spikes/ocr-benchmark):
 *   ./node_modules/.bin/tsx dataset-real/ocr-para-csv.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { looksLikeMoney } from "../src/ocr-utils";

const BASE = dirname(fileURLToPath(import.meta.url));
const DIR = join(BASE, "ocr-output-real");

export type Linha = Record<string, string>;

export interface Colunas {
  csv: string;
  colunas: string[];
  parse: (linhasTexto: string[]) => Linha[];
}

/**
 * Formatos reconhecidos (genéricos — nenhum número do ground truth aqui):
 *   • processo: N.NN.NNNN.NNNNN-D (o formato "Nº Processo" das planilhas)
 *   • data: dd/mm/aaaa
 */
const RE_PROCESSO = /\b\d{2,4}\.\d{2}\.\d{4}\.\d{4,6}-\d{1,2}\b/;
const RE_DATA = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/;
/** Token só de letras (até 5) — usado como rótulo de coluna curta. */
const RE_ROTULO_CURTO = /^[A-Za-zÀ-ÿ]{1,5}$/;

/** Tira o símbolo de moeda e mantém o resto do token verbatim. */
function dinheiro(bruto: string): string {
  return bruto.replace(/r\$/gi, "").replace(/^rs\s*/i, "").replace(/\s+/g, " ").trim();
}

interface TokenDinheiro {
  valor: string;
  /** Índice do token na lista de palavras da linha. */
  indice: number;
}

/**
 * Tokens monetários de uma linha, na ordem em que aparecem.
 *
 * Cuidado: a **vírgula** é separador decimal em pt-BR — só as vírgulas
 * soltas (separador estrutural de coluna) saem; a de dentro do número fica.
 */
export function tokensDinheiro(linha: string): TokenDinheiro[] {
  const tokens = linha.split(/\s+/).filter(Boolean);
  const saida: TokenDinheiro[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const limpo = token.replace(/[|;)\]}]/g, "").replace(/,$/, "");
    if (!limpo) continue;
    // "R$" ou "RS" soltos: junta com o token seguinte.
    if (/^(r\$|rs)$/i.test(limpo)) {
      const proximo = (tokens[i + 1] ?? "").replace(/[|;)\]}]/g, "").replace(/,$/, "");
      if (proximo && /\d/.test(proximo) && looksLikeMoney(proximo)) {
        saida.push({ valor: dinheiro(`${limpo} ${proximo}`), indice: i + 1 });
        i += 1;
      }
      continue;
    }
    if (/^(r\$|rs)/i.test(limpo) && /\d/.test(limpo)) {
      saida.push({ valor: dinheiro(limpo), indice: i });
      continue;
    }
    if (
      looksLikeMoney(limpo) &&
      /\d/.test(limpo) &&
      !/^\d{1,3}$/.test(limpo) &&
      /^[0-9][0-9.,]*$/.test(limpo)
    ) {
      saida.push({ valor: limpo, indice: i });
    }
  }
  return saida;
}

/** Palavras em caixa alta (rótulos de gráfico), sem número e sem acento solto. */
function palavrasCaixaAlta(linha: string): string[] {
  return (linha.match(/[A-ZÀ-Ü]{3,}/g) ?? []).filter((p) => /^[A-ZÀ-Ü]+$/.test(p));
}

/** Título no formato "PALAVRA X PALAVRA" (os dois lados do "X"). */
function tituloX(linha: string): { esquerda: string; direita: string; resto: string } | null {
  const m = /\b([A-ZÀ-Ü]{3,})\s+X\s+([A-ZÀ-Ü]{3,})\b(.*)$/.exec(linha);
  if (!m) return null;
  return { esquerda: m[1], direita: m[2], resto: m[3] ?? "" };
}

// ── parser 1: planilha de processos ──────────────────────────────────────────
//
// Layout (lido do OCR): [numero do processo] [colunas de texto ...] [data]
// [valor]. As colunas de texto são mapeadas por POSIÇÃO: a primeira é a
// coluna de status, a última é a de cliente; as do meio (opcionais) só são
// mapeadas quando a linha tem o mesmo número de colunas que a linha mais
// completa do arquivo — senão é ambíguo e o campo fica vazio.
const processos: Colunas = {
  csv: "planilha-para-advogado.csv",
  colunas: ["numero_processo", "status", "grupo_acao", "tipo_honorario", "cliente",
    "data_criacao", "valor_total"],
  parse(linhasTexto) {
    const registros: { processo: string; meio: string[]; data: string; valor: string }[] = [];
    for (const linha of linhasTexto) {
      const tokens = linha.split(/\s+/).filter(Boolean);
      const idxProcesso = tokens.findIndex((t) => RE_PROCESSO.test(t));
      if (idxProcesso < 0) continue;
      const idxData = tokens.findIndex((t) => RE_DATA.test(t));
      if (idxData < 0 || idxData < idxProcesso) continue;
      const meio = tokens.slice(idxProcesso + 1, idxData).filter((t) => /[A-Za-zÀ-ÿ]/.test(t));
      const processo = RE_PROCESSO.exec(tokens[idxProcesso])?.[0] ?? "";
      // O numero do processo tambem "parece" dinheiro (pontos e digitos):
      // o valor vem do token com R$/RS; se nao houver, de um token que
      // nao seja o numero do processo.
      const valor =
        /(?:r\$|rs)\s*([\d.,]+)/i.exec(linha)?.[1] ??
        tokensDinheiro(linha).find((t) => !RE_PROCESSO.test(t.valor))?.valor ??
        "";
      registros.push({
        processo,
        meio,
        data: RE_DATA.exec(tokens[idxData])?.[0] ?? "",
        valor,
      });
    }

    const maxCampos = registros.reduce((max, r) => Math.max(max, r.meio.length), 0);
    return registros.map((r) => {
      const n = r.meio.length;
      const completo = n === maxCampos;
      const opcionais = completo ? r.meio.slice(1, n - 1) : [];
      return {
        numero_processo: r.processo,
        status: r.meio[0] ?? "",
        grupo_acao: opcionais[0] ?? "",
        tipo_honorario: opcionais[1] ?? "",
        cliente: n > 0 ? r.meio[n - 1] : "",
        data_criacao: r.data,
        valor_total: r.valor,
      };
    });
  },
};

// ── parser 2: tabela de itens (id | item | porte | duracao | valores) ─────────
//
// O "porte" é o rótulo curto que vem imediatamente antes da duração; a
// duração é o último número antes do primeiro valor. Sem rótulo reconhecível
// (o OCR leu número/emoji no lugar), a coluna fica vazia.
const tabelaServicos: Colunas = {
  csv: "O-Que-Voce-Encontra-na-Planilha-de-Gestao-de-Petshop.csv",
  colunas: ["id", "servico", "porte", "duracao_min", "preco_venda",
    "custo_produto", "custo_mao_de_obra", "custo_total"],
  parse(linhasTexto) {
    const saida: Linha[] = [];
    for (const linha of linhasTexto) {
      // A coluna de indices da planilha vem antes do id:
      // "5 1/Item P 30] RS 12,34 | ..." -> o "5" e o indice, o "1" e o id
      // (as vezes colado no item: "1/Item"; as vezes lido como letra).
      const m = /^(\d+)\s+(.*)$/.exec(linha);
      if (!m) continue;
      let resto = m[2];
      let id = "";
      const digitos = /^(\d+)/.exec(resto);
      if (digitos) {
        id = digitos[1];
        resto = resto.slice(digitos[0].length);
      } else {
        const letra = /^([A-Za-z])/.exec(resto);
        if (letra) {
          id = letra[1];
          resto = resto.slice(letra[0].length);
        }
      }
      resto = resto.replace(/^[\[\]|/]+/, "").trim();

      const tokens = resto.split(/\s+/).filter(Boolean);
      const valores = tokensDinheiro(resto);
      // Linha sem nenhum valor e cabecalho/ruido do OCR, nao e dado da planilha.
      if (valores.length === 0) continue;

      const antes = tokens.slice(0, valores[0].indice);
      let idxDuracao = -1;
      for (let i = antes.length - 1; i >= 0; i -= 1) {
        if (/\d/.test(antes[i])) {
          idxDuracao = i;
          break;
        }
      }
      let duracao = "";
      let porte = "";
      let servico = "";
      if (idxDuracao >= 0) {
        duracao = antes[idxDuracao].replace(/[^\d]/g, "");
        const anterior = (idxDuracao > 0 ? antes[idxDuracao - 1] : "").replace(/[|[\]()]/g, "");
        if (RE_ROTULO_CURTO.test(anterior)) {
          porte = anterior;
          servico = antes.slice(0, idxDuracao - 1).join(" ");
        } else {
          // O token antes da duracao nao e um rotulo: ele nao faz parte do
          // nome do servico (o OCR costuma ler o "porte" como numero).
          servico = antes.slice(0, Math.max(idxDuracao - 1, 0)).join(" ");
        }
      } else {
        servico = antes.join(" ");
      }
      saida.push({
        id,
        servico: servico.replace(/^[[({/]+/, "").replace(/[|\]]+$/, "").trim(),
        porte,
        duracao_min: duracao,
        preco_venda: valores[0]?.valor ?? "",
        custo_produto: valores[1]?.valor ?? "",
        custo_mao_de_obra: valores[2]?.valor ?? "",
        custo_total: valores[3]?.valor ?? "",
      });
    }
    return saida;
  },
};

// ── parser 3: dashboard (indicadores | bloco "X" | legendas do top) ──────────
//
// A coluna "secao" do ground truth e um **agrupamento da transcricao** (nao
// existe na imagem): o parser nao a inventa, ela fica vazia. Os rotulos sao
// os textos do proprio OCR, verbatim (sem mexer na caixa).
const dashboard: Colunas = {
  csv: "Planilha-para-Barbearia.csv",
  colunas: ["secao", "categoria", "detalhe", "valor"],
  parse(linhasTexto) {
    const saida: Linha[] = [];

    // Percorre o texto uma vez. Regras:
    //   • linha com "A X B" -> abre um bloco com os rotulos A e B; o texto
    //     que sobra na linha e a legenda do top (rotulo, sem valor);
    //   • a PRIMEIRA linha com valores monetarios e o bloco de indicadores:
    //     os rotulos vem da linha de cabecalho imediatamente acima (as
    //     palavras em caixa alta que vem antes do "X");
    //   • as outras linhas com valores sao os totais do bloco: o 1o valor
    //     usa o rotulo da esquerda do "X" e o 2o o da direita.
    let titulo: { esquerda: string; direita: string } | null = null;
    let usadosNoBloco = 0;
    let primeiraLinhaDeValor = true;
    let posicaoLegenda = 0;

    for (let indice = 0; indice < linhasTexto.length; indice += 1) {
      const linha = linhasTexto[indice];
      const t = tituloX(linha);
      if (t) {
        titulo = { esquerda: t.esquerda, direita: t.direita };
        usadosNoBloco = 0;
        // Legenda do top: o texto depois do titulo, quebrado por separador
        // de coluna. O valor nao sobreviveu no OCR: fica vazio e a
        // "detalhe" recebe a posicao (1, 2, 3...).
        const rotulos = t.resto
          .split(/\s{2,}|\s*\|\s*/)
          .map((r) => r.replace(/[~^_*]+/g, " ").replace(/\s+/g, " ").trim())
          .filter((r) => /^[A-Za-zÀ-ÿ+ ]{3,}$/.test(r));
        for (const rotulo of rotulos) {
          posicaoLegenda += 1;
          saida.push({ secao: "", categoria: rotulo, detalhe: String(posicaoLegenda), valor: "" });
        }
        continue;
      }

      const valores = tokensDinheiro(linha);
      if (valores.length === 0) continue;

      if (primeiraLinhaDeValor) {
        const cabecalho = linhasTexto[indice - 1] ?? "";
        const antesDoX = cabecalho.split(/\bX\b/)[0] ?? "";
        const rotulos = palavrasCaixaAlta(antesDoX);
        valores.forEach((v, i) => {
          saida.push({ secao: "", categoria: rotulos[i] ?? "", detalhe: "", valor: v.valor });
        });
        primeiraLinhaDeValor = false;
        continue;
      }

      for (const v of valores) {
        const rotulo = usadosNoBloco === 0 ? titulo?.esquerda ?? "" : titulo?.direita ?? "";
        usadosNoBloco += 1;
        saida.push({ secao: "", categoria: rotulo, detalhe: "", valor: v.valor });
      }
    }
    return saida;
  },
};

// ── parser 4: controle da barbearia (o texto do Tesseract e ruido) ───────────
//
// O Tesseract nao extraiu nenhuma linha utilizavel desta imagem
// (ver ocr-output-real/planilha-controle-barbearia-1.a-tesseract-texto.txt).
// Inventar linhas aqui seria fabricar dado: devolve vazio de proposito.
const controle: Colunas = {
  csv: "planilha-controle-barbearia-1.csv",
  colunas: ["data", "horario", "cliente", "funcionario", "servico", "valor",
    "material_usado", "qtd_material", "status", "percentual_comissao",
    "valor_comissao", "observacoes"],
  parse() {
    return [];
  },
};

export const PARSERS: Colunas[] = [processos, tabelaServicos, dashboard, controle];

export function escapar(valor: string): string {
  if (/[",\n]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`;
  return valor;
}

/** CSV completo (cabeçalho + linhas) de um parser sobre um texto de OCR. */
export function csvTexto(parser: Colunas, linhasTexto: string[]): string {
  const linhas = parser.parse(linhasTexto);
  const cabecalho = parser.colunas.join(",");
  const corpo = linhas.map((l) => parser.colunas.map((c) => escapar(l[c] ?? "")).join(","));
  return `${[cabecalho, ...corpo].join("\n")}\n`;
}

function main(): void {
  if (!existsSync(DIR)) {
    console.error(`pasta ausente: ${DIR} (rode antes o ocr-local.ts)`);
    process.exitCode = 1;
    return;
  }
  console.log("=== OCR ESTRUTURADO (CSV) A PARTIR DO TEXTO DO OCR LOCAL ===\n");

  for (const parser of PARSERS) {
    const base = parser.csv.replace(/\.csv$/, "");
    const bruto = join(DIR, `${base}.a-tesseract-texto.txt`);
    if (!existsSync(bruto)) {
      console.log(`${parser.csv}: sem texto bruto (pulando)`);
      continue;
    }
    const linhasTexto = readFileSync(bruto, "utf8")
      .split("\n")
      .map((l) => l.replace(/\r/g, "").trim())
      .filter(Boolean);
    const linhas = parser.parse(linhasTexto);

    const cabecalho = parser.colunas.join(",");
    const corpo = linhas.map((l) => parser.colunas.map((c) => escapar(l[c] ?? "")).join(","));
    writeFileSync(join(DIR, parser.csv), `${[cabecalho, ...corpo].join("\n")}\n`, "utf8");

    const preenchidas = linhas.reduce(
      (total, l) => total + parser.colunas.filter((c) => (l[c] ?? "") !== "").length,
      0,
    );
    const possiveis = linhas.length * parser.colunas.length;
    const taxa = possiveis ? ((preenchidas / possiveis) * 100).toFixed(1) : "0.0";
    console.log(
      `${parser.csv}: ${linhas.length} linha(s) extraida(s) de ${linhasTexto.length} linha(s) de OCR | ` +
        `${preenchidas}/${possiveis} celulas preenchidas (${taxa}%)`,
    );
  }
  console.log("\n=== FIM ===");
}

const executadoDireto =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (executadoDireto) main();
