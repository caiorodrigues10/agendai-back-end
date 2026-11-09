/**
 * Verificador offline da importação CASE_FEES.
 *
 * Roda as funções REAIS do backend (sem banco, sem rede):
 *   - normalizeMoney / normalizeDate / normalizeInteger (rowNormalization.ts)
 *   - parseFeeStatus / feeInstallmentsWarning (processors/caseFeeImporter.ts)
 *
 * Reaplica, linha a linha, as regras de `validateCaseFeeRow`
 * (utils/rowValidator.ts:962-1066) que NÃO dependem do banco e compara o
 * resultado com os arquivos `*.resultado-esperado.csv` da pasta `importacao/`.
 *
 * A checagem de banco (processo já existir em ClientCase / caseSuccessFee) não
 * roda offline: fica declarada na coluna `verificacao_banco`.
 *
 * Uso (a partir de backend/spikes/ocr-benchmark):
 *   npx tsx dataset-real/verificador-importacao.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeDate, normalizeInteger, normalizeMoney } from "@/modules/dataImport/utils/rowNormalization";
import {
  feeInstallmentsWarning,
  parseFeeStatus,
} from "@/modules/dataImport/processors/caseFeeImporter";

const BASE = dirname(fileURLToPath(import.meta.url));
const DIR = join(BASE, "importacao");

const VERIFICACAO_BANCO =
  "processo precisa existir no sistema (caseSuccessFee/ClientCase) — checagem de banco não roda offline";

type LinhaCsv = Record<string, string>;

function lerCsv(caminho: string): LinhaCsv[] {
  const texto = readFileSync(caminho, "utf8").replace(/\r\n/g, "\n");
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
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
      linha.push(campo);
      campo = "";
    } else if (char === "\n") {
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else {
      campo += char;
    }
  }
  if (campo.length > 0 || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }

  const [cabecalho, ...corpo] = linhas.filter((l) => l.length > 1);
  return corpo.map((celulas) => {
    const registro: LinhaCsv = {};
    cabecalho.forEach((nome, indice) => {
      registro[nome] = (celulas[indice] ?? "").trim();
    });
    return registro;
  });
}

function escaparCsv(valores: string[]): string {
  return valores
    .map((valor) => {
      const precisaAspas = valor.includes(",") || valor.includes('"') || valor.includes("\n");
      const escapado = valor.replace(/"/g, '""');
      return precisaAspas ? `"${escapado}"` : escapado;
    })
    .join(",");
}

type Resultado = {
  arquivo: string;
  linha: number;
  status: "VALID" | "FAILED";
  campo: string;
  mensagem: string;
  avisos: string;
  parcelas_efetivas: number;
  verificacao_banco: string;
  percent_bruto: string;
  percent_efetivo: string;
};

function validarLinha(arquivo: string, numeroLinha: number, row: LinhaCsv): Resultado {
  const avisos: string[] = [];
  let status: "VALID" | "FAILED" = "VALID";
  let campo = "";
  let mensagem = "";
  let parcelasEfetivas = 1;
  let percentBruto = "";
  let percentEfetivo = "";

  // rowValidator.ts:968-979 — número do processo (ou apelido) é obrigatório.
  const caseNumber = (row.caseNumber ?? "").slice(0, 30);
  const caseName = (row.caseName ?? "").slice(0, 120);
  if (!caseNumber && !caseName) {
    status = "FAILED";
    campo = "caseNumber";
    mensagem = "Número do processo ou apelido do caso é obrigatório.";
  }

  // rowValidator.ts:1039-1047 — percentual obrigatório, entre 0 e 100.
  if (status === "VALID") {
    const rawPercent = (row.percent ?? "").trim();
    percentBruto = rawPercent;
    const percent = rawPercent ? normalizeMoney(rawPercent) : null;
    if (percent === null || percent < 0 || percent > 100) {
      status = "FAILED";
      campo = "percent";
      mensagem = "Percentual do honorário é obrigatório e deve estar entre 0 e 100.";
    } else {
      percentEfetivo = String(percent);
    }
  }

  // rowValidator.ts:1049-1052 — situação desconhecida vira PENDING com aviso.
  if (status === "VALID") {
    const parsed = parseFeeStatus(row.feeStatus ?? "");
    if (parsed.warning) avisos.push(parsed.warning);
  }

  // rowValidator.ts:1049-1057 — vencimento dd/mm/aaaa.
  if (status === "VALID") {
    const rawDueDate = (row.feeDueDate ?? "").trim();
    if (rawDueDate && !normalizeDate(rawDueDate)) {
      status = "FAILED";
      campo = "feeDueDate";
      mensagem = "Data de vencimento inválida. Use dd/mm/aaaa.";
    }
  }

  // rowValidator.ts:1059-1061 — parcelas: só 1 é aceita (o resto é aviso).
  // A linha que já falhou antes não chega até aqui (retorno antecipado no
  // validador), então não gera aviso.
  if (status === "VALID") {
    const rawInstallments = (row.feeInstallments ?? "").trim();
    const parcelas = rawInstallments ? feeInstallmentsWarning(rawInstallments) : { value: 1 };
    if (parcelas?.warning) avisos.push(parcelas.warning);
    parcelasEfetivas = parcelas?.value ?? 1;
  }

  return {
    arquivo,
    linha: numeroLinha,
    status,
    campo,
    mensagem,
    avisos: avisos.join(" | "),
    parcelas_efetivas: parcelasEfetivas,
    verificacao_banco: VERIFICACAO_BANCO,
    percent_bruto: percentBruto,
    percent_efetivo: percentEfetivo,
  };
}

function comparar(
  obtained: Resultado[],
  esperado: LinhaCsv[],
  rotulo: string,
): string[] {
  const problemas: string[] = [];
  if (obtained.length !== esperado.length) {
    problemas.push(`${rotulo}: ${obtained.length} linha(s) obtida(s) x ${esperado.length} esperada(s)`);
  }
  const total = Math.max(obtained.length, esperado.length);
  for (let i = 0; i < total; i += 1) {
    const obtido = obtained[i];
    const espera = esperado[i];
    if (!obtido || !espera) {
      problemas.push(`${rotulo}: linha ${i + 1} não existe nos dois lados`);
      continue;
    }
    const comparacoes: [string, string, string][] = [
      ["arquivo", obtido.arquivo, espera.arquivo ?? ""],
      ["linha", String(obtido.linha), espera.linha ?? ""],
      ["status", obtido.status, espera.status ?? ""],
      ["campo", obtido.campo, espera.campo ?? ""],
      ["mensagem", obtido.mensagem, espera.mensagem ?? ""],
      ["avisos", obtido.avisos, espera.avisos ?? ""],
      ["parcelas_efetivas", String(obtido.parcelas_efetivas), espera.parcelas_efetivas ?? ""],
      ["verificacao_banco", obtido.verificacao_banco, espera.verificacao_banco ?? ""],
    ];
    for (const [campo, a, b] of comparacoes) {
      if (a !== b) {
        problemas.push(`${rotulo} linha ${i + 1} campo ${campo}: obtido "${a}" x esperado "${b}"`);
      }
    }
  }
  return problemas;
}

function main(): void {
  const arquivos = readdirSync(DIR).filter((nome) => nome.endsWith(".import.csv")).sort();
  const problemas: string[] = [];
  const todos: Resultado[] = [];

  console.log("=== VERIFICACAO OFFLINE DA IMPORTACAO CASE_FEES ===");
  console.log("(funcoes reais do backend; sem banco, sem rede)\n");

  for (const nome of arquivos) {
    const caso = nome.replace(".import.csv", "");
    const linhas = lerCsv(join(DIR, nome));
    const obtidos = linhas.map((row, indice) => validarLinha(caso, indice + 1, row));
    todos.push(...obtidos);

    const esperado = lerCsv(join(DIR, `${caso}.resultado-esperado.csv`));
    const difs = comparar(obtidos, esperado, caso);
    problemas.push(...difs);

    console.log(`${caso}: ${obtidos.length} linha(s) — ${difs.length === 0 ? "OK" : "DIVERGENCIA"}`);
    for (const r of obtidos) {
      const percent = r.percent_efetivo ? `percent=${r.percent_efetivo}` : "percent=-";
      console.log(
        `  linha ${r.linha}: ${r.status}${r.campo ? ` (${r.campo})` : ""} | ${percent} | parcelas=${r.parcelas_efetivas}` +
          (r.avisos ? ` | avisos: ${r.avisos}` : ""),
      );
    }
  }

  // O arquivo agregado tem que ser a concatenacao dos casos.
  const agregadoEsperado = lerCsv(join(DIR, "resultado-esperado.csv"));
  const agregadoObtido = todos.map((r) => ({
    arquivo: r.arquivo,
    linha: String(r.linha),
    status: r.status,
    campo: r.campo,
    mensagem: r.mensagem,
    avisos: r.avisos,
    parcelas_efetivas: String(r.parcelas_efetivas),
    verificacao_banco: r.verificacao_banco,
  }));
  const difsAgregado = comparar(
    agregadoObtido as unknown as Resultado[],
    agregadoEsperado,
    "resultado-esperado.csv (agregado)",
  );
  problemas.push(...difsAgregado);
  console.log(`\nresultado-esperado.csv (agregado): ${difsAgregado.length === 0 ? "OK" : "DIVERGENCIA"}`);

  // O import.csv agregado tem que ser a concatenacao dos casos.
  const agregadoImport = lerCsv(join(DIR, "import.csv"));
  const linhasImport = arquivos.flatMap((nome) => lerCsv(join(DIR, nome)));
  if (agregadoImport.length !== linhasImport.length) {
    problemas.push(
      `import.csv (agregado): ${agregadoImport.length} linha(s) x ${linhasImport.length} concatenada(s)`,
    );
  }
  console.log(`import.csv (agregado): ${agregadoImport.length} linha(s)`);

  // Caso do percentual: "11.0" tem que virar 11 (e nunca 11,0 ou 110).
  console.log("\nPERCENTUAL (normalizeMoney):");
  for (const bruto of ["11.0", "11", "11,0", "8.0", "21.0", "150"]) {
    const valor = normalizeMoney(bruto);
    console.log(`  "${bruto}" -> ${valor === null ? "null" : valor}`);
  }
  const percentuais = todos.filter((r) => r.percent_efetivo !== "");
  const comDecimal = percentuais.filter((r) => r.percent_efetivo.includes("."));
  if (comDecimal.length > 0) {
    problemas.push(`percentual com decimal no resultado: ${comDecimal.map((r) => r.percent_efetivo).join(", ")}`);
  }

  // "11.0" e "11" sao o mesmo percentual (11), nao 11,0 nem 110.
  const onzeComDecimal = normalizeMoney("11.0");
  const onzeInteiro = normalizeMoney("11");
  if (onzeComDecimal !== 11 || onzeInteiro !== 11 || onzeComDecimal !== onzeInteiro) {
    problemas.push(
      `percentual "11.0" -> ${onzeComDecimal} x "11" -> ${onzeInteiro} (tem que dar 11 nos dois)`,
    );
  }
  for (const r of todos) {
    if (r.percent_bruto === "11.0" && r.percent_efetivo !== "11") {
      problemas.push(
        `${r.arquivo} linha ${r.linha}: percent bruto "11.0" virou "${r.percent_efetivo}" (tem que ser "11")`,
      );
    }
  }
  console.log(
    `  comparacao "11.0" x "11": ${onzeComDecimal} x ${onzeInteiro} -> ` +
      (onzeComDecimal === onzeInteiro && onzeComDecimal === 11 ? "OK" : "DIVERGENCIA"),
  );

  console.log("\n=== FIM ===");
  if (problemas.length > 0) {
    console.log(`DIVERGENCIAS (${problemas.length}):`);
    for (const p of problemas) console.log(`  - ${p}`);
    process.exitCode = 1;
    return;
  }
  console.log("Tudo bate com os resultados esperados.");
}

main();
