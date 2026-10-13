/**
 * Gera `src/shared/segments/segmentParity.json` a partir da config central.
 *
 * O JSON é o contrato lido pelo teste de paridade do frontend (pacote separado,
 * não importa este módulo). Editar à mão é como deixar duas fontes da verdade:
 * rode `npm run segments:parity` depois de mexer em `src/shared/segments`.
 *
 * Uso: npm run segments:parity
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildSegmentParity } from "../src/shared/segments/parity";

const target = join(__dirname, "..", "src", "shared", "segments", "segmentParity.json");

writeFileSync(target, `${JSON.stringify(buildSegmentParity(), null, 2)}\n`, "utf8");
console.log(`segmentParity.json atualizado (${buildSegmentParity().allSegments.length} segmentos).`);
