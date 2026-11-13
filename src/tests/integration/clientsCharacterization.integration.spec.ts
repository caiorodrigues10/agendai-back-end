/// <reference types="vitest/globals" />
/**
 * Testes de CARACTERIZAÇÃO do módulo `clients` (Fase 1, passo 2).
 *
 * Chamam CADA endpoint de `clients.routes.ts` contra o Postgres real e gravam
 * o JSON de resposta (status + corpo) em `src/tests/contract/clients/*.json`
 * com campos voláteis normalizados:
 *   - UUIDs            → `<uuid>`
 *   - datas ISO        → `<datetime>` (com hora) / `<date>` (só dia)
 *   - `correlationId`  → `<correlationId>`
 *
 * Os snapshots são a prova de que o contrato de RESPOSTA (campos, tipos,
 * mensagens em português, status) não muda entre antes/depois do refactor:
 *   `git diff` dos snapshots tem que ficar VAZIO nos commits de refactor.
 *
 * Regenerar (apenas mudança de contrato intencional e revisada):
 *   npm run contract:clients:update
 *
 * Cobertura: 22 métodos de 11 rotas + erros principais (400 Zod, 400 uuid
 * inválido, 401 sem token, 403 de tenant, 403 de segmento, 404, 409) com as
 * mensagens em português tal qual a API devolve hoje.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sign, type Secret } from "jsonwebtoken";
import type { FastifyInstance } from "fastify";
import auth from "@/config/auth";
import {
  createProbePrisma,
  startPostgresHarness,
  type PostgresHarness,
} from "../helpers/postgres";

const SNAP_DIR = join(__dirname, "..", "contract", "clients");
const UPDATE = process.env.UPDATE_CLIENTS_SNAPSHOTS === "1";

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const DATETIME_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?/g;
const DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/g;

function normalizeString(value: string): string {
  return value
    .replace(UUID_RE, "<uuid>")
    .replace(DATETIME_RE, "<datetime>")
    .replace(DATE_RE, "<date>");
}

function normalize(value: unknown): unknown {
  if (typeof value === "string") return normalizeString(value);
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = key === "correlationId" ? "<correlationId>" : normalize(item);
    }
    return out;
  }
  return value;
}

function firstDiff(expected: string, actual: string): string {
  const e = expected.split("\n");
  const a = actual.split("\n");
  for (let i = 0; i < Math.max(e.length, a.length); i += 1) {
    if (e[i] !== a[i]) {
      const lines: string[] = [`  divergência na linha ${i + 1}:`];
      for (let j = Math.max(0, i - 2); j < Math.min(Math.max(e.length, a.length), i + 3); j += 1) {
        lines.push(`    esperado: ${e[j] ?? "<eof>"}`);
        lines.push(`    obtido : ${a[j] ?? "<eof>"}`);
      }
      return lines.join("\n");
    }
  }
  return "  (conteúdo idêntico linha a linha — diferença de newline final?)";
}

type InjectedResponse = { statusCode: number; body: string };

function snap(name: string, request: string, res: InjectedResponse): void {
  const parsed = res.body === "" ? null : JSON.parse(res.body);
  const content = `${JSON.stringify(
    { request, status: res.statusCode, body: normalize(parsed) },
    null,
    2
  )}\n`;
  const file = join(SNAP_DIR, `${name}.json`);
  if (UPDATE) {
    mkdirSync(SNAP_DIR, { recursive: true });
    writeFileSync(file, content);
    return;
  }
  if (!existsSync(file)) {
    throw new Error(
      `Snapshot ausente: ${file} — gere com: npm run contract:clients:update`
    );
  }
  const expected = readFileSync(file, "utf8");
  if (expected !== content) {
    throw new Error(
      `Caracterização de clients mudou: ${name} (${request})\n` +
        `${firstDiff(expected, content)}\n` +
        "Se a mudança de contrato for intencional e revisada: npm run contract:clients:update"
    );
  }
}

describe("caracterização — módulo clients (Postgres real, snapshots)", () => {
  let harness: PostgresHarness | undefined;
  let app: FastifyInstance;
  let closeTestApp: (a: FastifyInstance) => Promise<void>;
  let prisma: ReturnType<typeof createProbePrisma>;

  const shopA = randomUUID();
  const shopB = randomUUID();
  const shopLaw = randomUUID();

  const ownerA = { id: randomUUID(), role: "OWNER" };
  const ownerB = { id: randomUUID(), role: "OWNER" };
  const ownerLaw = { id: randomUUID(), role: "OWNER" };

  let clientA1 = "";
  let clientA2 = "";
  let clientB = "";
  let clientLaw = "";
  let clientApi = "";
  let procedureId = "";
  let petId = "";
  let vehicleId = "";
  let caseId = "";

  function tokenFor(user: { id: string; role: string }, shopId: string): string {
    return sign({ role: user.role, barbershopId: shopId }, auth.secret as Secret, {
      subject: user.id,
      expiresIn: "1h",
    });
  }
  function authHeader(user: { id: string; role: string }, shopId: string) {
    return { authorization: `Bearer ${tokenFor(user, shopId)}` };
  }

  beforeAll(async () => {
    harness = await startPostgresHarness();
    const helpers = await import("../helpers/createTestApp");
    closeTestApp = helpers.closeTestApp;
    app = await helpers.createTestApp();
    prisma = createProbePrisma();

    await prisma.barbershop.createMany({
      data: [
        {
          id: shopA,
          name: `[QA-CHAR] Salão A ${shopA.slice(0, 8)}`,
          whatsapp: "11900000031",
        },
        {
          id: shopB,
          name: `[QA-CHAR] Salão B ${shopB.slice(0, 8)}`,
          whatsapp: "11900000032",
        },
        {
          id: shopLaw,
          name: `[QA-CHAR] Escritório ${shopLaw.slice(0, 8)}`,
          whatsapp: "11900000033",
          businessSegment: "LAW_FIRM",
        },
      ],
    });

    await prisma.user.createMany({
      data: [
        {
          id: ownerA.id,
          name: "QA Char Owner A",
          email: `chara-${ownerA.id}@qa.local`,
          password: "x",
          role: "OWNER",
          barbershopId: shopA,
          permissions: [],
        },
        {
          id: ownerB.id,
          name: "QA Char Owner B",
          email: `charb-${ownerB.id}@qa.local`,
          password: "x",
          role: "OWNER",
          barbershopId: shopB,
          permissions: [],
        },
        {
          id: ownerLaw.id,
          name: "QA Char Owner Law",
          email: `charl-${ownerLaw.id}@qa.local`,
          password: "x",
          role: "OWNER",
          barbershopId: shopLaw,
          permissions: [],
        },
      ],
    });

    const [c1, c2, cb, cl] = await Promise.all([
      prisma.salonClient.create({
        data: { barbershopId: shopA, name: "AAA Cliente Caracterização", whatsapp: "11999990201" },
      }),
      prisma.salonClient.create({
        data: { barbershopId: shopA, name: "ZZZ Cliente Caracterização", whatsapp: "11999990202" },
      }),
      prisma.salonClient.create({
        data: { barbershopId: shopB, name: "Cliente Outro Salão", whatsapp: "11999990203" },
      }),
      prisma.salonClient.create({
        data: { barbershopId: shopLaw, name: "Cliente Escritório", whatsapp: "11999990204" },
      }),
    ]);
    clientA1 = c1.id;
    clientA2 = c2.id;
    clientB = cb.id;
    clientLaw = cl.id;
  }, 180_000);

  afterAll(async () => {
    const shops = [shopA, shopB, shopLaw];
    try {
      if (prisma) {
        await prisma.clientProcedureRecord.deleteMany({ where: { barbershopId: { in: shops } } }).catch(() => {});
        await prisma.clientCase.deleteMany({ where: { barbershopId: { in: shops } } }).catch(() => {});
        await prisma.clientVehicle.deleteMany({ where: { barbershopId: { in: shops } } }).catch(() => {});
        await prisma.clientPet.deleteMany({ where: { barbershopId: { in: shops } } }).catch(() => {});
        await prisma.salonClient.deleteMany({ where: { barbershopId: { in: shops } } }).catch(() => {});
        await prisma.barbershop.deleteMany({ where: { id: { in: shops } } }).catch(() => {});
        await prisma.user
          .deleteMany({ where: { id: { in: [ownerA.id, ownerB.id, ownerLaw.id] } } })
          .catch(() => {});
        await prisma.$disconnect();
      }
    } catch {
      /* limpeza best-effort — ids novos a cada run tornam o resíduo invisível */
    }
    if (app && closeTestApp) await closeTestApp(app);
    if (harness) await harness.stop();
  });

  it("POST /api/clients cria cliente (201)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/clients",
      headers: authHeader(ownerA, shopA),
      payload: {
        name: "MMM Cliente Via API",
        whatsapp: "11999990299",
        notes: "criado na caracterização",
        marketingOptIn: true,
      },
    });
    snap("clients-create", "POST /api/clients", res);
    const body = JSON.parse(res.body) as { data: { id: string } };
    clientApi = body.data.id;
    expect(clientApi).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("GET /api/clients lista só o salão do contexto (200 + meta)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/clients?limit=10",
      headers: authHeader(ownerA, shopA),
    });
    snap("clients-list", "GET /api/clients?limit=10", res);
  });

  it("GET /api/clients de outro salão (owner B) devolve só os clientes do B", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/clients?limit=10",
      headers: authHeader(ownerB, shopB),
    });
    snap("clients-list-other-tenant", "GET /api/clients?limit=10 (owner do salão B)", res);
  });

  it("GET /api/clients/:id devolve o cliente com pacotes e agenda vazios (200)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/clients/${clientA1}`,
      headers: authHeader(ownerA, shopA),
    });
    snap("client-get", "GET /api/clients/:id", res);
  });

  it("PATCH /api/clients/:id atualiza (200)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/clients/${clientA1}`,
      headers: authHeader(ownerA, shopA),
      payload: { notes: "observação atualizada", marketingOptIn: false },
    });
    snap("client-update", "PATCH /api/clients/:id", res);
  });

  it("GET /api/clients/:id inexistente → 404 (mensagem em PT)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/clients/${randomUUID()}`,
      headers: authHeader(ownerA, shopA),
    });
    snap("client-get-404", "GET /api/clients/:id (inexistente)", res);
  });

  it("GET /api/clients/:id com uuid malformado → 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/clients/nao-e-uuid",
      headers: authHeader(ownerA, shopA),
    });
    snap("client-get-400-uuid", "GET /api/clients/:id (uuid inválido)", res);
  });

  it("POST /api/clients com nome inválido → 400 Zod (PT)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/clients",
      headers: authHeader(ownerA, shopA),
      payload: { name: "A" },
    });
    snap("clients-create-400", "POST /api/clients (nome de 1 caractere)", res);
  });

  it("GET /api/clients/:id de outro salão → 403 de tenant (PT)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/clients/${clientA1}`,
      headers: authHeader(ownerB, shopB),
    });
    snap("client-get-403-tenant", "GET /api/clients/:id (dono de outro salão)", res);
  });

  it("GET /api/clients sem token → 401 (PT)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/clients" });
    snap("clients-list-401", "GET /api/clients (sem token)", res);
  });

  it("DELETE /api/clients/:id remove o cliente criado via API (204)", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/clients/${clientApi}`,
      headers: authHeader(ownerA, shopA),
    });
    snap("client-delete", "DELETE /api/clients/:id", res);
  });

  it("GET /api/clients após o delete não devolve mais o removido", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/clients?limit=10",
      headers: authHeader(ownerA, shopA),
    });
    snap("clients-list-after-delete", "GET /api/clients?limit=10 (após delete)", res);
  });

  // ─── Procedure records ────────────────────────────────────────────────────

  it("POST /api/clients/:id/procedures registra procedimento (201)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/clients/${clientA1}/procedures`,
      headers: authHeader(ownerA, shopA),
      payload: {
        professionalName: "Dra. Ana",
        title: "Limpeza de pele",
        formula: "Ácido mandélico 10%",
        details: "pele sensível",
        serviceName: "Estética facial",
      },
    });
    snap("procedures-create", "POST /api/clients/:id/procedures", res);
    const body = JSON.parse(res.body) as { data: { id: string } };
    procedureId = body.data.id;
  });

  it("GET /api/clients/:id/procedures lista (200)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/clients/${clientA1}/procedures`,
      headers: authHeader(ownerA, shopA),
    });
    snap("procedures-list", "GET /api/clients/:id/procedures", res);
  });

  it("GET /api/clients/:id/procedures/latest devolve o último (200)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/clients/${clientA1}/procedures/latest`,
      headers: authHeader(ownerA, shopA),
    });
    snap("procedures-latest", "GET /api/clients/:id/procedures/latest", res);
  });

  it("PATCH /api/clients/:id/procedures/:recordId atualiza (200)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/clients/${clientA1}/procedures/${procedureId}`,
      headers: authHeader(ownerA, shopA),
      payload: { title: "Limpeza de pele profunda" },
    });
    snap("procedures-update", "PATCH /api/clients/:id/procedures/:recordId", res);
  });

  it("PATCH em procedimento inexistente → 404 (PT)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/clients/${clientA1}/procedures/${randomUUID()}`,
      headers: authHeader(ownerA, shopA),
      payload: { title: "qualquer" },
    });
    snap("procedures-update-404", "PATCH /api/clients/:id/procedures/:recordId (inexistente)", res);
  });

  it("DELETE /api/clients/:id/procedures/:recordId remove (204)", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/clients/${clientA1}/procedures/${procedureId}`,
      headers: authHeader(ownerA, shopA),
    });
    snap("procedures-delete", "DELETE /api/clients/:id/procedures/:recordId", res);
  });

  it("GET /api/clients/:id/procedures após delete devolve lista vazia", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/clients/${clientA1}/procedures`,
      headers: authHeader(ownerA, shopA),
    });
    snap("procedures-list-empty", "GET /api/clients/:id/procedures (vazio)", res);
  });

  // ─── Pets ─────────────────────────────────────────────────────────────────

  it("POST /api/clients/:id/pets cria pet com defaults do schema (201)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/clients/${clientA1}/pets`,
      headers: authHeader(ownerA, shopA),
      payload: { name: "Rex" },
    });
    snap("pets-create", "POST /api/clients/:id/pets", res);
    const body = JSON.parse(res.body) as { data: { id: string } };
    petId = body.data.id;
  });

  it("GET /api/clients/:id/pets lista (200)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/clients/${clientA1}/pets`,
      headers: authHeader(ownerA, shopA),
    });
    snap("pets-list", "GET /api/clients/:id/pets", res);
  });

  it("PATCH /api/clients/:id/pets/:petId atualiza (200)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/clients/${clientA1}/pets/${petId}`,
      headers: authHeader(ownerA, shopA),
      payload: { species: "DOG", size: "LARGE" },
    });
    snap("pets-update", "PATCH /api/clients/:id/pets/:petId", res);
  });

  it("POST /api/clients/:id/pets sem nome → 400 Zod (PT)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/clients/${clientA1}/pets`,
      headers: authHeader(ownerA, shopA),
      payload: { name: "" },
    });
    snap("pets-create-400", "POST /api/clients/:id/pets (nome vazio)", res);
  });

  it("DELETE /api/clients/:id/pets/:petId remove (204)", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/clients/${clientA1}/pets/${petId}`,
      headers: authHeader(ownerA, shopA),
    });
    snap("pets-delete", "DELETE /api/clients/:id/pets/:petId", res);
  });

  // ─── Vehicles ─────────────────────────────────────────────────────────────

  it("POST /api/clients/:id/vehicles normaliza a placa (201)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/clients/${clientA1}/vehicles`,
      headers: authHeader(ownerA, shopA),
      payload: { plate: "abc 1d-23", vehicleModel: "Gol", color: "Preto" },
    });
    snap("vehicles-create", "POST /api/clients/:id/vehicles", res);
    const body = JSON.parse(res.body) as { data: { id: string } };
    vehicleId = body.data.id;
  });

  it("GET /api/clients/:id/vehicles lista (200)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/clients/${clientA1}/vehicles`,
      headers: authHeader(ownerA, shopA),
    });
    snap("vehicles-list", "GET /api/clients/:id/vehicles", res);
  });

  it("PATCH /api/clients/:id/vehicles/:vehicleId atualiza (200)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/clients/${clientA1}/vehicles/${vehicleId}`,
      headers: authHeader(ownerA, shopA),
      payload: { color: "Branco" },
    });
    snap("vehicles-update", "PATCH /api/clients/:id/vehicles/:vehicleId", res);
  });

  it("POST /api/clients/:id/vehicles com placa inválida → 400 Zod (PT)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/clients/${clientA1}/vehicles`,
      headers: authHeader(ownerA, shopA),
      payload: { plate: "XYZ", vehicleModel: "Onix" },
    });
    snap("vehicles-create-400", "POST /api/clients/:id/vehicles (placa inválida)", res);
  });

  it("POST /api/clients/:id/vehicles placa repetida → 409 (PT)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/clients/${clientA1}/vehicles`,
      headers: authHeader(ownerA, shopA),
      payload: { plate: "abc1d23", vehicleModel: "Gol 2" },
    });
    snap("vehicles-create-409", "POST /api/clients/:id/vehicles (placa repetida)", res);
  });

  it("DELETE /api/clients/:id/vehicles/:vehicleId remove (204)", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/clients/${clientA1}/vehicles/${vehicleId}`,
      headers: authHeader(ownerA, shopA),
    });
    snap("vehicles-delete", "DELETE /api/clients/:id/vehicles/:vehicleId", res);
  });

  // ─── Cases (segmento LAW_FIRM) ────────────────────────────────────────────

  it("GET /api/clients/:id/cases fora do segmento → 403 (PT + code)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/clients/${clientA1}/cases`,
      headers: authHeader(ownerA, shopA),
    });
    snap("cases-list-403-segment", "GET /api/clients/:id/cases (salão sem caseManagement)", res);
  });

  it("POST /api/clients/:id/cases normaliza número CNJ (201, escritório)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/clients/${clientLaw}/cases`,
      headers: authHeader(ownerLaw, shopLaw),
      payload: {
        nickname: "Caso Caracterização",
        caseNumber: "0000001-0220268260001",
        status: "LEAD",
        priority: "NORMAL",
        opponent: "Parte Contrária",
      },
    });
    snap("cases-create", "POST /api/clients/:id/cases", res);
    const body = JSON.parse(res.body) as { data: { id: string } };
    caseId = body.data.id;
  });

  it("GET /api/clients/:id/cases lista (200, escritório)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/clients/${clientLaw}/cases`,
      headers: authHeader(ownerLaw, shopLaw),
    });
    snap("cases-list", "GET /api/clients/:id/cases", res);
  });

  it("PATCH /api/clients/:id/cases/:caseId atualiza status (200)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/clients/${clientLaw}/cases/${caseId}`,
      headers: authHeader(ownerLaw, shopLaw),
      payload: { status: "ACTIVE" },
    });
    snap("cases-update", "PATCH /api/clients/:id/cases/:caseId", res);
  });

  it("PATCH em caso inexistente → 404 (PT)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/clients/${clientLaw}/cases/${randomUUID()}`,
      headers: authHeader(ownerLaw, shopLaw),
      payload: { nickname: "qualquer" },
    });
    snap("cases-update-404", "PATCH /api/clients/:id/cases/:caseId (inexistente)", res);
  });

  it("POST /api/clients/:id/cases com número inválido → 400 Zod (PT)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/clients/${clientLaw}/cases`,
      headers: authHeader(ownerLaw, shopLaw),
      payload: { nickname: "Caso Ruim", caseNumber: "123" },
    });
    snap("cases-create-400", "POST /api/clients/:id/cases (número inválido)", res);
  });

  it("DELETE /api/clients/:id/cases/:caseId remove (204)", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/clients/${clientLaw}/cases/${caseId}`,
      headers: authHeader(ownerLaw, shopLaw),
    });
    snap("cases-delete", "DELETE /api/clients/:id/cases/:caseId", res);
  });
});
