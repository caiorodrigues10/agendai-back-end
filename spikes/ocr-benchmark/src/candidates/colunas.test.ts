import { strict as assert } from "node:assert";
import { distribuirColunas, type Celula } from "./colunas";

function celula(text: string, x0: number, x1: number): Celula {
  return { text, bbox: { x0, y0: 0, x1, y1: 20 } };
}

const LARGURA = 1000;

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

describe("distribuirColunas (compartilhado C <-> G)", () => {
  it("classifica nome/telefone/valor por posicao (ordem natural)", () => {
    const row = distribuirColunas(
      [
        celula("Larissa Fontes Duarte", 20, 240), // x centro 130 -> nome
        celula("11 98765-4321", 400, 520),        // x centro 460 -> telefone
        celula("R$ 1.234,56", 670, 800),          // x centro 735 -> valor
      ],
      LARGURA
    );
    assert.strictEqual(row.nome, "Larissa Fontes Duarte");
    assert.strictEqual(row.telefone, "11 98765-4321");
    assert.strictEqual(row.valor, "R$ 1.234,56");
  });

  it("celula vazia e ordem embaralhada nao alteram a classificacao", () => {
    const row = distribuirColunas(
      [
        celula("R$ 1.234,56", 670, 800),          // valor primeiro (embaralhado)
        celula("", 10, 30),                       // celula vazia: ignorada
        celula("Larissa Fontes Duarte", 20, 240), // nome
        celula("(11) 98765-4321", 400, 520),      // telefone com DDI
      ],
      LARGURA
    );
    assert.strictEqual(row.nome, "Larissa Fontes Duarte");
    assert.strictEqual(row.telefone, "(11) 98765-4321");
    assert.strictEqual(row.valor, "R$ 1.234,56");
  });

  it("valor com R$ e telefone com DDI vao para colunas corretas independentemente da ordem", () => {
    const embaralhada = distribuirColunas(
      [
        celula("R$ 5.430,10", 670, 800),
        celula("6109913097", 400, 520),
        celula("Rafael Monteiro Dias", 20, 220),
      ],
      LARGURA
    );
    assert.strictEqual(embaralhada.nome, "Rafael Monteiro Dias");
    assert.strictEqual(embaralhada.telefone, "6109913097");
    assert.strictEqual(embaralhada.valor, "R$ 5.430,10");
  });

  it("linha sem celulas retorna campos vazios", () => {
    const row = distribuirColunas([], LARGURA);
    assert.strictEqual(row.nome, undefined);
    assert.strictEqual(row.telefone, undefined);
    assert.strictEqual(row.valor, undefined);
  });

  it("apenas celula vazia retorna campos vazios", () => {
    const row = distribuirColunas([celula("", 100, 200)], LARGURA);
    assert.strictEqual(row.nome, undefined);
    assert.strictEqual(row.telefone, undefined);
    assert.strictEqual(row.valor, undefined);
  });
});

void run();
