/// <reference types="vitest/globals" />
/**
 * Contrato OpenAPI (golden) — guarda-corpo das Fases 1+ do plano Clean
 * Architecture.
 *
 * Serializa o documento OpenAPI real da aplicação (`app.swagger()`) e compara
 * com `src/tests/contract/openapi.golden.json`. Qualquer mudança de rota,
 * método, parâmetro, schema declarado ou enum sem querer derruba o teste.
 *
 * Normalização (para o golden ser estável entre máquinas/CI):
 *   - chaves de objeto ordenadas alfabeticamente (recursivo);
 *   - arrays de primitivos ordenados (tags, enums, required…);
 *   - `servers` fixado (independe de API_DOCS_SERVER_URL);
 *   - env fixado no build: NODE_ENV=test (rota dev-only
 *     POST /api/dev/reset-rate-limit FAZ parte deste golden — o documento de
 *     produção não a tem; o teste roda sempre em teste), ENABLE_API_DOCS=false
 *     (a UI do Swagger não entra no documento).
 *
 * ATUALIZAR o golden (após mudança de contrato INTENCIONAL e revisada):
 *   npm run contract:openapi:update
 * e revisar o diff do JSON no PR.
 *
 * Limitação documentada (baseline.md §6): a maioria das rotas não declara
 * `schema` Fastify — o golden cobre rotas/métodos/params/schemas declarados;
 * campos de body/response sem schema ficam para o enriquecimento futuro
 * (Zod → JSON Schema).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";

const GOLDEN_PATH = join(__dirname, "..", "contract", "openapi.golden.json");
const UPDATE = process.env.UPDATE_OPENAPI_GOLDEN === "1";
const PINNED_SERVERS = [
  { url: "https://api.openapi.invalid", description: "pinned-for-contract-test" },
];

/** Ordena chaves de objeto; arrays de primitivos em ordem estável. */
function deepSort(value: unknown): unknown {
  if (Array.isArray(value)) {
    const mapped = value.map(deepSort);
    const allPrimitive = mapped.every(
      (v) =>
        v === null ||
        typeof v === "string" ||
        typeof v === "number" ||
        typeof v === "boolean"
    );
    if (allPrimitive) {
      return [...mapped].sort((a, b) => String(a).localeCompare(String(b)));
    }
    return mapped;
  }
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      out[key] = deepSort(source[key]);
    }
    return out;
  }
  return value;
}

function normalize(doc: unknown): string {
  const copy = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  copy.servers = PINNED_SERVERS;
  return `${JSON.stringify(deepSort(copy), null, 2)}\n`;
}

/** Resumo legível do que mudou (rotas primeiro). */
function diffSummary(expected: string, actual: string): string {
  const exp = JSON.parse(expected) as { paths?: Record<string, Record<string, unknown>> };
  const act = JSON.parse(actual) as { paths?: Record<string, Record<string, unknown>> };
  const expPaths = Object.keys(exp.paths ?? {}).sort();
  const actPaths = Object.keys(act.paths ?? {}).sort();
  const added = actPaths.filter((p) => !expPaths.includes(p));
  const removed = expPaths.filter((p) => !actPaths.includes(p));
  const lines: string[] = [];
  if (added.length || removed.length) {
    for (const p of added) lines.push(`  + rota nova: ${p}`);
    for (const p of removed) lines.push(`  - rota removida: ${p}`);
  } else {
    // Mesmas rotas: acha a primeira linha divergente.
    const e = expected.split("\n");
    const a = actual.split("\n");
    for (let i = 0; i < Math.max(e.length, a.length); i += 1) {
      if (e[i] !== a[i]) {
        lines.push(`  primeira divergência na linha ${i + 1}:`);
        for (let j = Math.max(0, i - 2); j < Math.min(Math.max(e.length, a.length), i + 3); j += 1) {
          lines.push(`    esperado: ${e[j] ?? "<eof>"}`);
          lines.push(`    obtido : ${a[j] ?? "<eof>"}`);
        }
        break;
      }
    }
  }
  return lines.join("\n");
}

describe("contrato OpenAPI (golden)", () => {
  let app: FastifyInstance;
  let closeTestApp: (instance: FastifyInstance) => Promise<void>;
  let harness: { stop: () => Promise<void> } | undefined;
  const savedEnv = {
    NODE_ENV: process.env.NODE_ENV,
    ENABLE_API_DOCS: process.env.ENABLE_API_DOCS,
    API_DOCS_SERVER_URL: process.env.API_DOCS_SERVER_URL,
    UPDATE_OPENAPI_GOLDEN: process.env.UPDATE_OPENAPI_GOLDEN,
  };

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.ENABLE_API_DOCS = "false";
    process.env.API_DOCS_SERVER_URL = "https://api.openapi.invalid";
    const postgres = await import("../helpers/postgres");
    harness = await postgres.startPostgresHarness();
    const helpers = await import("../helpers/createTestApp");
    closeTestApp = helpers.closeTestApp;
    app = await helpers.createTestApp();
  }, 180_000);

  afterAll(async () => {
    if (app && closeTestApp) await closeTestApp(app);
    if (harness) await harness.stop();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("o documento OpenAPI real bate com o golden", async () => {
    await app.ready();
    const actual = normalize(app.swagger());

    if (UPDATE) {
      mkdirSync(join(GOLDEN_PATH, ".."), { recursive: true });
      writeFileSync(GOLDEN_PATH, actual);
      return;
    }

    if (!existsSync(GOLDEN_PATH)) {
      throw new Error(
        `Golden ausente: ${GOLDEN_PATH}. Gere com: npm run contract:openapi:update`
      );
    }
    const expected = readFileSync(GOLDEN_PATH, "utf8");
    if (expected !== actual) {
      throw new Error(
        "Contrato OpenAPI alterado sem atualizar o golden.\n" +
          `${diffSummary(expected, actual)}\n` +
          "Se a mudança for intencional (revisada): npm run contract:openapi:update " +
          "e commite o diff do JSON no PR."
      );
    }
  }, 120_000);
});
