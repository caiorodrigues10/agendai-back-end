/**
 * Teste do parser de OCR estruturado (`ocr-para-csv.ts`).
 *
 * Roda **sem rede, sem banco** e sem abrir imagem: o texto bruto do OCR
 * usado aqui é **inventado** (nenhum dado real, nenhum valor do ground
 * truth) — serve para provar que o parser trabalha por FORMATO e POSIÇÃO.
 *
 * Duas checagens:
 *   1) o CSV gerado a partir do texto inventado é exatamente o esperado;
 *   2) **nenhum valor do ground truth real aparece dentro do
 *      `ocr-para-csv.ts`** (grep por palavra inteira, sem diferenciar
 *      maiúscula/minúscula). Se o parser voltar a "conhecer a resposta",
 *      este teste falha.
 *
 * Uso (a partir de backend/spikes/ocr-benchmark):
 *   ./node_modules/.bin/tsx dataset-real/test_ocr_para_csv.ts
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PARSERS, csvTexto, type Colunas } from "./ocr-para-csv";

const BASE = dirname(fileURLToPath(import.meta.url));
const GT_DIR = join(BASE, "ground-truth-real");
const FONTE_PARSER = join(BASE, "ocr-para-csv.ts");

const problemas: string[] = [];

function conferir(condicao: boolean, mensagem: string): void {
  if (!condicao) problemas.push(mensagem);
}

function parserPorNome(csv: string): Colunas {
  const achado = PARSERS.find((p) => p.csv === csv);
  if (!achado) throw new Error(`parser nao encontrado: ${csv}`);
  return achado;
}

// ── 1) CSV gerado a partir de texto bruto INVENTADO ──────────────────────────

const TEXTO_PROCESSOS = [
  "800.22.1999.12345-6 PENDENTE CIVEL REVISIONAL Fulano 05/03/2021 R$ 1.234,56",
  "800.22.1999.12345-7 PENDENTE Fulano 06/03/2021 RS 2.345,67",
  "zz 800.22.1999.12345-8 | PENDENTE CIVEL REVISIONAL Fulano 07/03/2021 R$ ~~ 3456",
];

const CSV_PROCESSOS = [
  "numero_processo,status,grupo_acao,tipo_honorario,cliente,data_criacao,valor_total",
  "800.22.1999.12345-6,PENDENTE,CIVEL,REVISIONAL,Fulano,05/03/2021,\"1.234,56\"",
  "800.22.1999.12345-7,PENDENTE,,,Fulano,06/03/2021,\"2.345,67\"",
  "800.22.1999.12345-8,PENDENTE,CIVEL,REVISIONAL,Fulano,07/03/2021,3456",
].join("\n") + "\n";

const TEXTO_SERVICOS = [
  "5 1/Lavagem Xs 25] R$ 16,00 | R$ 28,00 | R$ 31,00 | R$ 17,00",
  "7 2/Lavagem y 40] rs 1000 | R$ 11,00 | R$ 29,00 | R$ 23,00",
];

const CSV_SERVICOS = [
  "id,servico,porte,duracao_min,preco_venda,custo_produto,custo_mao_de_obra,custo_total",
  '1,Lavagem,Xs,25,"16,00","28,00","31,00","17,00"',
  '2,Lavagem,y,40,1000,"11,00","29,00","23,00"',
].join("\n") + "\n";

const TEXTO_DASHBOARD = [
  "PAINEL DE TESTE",
  "ENTRADAS | SAIDAS | BALANCO",
  "R$ 1.111,00 R$ 222,00 R$ 889,00",
  "ITENS X INSUMOS ALFA  BETA",
  "ENTRADAS X INSUMOS (TOP 2)",
  "R$ 3.333,00",
  "R$ 444,44",
];

const CSV_DASHBOARD = [
  "secao,categoria,detalhe,valor",
  ',ENTRADAS,,"1.111,00"',
  ',SAIDAS,,"222,00"',
  ',BALANCO,,"889,00"',
  ",ALFA,1,",
  ",BETA,2,",
  ',ENTRADAS,,"3.333,00"',
  ',INSUMOS,,"444,44"',
].join("\n") + "\n";

const TEXTO_CONTROLE = [
  "AAEE | BB | CC",
  "zz 12/07/21 - qui",
  "nada aproveitavel aqui",
];

const CSV_CONTROLE =
  "data,horario,cliente,funcionario,servico,valor,material_usado,qtd_material,status," +
  "percentual_comissao,valor_comissao,observacoes\n";

const casos: { nome: string; csv: string; texto: string[]; esperado: string }[] = [
  {
    nome: "layout de processos",
    csv: "planilha-para-advogado.csv",
    texto: TEXTO_PROCESSOS,
    esperado: CSV_PROCESSOS,
  },
  {
    nome: "layout de tabela de itens",
    csv: "O-Que-Voce-Encontra-na-Planilha-de-Gestao-de-Petshop.csv",
    texto: TEXTO_SERVICOS,
    esperado: CSV_SERVICOS,
  },
  {
    nome: "layout de dashboard",
    csv: "Planilha-para-Barbearia.csv",
    texto: TEXTO_DASHBOARD,
    esperado: CSV_DASHBOARD,
  },
  {
    nome: "layout sem extracao",
    csv: "planilha-controle-barbearia-1.csv",
    texto: TEXTO_CONTROLE,
    esperado: CSV_CONTROLE,
  },
];

console.log("=== TESTE DO PARSER DE OCR ESTRUTURADO (texto inventado) ===\n");

for (const caso of casos) {
  const obtido = csvTexto(parserPorNome(caso.csv), caso.texto);
  const ok = obtido === caso.esperado;
  console.log(`${caso.nome}: ${ok ? "OK" : "DIVERGENCIA"}`);
  if (!ok) {
    console.log("--- esperado ---");
    console.log(caso.esperado);
    console.log("--- obtido ---");
    console.log(obtido);
    problemas.push(`${caso.nome}: CSV diferente do esperado`);
  }
}

// ── 2) grep: nenhum valor do ground truth dentro do parser ──────────────────

/** CSV minimo com aspas (so o necessario para ler o ground truth). */
function lerCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let celulas: string[] = [];
  let campo = "";
  let dentroDeAspas = false;
  for (let i = 0; i < texto.length; i += 1) {
    const char = texto[i];
    if (dentroDeAspas) {
      if (char === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i += 1;
        } else {
          dentroDeAspas = false;
        }
      } else {
        campo += char;
      }
      continue;
    }
    if (char === '"') {
      dentroDeAspas = true;
    } else if (char === ",") {
      celulas.push(campo);
      campo = "";
    } else if (char === "\n") {
      celulas.push(campo);
      linhas.push(celulas);
      celulas = [];
      campo = "";
    } else {
      campo += char;
    }
  }
  if (campo.length > 0 || celulas.length > 0) {
    celulas.push(campo);
    linhas.push(celulas);
  }
  return linhas;
}

function valoresDoGroundTruth(): string[] {
  const valores = new Set<string>();
  for (const nome of readdirSync(GT_DIR).filter((n) => n.endsWith(".csv"))) {
    const texto = readFileSync(join(GT_DIR, nome), "utf8").replace(/\r\n/g, "\n");
    const [cabecalho, ...corpo] = lerCsv(texto);
    if (!cabecalho) continue;
    const colunas = cabecalho.map((c) => c.trim());
    for (const celulas of corpo) {
      colunas.forEach((coluna, i) => {
        if (coluna === "incerto" || coluna === "revisado") return;
        const valor = (celulas[i] ?? "").trim();
        if (!valor) return;
        valores.add(valor);
      });
    }
  }
  return [...valores];
}

/** Valor "interessante": tem letra ou nao e inteiro puro (nada de "30", "1"). */
function valorInteressante(valor: string): boolean {
  if (valor.length < 3) return false;
  if (/^\d+$/.test(valor)) return false;
  return true;
}

function apareceNoParser(valor: string, fonte: string): boolean {
  const escapado = valor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escapado}\\b`, "i").test(fonte);
}

if (!existsSync(GT_DIR)) {
  console.log("\ngrep do ground truth: PULADO (ground truth real ausente)");
} else {
  const fonte = readFileSync(FONTE_PARSER, "utf8");
  const valores = valoresDoGroundTruth().filter(valorInteressante);
  const encontrados = valores.filter((v) => apareceNoParser(v, fonte));
  console.log(
    `\ngrep do ground truth: ${valores.length} valor(es) conferido(s) no parser — ` +
      (encontrados.length === 0 ? "OK (nenhum literal do GT no .ts)" : "DIVERGENCIA"),
  );
  for (const valor of encontrados) {
    console.log(`  - valor do ground truth dentro do parser: ${valor}`);
    problemas.push(`literal do ground truth no parser: ${valor}`);
  }
}

console.log("\n=== FIM ===");
if (problemas.length > 0) {
  console.log(`PROBLEMAS (${problemas.length}):`);
  for (const p of problemas) console.log(`  - ${p}`);
  process.exitCode = 1;
} else {
  console.log("Tudo bate.");
}
