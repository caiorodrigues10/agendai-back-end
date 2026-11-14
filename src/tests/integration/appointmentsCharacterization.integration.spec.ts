/// <reference types="vitest/globals" />
/**
 * Testes de CARACTERIZAÇÃO de agendamento SEM adicional (FASE 1, guarda-corpo).
 *
 * Congelam o contrato HTTP atual de:
 *   - create (staff) + conflito de create staff → 409 (PT)
 *   - create público + conflito de create público → 409 (PT)
 *   - slots (livres e com ocupação)
 *   - availability (vazio e com ocupação)
 *   - conflito (remarcação da equipe e remarcação pública para horário
 *     ocupado → 409)
 *   - conclusão (preço final + ledger/comissão)
 *   - conclusão com pacote (sessão paga: sem receita nova nem comissão)
 *   - remarcação pública (sucesso)
 *
 * Horários determinísticos: agenda 09:00–18:00 nos 7 dias, serviço de 30 min,
 * data = hoje+14 (fuso America/Sao_Paulo, dentro do horizonte de 60 dias).
 * Voláteis normalizados nos snapshots:
 *   - UUIDs           → `<uuid>`
 *   - datas ISO       → `<datetime>` / `<date>`
 *   - `correlationId` → `<correlationId>`
 *   - JWTs públicos   → `<jwt>` (manageToken/sessionToken)
 *
 * Os creates passam pelo caminho REAL (lock advisory + transação +
 * assertAppointmentBookable) — injeção `deps` em appointmentUseCases, sem
 * flag de ambiente. Um create para horário ocupado retorna 409 (PT).
 *
 * Regenerar (após mudança intencional e revisada do contrato):
 *   npm run contract:appointments:update
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

const SNAP_DIR = join(__dirname, "..", "contract", "appointments");
const UPDATE = process.env.UPDATE_APPOINTMENTS_SNAPSHOTS === "1";

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const DATETIME_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?/g;
const DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

function normalizeString(value: string): string {
  return value
    .replace(UUID_RE, "<uuid>")
    .replace(DATETIME_RE, "<datetime>")
    .replace(DATE_RE, "<date>")
    .replace(JWT_RE, "<jwt>");
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
    { request: normalizeString(request), status: res.statusCode, body: normalize(parsed) },
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
      `Snapshot ausente: ${file} — gere com: npm run contract:appointments:update`
    );
  }
  const expected = readFileSync(file, "utf8");
  if (expected !== content) {
    throw new Error(
      `Caracterização de agendamento mudou: ${name} (${request})\n` +
        `${firstDiff(expected, content)}\n` +
        "Se a mudança de contrato for intencional e revisada: npm run contract:appointments:update"
    );
  }
}

/** Data YYYY-MM-DD fixa a `daysAhead` (dentro do horizonte de 60 dias do schema). */
function futureYmd(daysAhead: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

describe("caracterização — agendamento sem adicional (Postgres real, snapshots)", () => {
  let harness: PostgresHarness | undefined;
  let app: FastifyInstance;
  let closeTestApp: (a: FastifyInstance) => Promise<void>;
  let prisma: ReturnType<typeof createProbePrisma>;

  const shopId = randomUUID();
  const ownerId = randomUUID();
  const serviceId = randomUUID();
  const clientId = randomUUID();
  const packageId = randomUUID();
  const clientPackageId = randomUUID();

  const date = futureYmd(14);
  const TIME_A = "10:00";
  const TIME_PUBLIC = "14:00";
  const TIME_RESCHEDULED = "15:00";
  const TIME_PACKAGE = "16:00";

  let appointmentAId = "";
  let publicAppointmentId = "";
  let packageAppointmentId = "";
  let manageToken = "";
  let sessionToken = "";

  function tokenFor(user: { id: string; role: string }, shop: string): string {
    return sign({ role: user.role, barbershopId: shop }, auth.secret as Secret, {
      subject: user.id,
      expiresIn: "1h",
    });
  }
  function authHeader(user: { id: string; role: string }, shop: string) {
    return { authorization: `Bearer ${tokenFor(user, shop)}` };
  }
  const owner = { id: ownerId, role: "OWNER" };

  beforeAll(async () => {
    harness = await startPostgresHarness();
    const helpers = await import("../helpers/createTestApp");
    closeTestApp = helpers.closeTestApp;
    app = await helpers.createTestApp();
    prisma = createProbePrisma();

    await prisma.barbershop.create({
      data: {
        id: shopId,
        name: "QA Char Agenda",
        whatsapp: "11900000041",
        timezone: "America/Sao_Paulo",
        active: true,
        operationMode: "HYBRID",
      },
    });

    // Agenda aberta nos 7 dias → qualquer data futura é válida e determinística.
    await prisma.schedule.createMany({
      data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
        barbershopId: shopId,
        dayOfWeek,
        isOpen: true,
        openTime: "09:00",
        closeTime: "18:00",
      })),
    });

    await prisma.user.create({
      data: {
        id: ownerId,
        name: "Dono Caracterização",
        email: `char-agenda-${ownerId}@qa.local`,
        password: "x",
        role: "OWNER",
        barbershopId: shopId,
        permissions: [],
        active: true,
      },
    });

    await prisma.service.create({
      data: {
        id: serviceId,
        barbershopId: shopId,
        name: "Corte Caracterização",
        price: 50,
        avgTimeMinutes: 30,
        icon: "scissors",
        active: true,
        publicBookable: true,
        commissionPercent: 10,
      },
    });

    await prisma.salonClient.create({
      data: {
        id: clientId,
        barbershopId: shopId,
        name: "Cliente Pacote Char",
        whatsapp: "11999990301",
      },
    });

    const servicePackage = await prisma.servicePackage.create({
      data: {
        barbershopId: shopId,
        serviceId,
        name: "Pacote 5 sessões",
        sessionCount: 5,
        price: 200,
        active: true,
      },
    });
    await prisma.clientPackage.create({
      data: {
        id: clientPackageId,
        barbershopId: shopId,
        clientId,
        packageId: servicePackage.id,
        serviceId,
        totalSessions: 5,
        remainingSessions: 2,
        pricePaid: 200,
        paymentMethod: "pix",
        status: "ACTIVE",
      },
    });

    await prisma.appointmentPolicy.upsert({
      where: { barbershopId: shopId },
      create: { barbershopId: shopId },
      update: {},
    });
  }, 180_000);

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.appointment.deleteMany({ where: { barbershopId: shopId } }).catch(() => {});
        await prisma.commissionEntry.deleteMany({ where: { barbershopId: shopId } }).catch(() => {});
        await prisma.cashMovement.deleteMany({ where: { barbershopId: shopId } }).catch(() => {});
        await prisma.clientPackage.deleteMany({ where: { barbershopId: shopId } }).catch(() => {});
        await prisma.servicePackage.deleteMany({ where: { barbershopId: shopId } }).catch(() => {});
        await prisma.salonClient.deleteMany({ where: { barbershopId: shopId } }).catch(() => {});
        await prisma.service.deleteMany({ where: { barbershopId: shopId } }).catch(() => {});
        await prisma.schedule.deleteMany({ where: { barbershopId: shopId } }).catch(() => {});
        await prisma.appointmentPolicy.deleteMany({ where: { barbershopId: shopId } }).catch(() => {});
        await prisma.barbershop.deleteMany({ where: { id: shopId } }).catch(() => {});
        await prisma.user.deleteMany({ where: { id: ownerId } }).catch(() => {});
        await prisma.$disconnect();
      }
    } catch {
      /* limpeza best-effort */
    }
    if (app && closeTestApp) await closeTestApp(app);
    if (harness) await harness.stop();
  });

  it("GET /api/appointments/slots devolve os horários livres do dia (200)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/appointments/slots?barbershopId=${shopId}&date=${date}&serviceId=${serviceId}`,
    });
    snap("slots-free", `GET /api/appointments/slots?date=${date}&serviceId=${serviceId}`, res);
    const body = JSON.parse(res.body) as { success: boolean; data: Array<{ time: string }> };
    expect(body.success).toBe(true);
    expect(body.data[0]?.time).toBe("09:00");
    expect(body.data.some((s) => s.time === TIME_A)).toBe(true);
  });

  it("GET /api/appointments/availability devolve lista vazia sem ocupação (200)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/appointments/availability?barbershopId=${shopId}&date=${date}`,
    });
    snap("availability-empty", `GET /api/appointments/availability?date=${date}`, res);
    expect(JSON.parse(res.body)).toEqual([]);
  });

  it("POST /api/appointments cria agendamento do staff (201)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/appointments",
      headers: authHeader(owner, shopId),
      payload: {
        barbershopId: shopId,
        serviceId,
        staffId: ownerId,
        customerName: "Cliente Agendamento",
        whatsapp: "11999990310",
        date,
        time: TIME_A,
      },
    });
    snap("appointment-create", "POST /api/appointments", res);
    const body = JSON.parse(res.body) as { success: boolean; data: { id: string; status: string } };
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("CONFIRMED");
    appointmentAId = body.data.id;
    expect(appointmentAId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("GET /api/appointments/slots remove o horário ocupado (200)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/appointments/slots?barbershopId=${shopId}&date=${date}&serviceId=${serviceId}`,
    });
    snap("slots-after-create", `GET /api/appointments/slots?date=${date}&serviceId=${serviceId}`, res);
    const body = JSON.parse(res.body) as { data: Array<{ time: string }> };
    expect(body.data.some((s) => s.time === TIME_A)).toBe(false);
    expect(body.data.some((s) => s.time === "09:30")).toBe(true);
  });

  it("GET /api/appointments/availability devolve o slot ocupado (200)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/appointments/availability?barbershopId=${shopId}&date=${date}&staffId=${ownerId}`,
    });
    snap("availability-occupied", `GET /api/appointments/availability?date=${date}&staffId=${ownerId}`, res);
    const body = JSON.parse(res.body) as Array<{ time: string; durationMinutes: number }>;
    expect(body).toHaveLength(1);
    expect(body[0]?.time).toBe(TIME_A);
    expect(body[0]?.durationMinutes).toBe(30);
  });

  it("POST /api/appointments para horário ocupado → 409 (PT)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/appointments",
      headers: authHeader(owner, shopId),
      payload: {
        barbershopId: shopId,
        serviceId,
        staffId: ownerId,
        customerName: "Conflito Staff",
        whatsapp: "11999990311",
        date,
        time: TIME_A,
      },
    });
    snap("appointment-create-conflict", "POST /api/appointments (horário ocupado)", res);
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body) as { success: boolean; message: string };
    expect(body.success).toBe(false);
    expect(body.message).toBe("Horário indisponível para este profissional");
  });

  it("POST /api/appointments/public para horário ocupado → 409 (PT)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/appointments/public",
      payload: {
        barbershopId: shopId,
        serviceId,
        staffId: ownerId,
        customerName: "Conflito Público",
        whatsapp: "11999990321",
        date,
        time: TIME_A,
      },
    });
    snap(
      "appointment-public-create-conflict",
      "POST /api/appointments/public (horário ocupado)",
      res
    );
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body) as { success: boolean; message: string };
    expect(body.success).toBe(false);
    expect(body.message).toBe("Horário indisponível para este profissional");
  });

  it("POST /api/appointments/public cria agendamento público com manageToken (201)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/appointments/public",
      payload: {
        barbershopId: shopId,
        serviceId,
        staffId: ownerId,
        customerName: "Cliente Público",
        whatsapp: "11999990320",
        date,
        time: TIME_PUBLIC,
      },
    });
    snap("appointment-public-create", "POST /api/appointments/public", res);
    const body = JSON.parse(res.body) as { success: boolean; data: { id: string; manageToken: string } };
    expect(body.success).toBe(true);
    publicAppointmentId = body.data.id;
    manageToken = body.data.manageToken;
    expect(manageToken.split(".")).toHaveLength(3);
  });

  it("POST /api/appointments/public/session troca manageToken por sessionToken (200)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/appointments/public/session",
      payload: { token: manageToken },
    });
    snap("appointment-public-session", "POST /api/appointments/public/session", res);
    const body = JSON.parse(res.body) as {
      success: boolean;
      data: { sessionToken: string; appointment: { id: string } };
    };
    expect(body.success).toBe(true);
    expect(body.data.appointment.id).toBe(publicAppointmentId);
    sessionToken = body.data.sessionToken;
    expect(sessionToken.split(".")).toHaveLength(3);
  });

  it("POST /api/appointments/public/reschedule para horário ocupado → 409 (PT)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/appointments/public/reschedule",
      headers: { authorization: `Bearer ${sessionToken}` },
      payload: { date, time: TIME_A },
    });
    snap(
      "appointment-public-reschedule-conflict",
      `POST /api/appointments/public/reschedule → ${TIME_A} (ocupado)`,
      res
    );
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body) as { success: boolean; message: string };
    expect(body.success).toBe(false);
    expect(body.message).toBe("Horário indisponível para este profissional");
  });

  it("POST /api/appointments/public/reschedule para horário livre → 200", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/appointments/public/reschedule",
      headers: { authorization: `Bearer ${sessionToken}` },
      payload: { date, time: TIME_RESCHEDULED },
    });
    snap(
      "appointment-public-reschedule",
      `POST /api/appointments/public/reschedule → ${TIME_RESCHEDULED}`,
      res
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      success: boolean;
      data: { appointment: { id: string; time: string; status: string }; manageToken: string };
    };
    expect(body.success).toBe(true);
    expect(body.data.appointment.id).toBe(publicAppointmentId);
    expect(body.data.appointment.time).toBe(TIME_RESCHEDULED);
    expect(body.data.appointment.status).toBe("CONFIRMED");
    // Versão incrementada → manageToken novo.
    manageToken = body.data.manageToken;
  });

  it("PATCH /api/appointments/:id (remarcação da equipe) para horário ocupado → 409 (PT)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/appointments/${publicAppointmentId}`,
      headers: authHeader(owner, shopId),
      payload: { date, time: TIME_A },
    });
    snap(
      "appointment-reschedule-conflict",
      `PATCH /api/appointments/:id → ${TIME_A} (ocupado)`,
      res
    );
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body) as { success: boolean; message: string };
    expect(body.success).toBe(false);
    expect(body.message).toBe("Horário indisponível para este profissional");
  });

  it("POST /api/appointments/:id/complete grava preço final, ledger e comissão (200)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/appointments/${appointmentAId}/complete`,
      headers: authHeader(owner, shopId),
      payload: { finalPrice: 55, paymentMethod: "pix" },
    });
    snap("appointment-complete", `POST /api/appointments/:id/complete (preço 55, pix)`, res);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      success: boolean;
      data: { status: string; finalPrice: number; paymentMethod: string };
    };
    expect(body.data.status).toBe("COMPLETED");
    expect(body.data.finalPrice).toBe(55);
    expect(body.data.paymentMethod).toBe("pix");

    const ledger = await prisma.cashMovement.findFirst({
      where: { barbershopId: shopId, sourceType: "APPOINTMENT", sourceId: appointmentAId, type: "SERVICE_SALE" },
    });
    expect(ledger).not.toBeNull();
    expect(Number(ledger!.amount)).toBe(55);

    const commissions = await prisma.commissionEntry.findMany({
      where: { barbershopId: shopId, appointmentId: appointmentAId },
    });
    expect(commissions).toHaveLength(1);
    expect(commissions[0]!.percentage).toBe(10);
    expect(commissions[0]!.amount).toBeCloseTo(5.5, 2);
  });

  it("POST /api/appointments com pacote debita sessão e cria agendamento (201)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/appointments",
      headers: authHeader(owner, shopId),
      payload: {
        barbershopId: shopId,
        serviceId,
        staffId: ownerId,
        clientPackageId,
        customerName: "Cliente Pacote Char",
        whatsapp: "11999990301",
        date,
        time: TIME_PACKAGE,
      },
    });
    snap("appointment-create-package", "POST /api/appointments (com clientPackageId)", res);
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { data: { id: string; clientPackageId: string | null } };
    packageAppointmentId = body.data.id;
    expect(body.data.clientPackageId).toBe(clientPackageId);

    const pkg = await prisma.clientPackage.findUnique({ where: { id: clientPackageId } });
    expect(pkg?.remainingSessions).toBe(1);
  });

  it("POST /api/appointments/:id/complete de sessão de pacote não gera receita nova (200)", async () => {
    const movementsBefore = await prisma.cashMovement.count({
      where: { barbershopId: shopId, sourceType: "APPOINTMENT", sourceId: packageAppointmentId },
    });
    const commissionsBefore = await prisma.commissionEntry.count({
      where: { barbershopId: shopId, appointmentId: packageAppointmentId },
    });
    expect(movementsBefore).toBe(0);
    expect(commissionsBefore).toBe(0);

    const res = await app.inject({
      method: "POST",
      url: `/api/appointments/${packageAppointmentId}/complete`,
      headers: authHeader(owner, shopId),
      payload: { paymentMethod: "pix" },
    });
    snap(
      "appointment-complete-package",
      `POST /api/appointments/:id/complete (sessão de pacote)`,
      res
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      data: { status: string; finalPrice: number; clientPackageId: string | null };
    };
    expect(body.data.status).toBe("COMPLETED");
    expect(body.data.finalPrice).toBe(50);
    expect(body.data.clientPackageId).toBe(clientPackageId);

    const movementsAfter = await prisma.cashMovement.count({
      where: { barbershopId: shopId, sourceType: "APPOINTMENT", sourceId: packageAppointmentId },
    });
    const commissionsAfter = await prisma.commissionEntry.count({
      where: { barbershopId: shopId, appointmentId: packageAppointmentId },
    });
    expect(movementsAfter).toBe(0);
    expect(commissionsAfter).toBe(0);

    // Sessão debitada só na criação; a conclusão não debita de novo.
    const pkg = await prisma.clientPackage.findUnique({ where: { id: clientPackageId } });
    expect(pkg?.remainingSessions).toBe(1);
  });
});
