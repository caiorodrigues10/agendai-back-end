/// <reference types="vitest/globals" />
/**
 * Provas E2E da FASE 3 — adicionais em agendamentos.
 *
 * Usa PostgreSQL real e o fluxo HTTP real. Cobre:
 * - criação staff/public com snapshot e validação de domínio;
 * - conflito real caused apenas pela duração do adicional;
 * - slots e availability com a duração total;
 * - remarcação staff/public usando os snapshots do próprio agendamento;
 * - imutabilidade do snapshot após editar/inativar/apagar (soft delete);
 * - total, comissão, ledger e fiado;
 * - isolamento entre dois salões.
 */
import { randomUUID } from "node:crypto";
import { sign, type Secret } from "jsonwebtoken";
import type { FastifyInstance } from "fastify";
import auth from "@/config/auth";
import {
  createProbePrisma,
  startPostgresHarness,
  type PostgresHarness,
} from "../helpers/postgres";

function futureYmd(daysAhead: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

describe("FASE 3 — adicionais em agendamentos (Postgres real)", () => {
  let harness: PostgresHarness | undefined;
  let app: FastifyInstance;
  let closeTestApp: (app: FastifyInstance) => Promise<void>;
  let prisma: ReturnType<typeof createProbePrisma>;

  const shopA = randomUUID();
  const shopB = randomUUID();
  const ownerA = randomUUID();
  const employeeA = randomUUID();
  const ownerB = randomUUID();
  const serviceA = randomUUID();
  const internalServiceA = randomUUID();
  const serviceB = randomUUID();
  const clientId = randomUUID();
  const clientPackageId = randomUUID();
  const servicePackageId = randomUUID();
  const addonRegular = randomUUID();
  const addonOffline = randomUUID();
  const addonNonCommissionable = randomUUID();
  const addonImmutable = randomUUID();

  const dateCreate = futureYmd(12);
  const dateSlots = futureYmd(13);
  const dateReschedule = futureYmd(14);
  const dateSnapshot = futureYmd(15);
  const dateTenant = futureYmd(16);
  const dateFinancial = futureYmd(17);

  function tokenFor(user: { id: string; role: string }, shop: string): string {
    return sign({ role: user.role, barbershopId: shop }, auth.secret as Secret, {
      subject: user.id,
      expiresIn: "1h",
    });
  }

  function authHeader(user: { id: string; role: string }, shop: string) {
    return { authorization: `Bearer ${tokenFor(user, shop)}` };
  }

  const owner = { id: ownerA, role: "OWNER" };
  const employee = { id: employeeA, role: "EMPLOYEE" };
  const ownerOfB = { id: ownerB, role: "OWNER" };

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
          name: "Salão A — Adicionais",
          whatsapp: "11900001001",
          timezone: "America/Sao_Paulo",
          active: true,
          operationMode: "HYBRID",
        },
        {
          id: shopB,
          name: "Salão B — Isolamento",
          whatsapp: "11900001002",
          timezone: "America/Sao_Paulo",
          active: true,
          operationMode: "HYBRID",
        },
      ],
    });

    await prisma.schedule.createMany({
      data: [shopA, shopB].flatMap((barbershopId) =>
        Array.from({ length: 7 }, (_, dayOfWeek) => ({
          barbershopId,
          dayOfWeek,
          isOpen: true,
          openTime: "08:00",
          closeTime: "19:00",
        }))
      ),
    });

    await prisma.user.createMany({
      data: [
        {
          id: ownerA,
          name: "Dono A",
          email: `phase3-owner-a-${ownerA}@qa.local`,
          password: "x",
          role: "OWNER",
          barbershopId: shopA,
          permissions: [],
          active: true,
        },
        {
          id: employeeA,
          name: "Profissional A",
          email: `phase3-employee-a-${employeeA}@qa.local`,
          password: "x",
          role: "EMPLOYEE",
          barbershopId: shopA,
          permissions: [],
          active: true,
        },
        {
          id: ownerB,
          name: "Dono B",
          email: `phase3-owner-b-${ownerB}@qa.local`,
          password: "x",
          role: "OWNER",
          barbershopId: shopB,
          permissions: [],
          active: true,
        },
      ],
    });

    await prisma.service.createMany({
      data: [
        {
          id: serviceA,
          barbershopId: shopA,
          name: "Corte 30",
          price: 50,
          avgTimeMinutes: 30,
          icon: "scissors",
          active: true,
          publicBookable: true,
          commissionPercent: 10,
        },
        {
          id: internalServiceA,
          barbershopId: shopA,
          name: "Atendimento interno",
          price: 80,
          avgTimeMinutes: 30,
          icon: "briefcase",
          active: true,
          publicBookable: false,
          commissionPercent: 10,
        },
        {
          id: serviceB,
          barbershopId: shopB,
          name: "Corte do Salão B",
          price: 60,
          avgTimeMinutes: 30,
          icon: "scissors",
          active: true,
          publicBookable: true,
          commissionPercent: 10,
        },
      ],
    });

    await prisma.salonClient.create({
      data: {
        id: clientId,
        barbershopId: shopA,
        name: "Cliente Pacote FASE 3",
        whatsapp: "11999991003",
      },
    });

    await prisma.servicePackage.create({
      data: {
        id: servicePackageId,
        barbershopId: shopA,
        serviceId: serviceA,
        name: "Pacote FASE 3",
        sessionCount: 5,
        price: 250,
        active: true,
      },
    });
    await prisma.clientPackage.create({
      data: {
        id: clientPackageId,
        barbershopId: shopA,
        clientId,
        packageId: servicePackageId,
        serviceId: serviceA,
        totalSessions: 5,
        remainingSessions: 3,
        pricePaid: 250,
        paymentMethod: "pix",
        status: "ACTIVE",
      },
    });

    await prisma.salonAddon.createMany({
      data: [
        {
          id: addonRegular,
          barbershopId: shopA,
          name: "Adicional +30",
          price: 20,
          durationMinutes: 30,
          active: true,
          availableOnline: true,
          maxQuantity: 3,
          commissionable: true,
        },
        {
          id: addonOffline,
          barbershopId: shopA,
          name: "Adicional offline",
          price: 5,
          durationMinutes: 15,
          active: true,
          availableOnline: false,
          maxQuantity: 2,
          commissionable: true,
        },
        {
          id: addonNonCommissionable,
          barbershopId: shopA,
          name: "Adicional sem comissão",
          price: 7,
          durationMinutes: 10,
          active: true,
          availableOnline: true,
          maxQuantity: 2,
          commissionable: false,
        },
        {
          id: addonImmutable,
          barbershopId: shopA,
          name: "Adicional snapshot",
          price: 10,
          durationMinutes: 15,
          active: true,
          availableOnline: true,
          maxQuantity: 2,
          commissionable: true,
        },
      ],
    });

    await prisma.serviceAddonLink.createMany({
      data: [
        {
          barbershopId: shopA,
          serviceId: serviceA,
          addonId: addonRegular,
          priceOverride: null,
          timeOverride: null,
        },
        {
          barbershopId: shopA,
          serviceId: serviceA,
          addonId: addonOffline,
          priceOverride: null,
          timeOverride: null,
        },
        {
          barbershopId: shopA,
          serviceId: serviceA,
          addonId: addonNonCommissionable,
          priceOverride: null,
          timeOverride: null,
        },
        {
          barbershopId: shopA,
          serviceId: serviceA,
          addonId: addonImmutable,
          priceOverride: 25,
          timeOverride: 45,
        },
      ],
    });

    await prisma.appointmentPolicy.createMany({
      data: [
        { barbershopId: shopA },
        { barbershopId: shopB },
      ],
    });
  }, 180_000);

  afterAll(async () => {
    if (prisma) {
      await prisma.appointment.deleteMany({
        where: { barbershopId: { in: [shopA, shopB] } },
      }).catch(() => {});
      await prisma.commissionEntry.deleteMany({
        where: { barbershopId: { in: [shopA, shopB] } },
      }).catch(() => {});
      await prisma.cashMovement.deleteMany({
        where: { barbershopId: { in: [shopA, shopB] } },
      }).catch(() => {});
      await prisma.fiado.deleteMany({
        where: { barbershopId: { in: [shopA, shopB] } },
      }).catch(() => {});
      await prisma.clientPackage.deleteMany({
        where: { barbershopId: { in: [shopA, shopB] } },
      }).catch(() => {});
      await prisma.servicePackage.deleteMany({
        where: { barbershopId: { in: [shopA, shopB] } },
      }).catch(() => {});
      await prisma.salonClient.deleteMany({
        where: { barbershopId: { in: [shopA, shopB] } },
      }).catch(() => {});
      await prisma.serviceAddonLink.deleteMany({
        where: { barbershopId: { in: [shopA, shopB] } },
      }).catch(() => {});
      await prisma.salonAddon.deleteMany({
        where: { barbershopId: { in: [shopA, shopB] } },
      }).catch(() => {});
      await prisma.service.deleteMany({
        where: { barbershopId: { in: [shopA, shopB] } },
      }).catch(() => {});
      await prisma.schedule.deleteMany({
        where: { barbershopId: { in: [shopA, shopB] } },
      }).catch(() => {});
      await prisma.appointmentPolicy.deleteMany({
        where: { barbershopId: { in: [shopA, shopB] } },
      }).catch(() => {});
      await prisma.barbershop.deleteMany({
        where: { id: { in: [shopA, shopB] } },
      }).catch(() => {});
      await prisma.user.deleteMany({
        where: { id: { in: [ownerA, employeeA, ownerB] } },
      }).catch(() => {});
      await prisma.$disconnect();
    }
    if (app && closeTestApp) await closeTestApp(app);
    if (harness) await harness.stop();
  });

  it("staff cria com snapshot aditivo, soma duplicados e responde total/duração", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/appointments",
      headers: authHeader(owner, shopA),
      payload: {
        barbershopId: shopA,
        serviceId: serviceA,
        staffId: ownerA,
        customerName: "Cliente com Adicional",
        whatsapp: "11999991001",
        date: dateCreate,
        time: "09:00",
        addons: [
          { addonId: addonRegular, quantity: 1 },
          { addonId: addonRegular, quantity: 1 },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body) as {
      success: boolean;
      data: {
        id: string;
        addons: Array<{
          addonId: string;
          name: string;
          unitPrice: number;
          quantity: number;
          durationMinutes: number;
          commissionable: boolean;
        }>;
        totalPrice: number;
        totalDurationMinutes: number;
      };
    };
    expect(body.success).toBe(true);
    expect(body.data.addons).toEqual([
      {
        addonId: addonRegular,
        name: "Adicional +30",
        unitPrice: 20,
        quantity: 2,
        durationMinutes: 30,
        commissionable: true,
      },
    ]);
    expect(body.data.totalPrice).toBe(90);
    expect(body.data.totalDurationMinutes).toBe(90);

    const persisted = await prisma.appointmentAddon.findMany({
      where: { appointmentId: body.data.id },
    });
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({
      barbershopId: shopA,
      addonId: addonRegular,
      nameSnapshot: "Adicional +30",
      quantity: 2,
      durationMinutes: 30,
      commissionable: true,
    });
    expect(Number(persisted[0]!.unitPrice)).toBe(20);

    const getResponse = await app.inject({
      method: "GET",
      url: `/api/appointments/${body.data.id}`,
      headers: authHeader(owner, shopA),
    });
    expect(getResponse.statusCode).toBe(200);
    const getBody = JSON.parse(getResponse.body) as {
      data: { addons: unknown[]; totalPrice: number; totalDurationMinutes: number };
    };
    expect(getBody.data.addons).toEqual(body.data.addons);
    expect(getBody.data.totalPrice).toBe(90);
    expect(getBody.data.totalDurationMinutes).toBe(90);

    const availability = await app.inject({
      method: "GET",
      url: `/api/appointments/availability?barbershopId=${shopA}&date=${dateCreate}&staffId=${ownerA}`,
    });
    expect(availability.statusCode).toBe(200);
    const occupied = JSON.parse(availability.body) as Array<{
      time: string;
      durationMinutes: number;
    }>;
    expect(occupied).toContainEqual(
      expect.objectContaining({ time: "09:00", durationMinutes: 90 })
    );
  });

  it("rejeita soma de duplicados acima do maxQuantity", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/appointments",
      headers: authHeader(owner, shopA),
      payload: {
        barbershopId: shopA,
        serviceId: serviceA,
        staffId: ownerA,
        customerName: "Quantidade Inválida",
        whatsapp: "11999991002",
        date: dateCreate,
        time: "13:00",
        addons: [
          { addonId: addonRegular, quantity: 2 },
          { addonId: addonRegular, quantity: 2 },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({
      success: false,
      code: "QUANTITY_OUT_OF_RANGE",
    });
  });

  it("público aceita adicional online, mas não offline nem serviço não publicBookable", async () => {
    const publicResponse = await app.inject({
      method: "POST",
      url: "/api/appointments/public",
      payload: {
        barbershopId: shopA,
        serviceId: serviceA,
        staffId: ownerA,
        customerName: "Cliente Público com Adicional",
        whatsapp: "11999991004",
        date: dateCreate,
        time: "11:00",
        addons: [{ addonId: addonRegular, quantity: 1 }],
      },
    });
    expect(publicResponse.statusCode).toBe(201);
    const publicBody = JSON.parse(publicResponse.body) as {
      data: { addons: Array<{ addonId: string }>; totalPrice: number };
    };
    expect(publicBody.data.addons[0]?.addonId).toBe(addonRegular);
    expect(publicBody.data.totalPrice).toBe(70);

    const offlineResponse = await app.inject({
      method: "POST",
      url: "/api/appointments/public",
      payload: {
        barbershopId: shopA,
        serviceId: serviceA,
        staffId: ownerA,
        customerName: "Cliente Offline",
        whatsapp: "11999991005",
        date: dateCreate,
        time: "12:00",
        addons: [{ addonId: addonOffline, quantity: 1 }],
      },
    });
    expect(offlineResponse.statusCode).toBe(400);
    expect(JSON.parse(offlineResponse.body)).toMatchObject({
      success: false,
      code: "ADDON_NOT_FOUND",
    });

    const internalResponse = await app.inject({
      method: "POST",
      url: "/api/appointments/public",
      payload: {
        barbershopId: shopA,
        serviceId: internalServiceA,
        staffId: ownerA,
        customerName: "Cliente Serviço Interno",
        whatsapp: "11999991006",
        date: dateCreate,
        time: "13:00",
      },
    });
    expect(internalResponse.statusCode).toBe(400);
    expect(JSON.parse(internalResponse.body)).toMatchObject({
      success: false,
      code: "SERVICE_NOT_PUBLICLY_BOOKABLE",
    });
  });

  it("slot que cabia sem adicional desaparece com +30; criação staff e pública conflitam", async () => {
    await app.inject({
      method: "POST",
      url: "/api/appointments",
      headers: authHeader(owner, shopA),
      payload: {
        barbershopId: shopA,
        serviceId: serviceA,
        staffId: ownerA,
        customerName: "Bloqueio Base",
        whatsapp: "11999991007",
        date: dateSlots,
        time: "10:30",
      },
    });

    const withoutAddon = await app.inject({
      method: "GET",
      url: `/api/appointments/slots?barbershopId=${shopA}&date=${dateSlots}&serviceId=${serviceA}&staffId=${ownerA}`,
    });
    expect(withoutAddon.statusCode).toBe(200);
    const withoutBody = JSON.parse(withoutAddon.body) as {
      data: Array<{ time: string; durationMinutes: number }>;
    };
    expect(withoutBody.data).toContainEqual(
      expect.objectContaining({ time: "10:00", durationMinutes: 30 })
    );

    const withAddon = await app.inject({
      method: "GET",
      url: `/api/appointments/slots?barbershopId=${shopA}&date=${dateSlots}&serviceId=${serviceA}&staffId=${ownerA}&addonIds=${addonRegular}&addonQuantities=1`,
    });
    expect(withAddon.statusCode).toBe(200);
    const withBody = JSON.parse(withAddon.body) as {
      data: Array<{ time: string; durationMinutes: number }>;
    };
    expect(withBody.data.some((slot) => slot.time === "10:00")).toBe(false);
    expect(withBody.data[0]?.durationMinutes).toBe(60);

    const staffConflict = await app.inject({
      method: "POST",
      url: "/api/appointments",
      headers: authHeader(owner, shopA),
      payload: {
        barbershopId: shopA,
        serviceId: serviceA,
        staffId: ownerA,
        customerName: "Conflito Staff Adicional",
        whatsapp: "11999991008",
        date: dateSlots,
        time: "10:00",
        addons: [{ addonId: addonRegular, quantity: 1 }],
      },
    });
    expect(staffConflict.statusCode).toBe(409);

    const publicConflict = await app.inject({
      method: "POST",
      url: "/api/appointments/public",
      payload: {
        barbershopId: shopA,
        serviceId: serviceA,
        staffId: ownerA,
        customerName: "Conflito Público Adicional",
        whatsapp: "11999991009",
        date: dateSlots,
        time: "10:00",
        addons: [{ addonId: addonRegular, quantity: 1 }],
      },
    });
    expect(publicConflict.statusCode).toBe(409);
  });

  it("remarcação staff e pública revalidam usando os snapshots do próprio agendamento", async () => {
    const staffAppointment = await app.inject({
      method: "POST",
      url: "/api/appointments",
      headers: authHeader(owner, shopA),
      payload: {
        barbershopId: shopA,
        serviceId: serviceA,
        staffId: ownerA,
        customerName: "Remarca Staff Adicional",
        whatsapp: "11999991010",
        date: dateReschedule,
        time: "09:00",
        addons: [{ addonId: addonRegular, quantity: 1 }],
      },
    });
    expect(staffAppointment.statusCode).toBe(201);
    const staffId = JSON.parse(staffAppointment.body).data.id as string;

    await app.inject({
      method: "POST",
      url: "/api/appointments",
      headers: authHeader(owner, shopA),
      payload: {
        barbershopId: shopA,
        serviceId: serviceA,
        staffId: ownerA,
        customerName: "Bloqueio Remarca Staff",
        whatsapp: "11999991011",
        date: dateReschedule,
        time: "10:00",
      },
    });

    const staffConflict = await app.inject({
      method: "PATCH",
      url: `/api/appointments/${staffId}`,
      headers: authHeader(owner, shopA),
      payload: { date: dateReschedule, time: "09:30" },
    });
    expect(staffConflict.statusCode).toBe(409);

    const publicAppointment = await app.inject({
      method: "POST",
      url: "/api/appointments/public",
      payload: {
        barbershopId: shopA,
        serviceId: serviceA,
        staffId: employeeA,
        customerName: "Remarca Pública Adicional",
        whatsapp: "11999991012",
        date: dateReschedule,
        time: "09:00",
        addons: [{ addonId: addonRegular, quantity: 1 }],
      },
    });
    expect(publicAppointment.statusCode).toBe(201);
    const publicBody = JSON.parse(publicAppointment.body) as {
      data: { id: string; manageToken: string };
    };

    await app.inject({
      method: "POST",
      url: "/api/appointments",
      headers: authHeader(employee, shopA),
      payload: {
        barbershopId: shopA,
        serviceId: serviceA,
        staffId: employeeA,
        customerName: "Bloqueio Remarca Pública",
        whatsapp: "11999991013",
        date: dateReschedule,
        time: "10:00",
      },
    });

    const session = await app.inject({
      method: "POST",
      url: "/api/appointments/public/session",
      payload: { token: publicBody.data.manageToken },
    });
    expect(session.statusCode).toBe(200);
    const sessionToken = JSON.parse(session.body).data.sessionToken as string;

    const publicConflict = await app.inject({
      method: "POST",
      url: "/api/appointments/public/reschedule",
      headers: { authorization: `Bearer ${sessionToken}` },
      payload: { date: dateReschedule, time: "09:30" },
    });
    expect(publicConflict.statusCode).toBe(409);

    const unchanged = await prisma.appointment.findUnique({
      where: { id: publicBody.data.id },
      select: { time: true },
    });
    expect(unchanged?.time).toBe("09:00");
  });

  it("snapshot permanece imutável após editar preço/tempo, inativar e soft delete", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/appointments",
      headers: authHeader(owner, shopA),
      payload: {
        barbershopId: shopA,
        serviceId: serviceA,
        staffId: ownerA,
        customerName: "Cliente Snapshot Imutável",
        whatsapp: "11999991014",
        date: dateSnapshot,
        time: "09:00",
        addons: [{ addonId: addonImmutable, quantity: 1 }],
      },
    });
    expect(created.statusCode).toBe(201);
    const appointmentId = JSON.parse(created.body).data.id as string;

    await prisma.salonAddon.update({
      where: { id: addonImmutable },
      data: {
        name: "Adicional alterado",
        price: 99,
        durationMinutes: 60,
        active: false,
      },
    });
    await prisma.serviceAddonLink.update({
      where: {
        serviceId_addonId: { serviceId: serviceA, addonId: addonImmutable },
      },
      data: { priceOverride: 30, timeOverride: 60 },
    });
    await prisma.salonAddon.update({
      where: { id: addonImmutable },
      data: { deletedAt: new Date() },
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/appointments/${appointmentId}`,
      headers: authHeader(owner, shopA),
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      data: {
        addons: Array<{
          addonId: string;
          name: string;
          unitPrice: number;
          durationMinutes: number;
        }>;
        totalPrice: number;
        totalDurationMinutes: number;
      };
    };
    expect(body.data.addons).toEqual([
      {
        addonId: addonImmutable,
        name: "Adicional snapshot",
        unitPrice: 25,
        quantity: 1,
        durationMinutes: 45,
        commissionable: true,
      },
    ]);
    expect(body.data.totalPrice).toBe(75);
    expect(body.data.totalDurationMinutes).toBe(75);
  });

  it("dois salões: B não usa, não vê nem referencia adicional de A", async () => {
    const creation = await app.inject({
      method: "POST",
      url: "/api/appointments",
      headers: authHeader(ownerOfB, shopB),
      payload: {
        barbershopId: shopB,
        serviceId: serviceB,
        staffId: ownerB,
        customerName: "Cliente Isolado B",
        whatsapp: "11999991015",
        date: dateTenant,
        time: "09:00",
        addons: [{ addonId: addonRegular, quantity: 1 }],
      },
    });
    expect(creation.statusCode).toBe(400);
    expect(JSON.parse(creation.body)).toMatchObject({
      success: false,
      code: "ADDON_NOT_FOUND",
    });

    const slots = await app.inject({
      method: "GET",
      url: `/api/appointments/slots?barbershopId=${shopB}&date=${dateTenant}&serviceId=${serviceB}&addonIds=${addonRegular}`,
    });
    expect(slots.statusCode).toBe(400);
    expect(JSON.parse(slots.body)).toMatchObject({
      success: false,
      code: "ADDON_NOT_FOUND",
    });

    const validCreation = await app.inject({
      method: "POST",
      url: "/api/appointments",
      headers: authHeader(ownerOfB, shopB),
      payload: {
        barbershopId: shopB,
        serviceId: serviceB,
        staffId: ownerB,
        customerName: "Cliente B Sem Adicional",
        whatsapp: "11999991016",
        date: dateTenant,
        time: "10:00",
      },
    });
    expect(validCreation.statusCode).toBe(201);
    const appointmentId = JSON.parse(validCreation.body).data.id as string;

    const list = await app.inject({
      method: "GET",
      url: `/api/appointments?barbershopId=${shopB}&page=1&limit=20`,
      headers: authHeader(ownerOfB, shopB),
    });
    expect(list.statusCode).toBe(200);
    expect(list.body).not.toContain(addonRegular);

    const completion = await app.inject({
      method: "POST",
      url: `/api/appointments/${appointmentId}/complete`,
      headers: authHeader(ownerOfB, shopB),
      payload: { paymentMethod: "pix" },
    });
    expect(completion.statusCode).toBe(200);
    expect(completion.body).not.toContain(addonRegular);

    const snapshots = await prisma.appointmentAddon.findMany({
      where: { appointmentId },
    });
    expect(snapshots).toHaveLength(0);
  });

  it("conclusão usa total, base de comissão mista, ledger e fiado; pacote faz split", async () => {
    const normal = await app.inject({
      method: "POST",
      url: "/api/appointments",
      headers: authHeader(owner, shopA),
      payload: {
        barbershopId: shopA,
        serviceId: serviceA,
        staffId: ownerA,
        customerName: "Cliente Financeiro",
        whatsapp: "11999991017",
        date: dateFinancial,
        time: "09:00",
        addons: [
          { addonId: addonRegular, quantity: 2 },
          { addonId: addonNonCommissionable, quantity: 1 },
        ],
      },
    });
    expect(normal.statusCode).toBe(201);
    const normalId = JSON.parse(normal.body).data.id as string;

    const normalCompletion = await app.inject({
      method: "POST",
      url: `/api/appointments/${normalId}/complete`,
      headers: authHeader(owner, shopA),
      payload: { paymentMethod: "fiado" },
    });
    expect(normalCompletion.statusCode).toBe(200);
    const normalBody = JSON.parse(normalCompletion.body) as {
      data: { finalPrice: number };
    };
    expect(normalBody.data.finalPrice).toBe(97);

    const normalLedger = await prisma.cashMovement.findFirst({
      where: {
        barbershopId: shopA,
        sourceType: "APPOINTMENT",
        sourceId: normalId,
        type: "SERVICE_SALE",
      },
    });
    expect(Number(normalLedger?.amount)).toBe(97);
    const normalFiado = await prisma.fiado.findFirst({
      where: { barbershopId: shopA, notes: { contains: normalId } },
    });
    expect(normalFiado?.originalAmount).toBe(97);
    const normalCommission = await prisma.commissionEntry.findMany({
      where: { appointmentId: normalId },
    });
    expect(normalCommission).toHaveLength(1);
    expect(normalCommission[0]?.amount).toBeCloseTo(9, 2);

    const packageWithAddon = await app.inject({
      method: "POST",
      url: "/api/appointments",
      headers: authHeader(owner, shopA),
      payload: {
        barbershopId: shopA,
        serviceId: serviceA,
        staffId: ownerA,
        clientPackageId,
        customerName: "Pacote com Adicional",
        whatsapp: "11999991018",
        date: dateFinancial,
        time: "10:00",
        addons: [{ addonId: addonRegular, quantity: 1 }],
      },
    });
    expect(packageWithAddon.statusCode).toBe(201);
    const packageWithAddonId = JSON.parse(packageWithAddon.body).data.id as string;

    const packageCompletion = await app.inject({
      method: "POST",
      url: `/api/appointments/${packageWithAddonId}/complete`,
      headers: authHeader(owner, shopA),
      payload: { paymentMethod: "fiado" },
    });
    expect(packageCompletion.statusCode).toBe(200);
    expect(JSON.parse(packageCompletion.body).data.finalPrice).toBe(70);

    const packageLedger = await prisma.cashMovement.findFirst({
      where: {
        barbershopId: shopA,
        sourceType: "APPOINTMENT",
        sourceId: packageWithAddonId,
        type: "SERVICE_SALE",
      },
    });
    expect(Number(packageLedger?.amount)).toBe(20);
    const packageFiado = await prisma.fiado.findFirst({
      where: { barbershopId: shopA, notes: { contains: packageWithAddonId } },
    });
    expect(packageFiado?.originalAmount).toBe(20);
    const packageCommission = await prisma.commissionEntry.findMany({
      where: { appointmentId: packageWithAddonId },
    });
    expect(packageCommission).toHaveLength(1);
    expect(packageCommission[0]?.amount).toBeCloseTo(2, 2);

    const packageWithoutAddon = await app.inject({
      method: "POST",
      url: "/api/appointments",
      headers: authHeader(owner, shopA),
      payload: {
        barbershopId: shopA,
        serviceId: serviceA,
        staffId: ownerA,
        clientPackageId,
        customerName: "Pacote sem Adicional",
        whatsapp: "11999991019",
        date: dateFinancial,
        time: "11:00",
      },
    });
    expect(packageWithoutAddon.statusCode).toBe(201);
    const packageWithoutAddonId = JSON.parse(packageWithoutAddon.body).data.id as string;

    const packageWithoutCompletion = await app.inject({
      method: "POST",
      url: `/api/appointments/${packageWithoutAddonId}/complete`,
      headers: authHeader(owner, shopA),
      payload: { paymentMethod: "pix" },
    });
    expect(packageWithoutCompletion.statusCode).toBe(200);
    expect(JSON.parse(packageWithoutCompletion.body).data.finalPrice).toBe(50);
    expect(
      await prisma.cashMovement.count({
        where: { sourceType: "APPOINTMENT", sourceId: packageWithoutAddonId },
      })
    ).toBe(0);
    expect(
      await prisma.commissionEntry.count({
        where: { appointmentId: packageWithoutAddonId },
      })
    ).toBe(0);
  });
});
