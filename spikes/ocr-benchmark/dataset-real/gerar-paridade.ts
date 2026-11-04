/**
 * Gera o fixture de PARIDADE Python x TypeScript dos normalizadores.
 *
 * Roda as funções REAIS do backend (sem banco, sem rede):
 *   - normalizeMoney  (rowNormalization.ts:161)
 *   - normalizePhone  (rowNormalization.ts:134)
 *   - checkCnjCheckDigit (shared/utils/cnj.ts:3)
 *   - parseFeeStatus  (caseFeeImporter.ts:43 — FEE_STATUS_MAP)
 *
 * sobre uma lista FIXA de casos e grava `paridade-normalizadores.json`.
 * O `test_eval.py` lê esse JSON e compara cada saída com a porta Python:
 * qualquer divergência faz o teste falhar.
 *
 * Uso (a partir de backend/spikes/ocr-benchmark):
 *   ./node_modules/.bin/tsx dataset-real/gerar-paridade.ts
 *
 * Regerar o fixture depois de mexer nos normalizadores do backend:
 *   ./node_modules/.bin/tsx dataset-real/gerar-paridade.ts
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeMoney, normalizePhone } from "@/modules/dataImport/utils/rowNormalization";
import { parseFeeStatus } from "@/modules/dataImport/processors/caseFeeImporter";
import { checkCnjCheckDigit } from "@/shared/utils/cnj";

const BASE = dirname(fileURLToPath(import.meta.url));
const SAIDA = join(BASE, "paridade-normalizadores.json");

// Lista fixa de casos. Não mudar sem regenerar o JSON e rever o test_eval.py.
const CASOS_MONEY = [
  "11.0",
  "11",
  "11,0",
  "1.250,00",
  "1250,00",
  "1.250.00",
  "R$ 1.250,00",
  // (o "R$ 1.250,00" duplicado foi removido: o mesmo input duas vezes não
  //  acrescenta cobertura, só ruído no fixture)
  "20%",
  "150",
  "0",
  "0,005",
  "-10",
  "abc",
  "1e3",
  "",
];

const CASOS_PHONE = [
  "85962663254",
  "(85) 96266-3254",
  "5585962663254",
  "55 85 96266-3254",
  "085962663254",
  "11988887777",
  "5511988887777",
  "859626632540",
  "00000000000",
  // Telefone do ground truth sintético (10 dígitos) e as duas grafias dele:
  "8526328043",
  "(85) 2632-8043",
  // ... e a leitura errada do OCR simulado (9 dígitos).
  "852632804",
  "",
];

const CASOS_CNJ = [
  "0208938-20.2025.8.26.0100", // DV válido
  "0210811-55.2025.8.26.0100", // DV válido
  "0046868-56.2025.8.26.0100", // DV válido
  "0208938-21.2025.8.26.0100", // DV inválido
  "0210811-15.2025.8.26.0100", // DV inválido
  "123.45.6789.01234-5", // 15 dígitos -> unknown (sintético, fora do GT real)
  "0208938-20.2025.8.26.010", // 19 dígitos -> unknown
  "",
];

type Caso = { entrada: string; saida: string | number | null };
type CasoStatus = { entrada: string; saida: { value: string; warning?: string } };

// `status` (feeStatus): casos CONHECIDOS pelo FEE_STATUS_MAP (aceitos) e
// DESCONHECIDOS (viram PENDING com aviso). O eval.py portou parseFeeStatus.
const CASOS_STATUS = [
  "pendente",
  "PENDENTE",
  " Pago ",
  "faturado",
  "canceled",
  "atrasado",     // desconhecido -> PENDING + aviso
  "sem_previsao", // desconhecido
  "1",            // desconhecido
  "",            // vazio -> PENDING sem aviso
];

const casosMoney: Caso[] = CASOS_MONEY.map((entrada) => ({
  entrada,
  saida: normalizeMoney(entrada),
}));

const casosPhone: Caso[] = CASOS_PHONE.map((entrada) => ({
  entrada,
  saida: normalizePhone(entrada),
}));

const casosCnj: Caso[] = CASOS_CNJ.map((entrada) => ({
  entrada,
  saida: checkCnjCheckDigit(entrada),
}));

const casosStatus: CasoStatus[] = CASOS_STATUS.map((entrada) => ({
  entrada,
  saida: parseFeeStatus(entrada),
}));

const fixture = {
  gerado_por: "dataset-real/gerar-paridade.ts",
  obs: "Fixture de paridade: saidas das funcoes REAIS do backend. O test_eval.py compara com as portas Python.",
  casos: {
    normalizeMoney: casosMoney,
    normalizePhone: casosPhone,
    checkCnjCheckDigit: casosCnj,
    parseFeeStatus: casosStatus,
  },
};

writeFileSync(SAIDA, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");

console.log("=== PARIDADE PYTHON x TS ===");
console.log(`normalizeMoney: ${casosMoney.length} caso(s)`);
console.log(`normalizePhone: ${casosPhone.length} caso(s)`);
console.log(`checkCnjCheckDigit: ${casosCnj.length} caso(s)`);
console.log(`parseFeeStatus: ${casosStatus.length} caso(s)`);
console.log(`\nJSON gravado em: ${SAIDA}`);
for (const caso of casosMoney) {
  console.log(`  normalizeMoney(${JSON.stringify(caso.entrada)}) -> ${caso.saida}`);
}
for (const caso of casosPhone) {
  console.log(`  normalizePhone(${JSON.stringify(caso.entrada)}) -> ${caso.saida}`);
}
for (const caso of casosCnj) {
  console.log(`  checkCnjCheckDigit(${JSON.stringify(caso.entrada)}) -> ${caso.saida}`);
}
for (const caso of casosStatus) {
  console.log(`  parseFeeStatus(${JSON.stringify(caso.entrada)}) -> ${JSON.stringify(caso.saida)}`);
}
console.log("\n=== FIM ===");
