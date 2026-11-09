import { strict as assert } from "node:assert";
import { construirRows, type PaddleSaida } from "./g-paddleocr";

const IMAGEM = "/tmp/caso-xx.jpg";

// --- mini harness (sem dependencia de framework de teste) ---
type TestCase = { name: string; fn: () => void | Promise<void> };
const tests: TestCase[] = [];
let failures = 0;
function describe(_nome: string, corpo: () => void): void {
  corpo();
}
async function it(nome: string, fn: () => void | Promise<void>): Promise<void> {
  tests.push({ name: nome, fn });
}
async function run(): Promise<void> {
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`ok - ${t.name}`);
    } catch (err) {
      failures++;
      console.error(`FALHA - ${t.name}`);
      console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    }
  }
  if (failures > 0) {
    console.error(`\n${failures} teste(s) falharam.`);
    process.exit(1);
  }
  console.log(`\n${tests.length} teste(s) passou(aram).`);
}

function saidaVazia(): PaddleSaida[] {
  return [];
}

function saidaComErro(): PaddleSaida[] {
  return [{ image: IMAGEM, lines: [], rows: [], error: "falha de inferencia" }];
}

function saidaComLinhas(): PaddleSaida[] {
  return [
    {
      image: IMAGEM,
      lines: [
        { text: "NOME", confidence: 1.0, bbox: { x0: 20, y0: 10, x1: 90, y1: 35 } },
        { text: "11 98765-4321", confidence: 1.0, bbox: { x0: 400, y0: 48, x1: 520, y1: 72 } },
        { text: "R$ 1.234,56", confidence: 0.99, bbox: { x0: 670, y0: 48, x1: 800, y1: 74 } },
      ],
      rows: [
        {
          texto: "Larissa  11 98765-4321  R$ 1.234,56",
          celulas: [
            { text: "Larissa", confidence: 1.0, bbox: { x0: 20, y0: 50, x1: 100, y1: 70 } },
            { text: "11 98765-4321", confidence: 1.0, bbox: { x0: 400, y0: 48, x1: 520, y1: 72 } },
            { text: "R$ 1.234,56", confidence: 0.99, bbox: { x0: 670, y0: 48, x1: 800, y1: 74 } },
          ],
        },
      ],
    },
  ];
}

describe("candidato G (PaddleOCR) - construcao de linhas", () => {
  it("nao quebra com saida vazia do OCR (array vazio)", () => {
    const { rows, rawText } = construirRows(saidaVazia(), IMAGEM);
    assert.deepStrictEqual(rows, []);
    assert.strictEqual(rawText, "");
  });

  it("nao quebra quando a entrada tem erro de inferencia", () => {
    const { rows } = construirRows(saidaComErro(), IMAGEM);
    assert.deepStrictEqual(rows, []);
  });

  it("monta ExtractedRow aplicando distribuicao de colunas", () => {
    const { rows } = construirRows(saidaComLinhas(), IMAGEM);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].nome, "Larissa");
    assert.strictEqual(rows[0].telefone, "11 98765-4321");
    assert.strictEqual(rows[0].valor, "R$ 1.234,56");
  });

  it("imagem desconhecida cai na primeira entrada e nao quebra", () => {
    const { rows } = construirRows(saidaComLinhas(), "/tmp/nao-existe.jpg");
    assert.strictEqual(rows.length, 1);
  });
});

void run();
