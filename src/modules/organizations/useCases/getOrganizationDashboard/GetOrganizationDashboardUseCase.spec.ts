/// <reference types="vitest/globals" />
import { AppError } from "@/shared/errors/AppError";
import { requestContext } from "@/shared/infra/http/requestContext";
import { prisma } from "@/libs/prismaClient";
import { resolveOrgAccessToBarbershop } from "@/shared/utils/organizationAccess";
import { withShopContext } from "@/shared/utils/withShopContext";
import { getShopOpenState, utcDateFromYmd } from "@/modules/barbershops/utils/getShopOpenState";
import {
  addDaysYmd,
  minutesInTimeZone,
  timeToMinutes,
  weekdayInTimeZone,
  ymdInTimeZone,
} from "@/modules/barbershops/utils/shopOpenState";
import { OrganizationRepository } from "../../organizationRepository";
import {
  GetOrganizationDashboardUseCase,
  type OrgDashboardShopDTO,
} from "./GetOrganizationDashboardUseCase";

type Row = Record<string, any>;

const db: {
  org: Row | null;
  barbershops: Row[];
  users: Row[];
  members: Row[];
  queue: Row[];
  appointments: Row[];
  schedules: Row[];
} = { org: null, barbershops: [], users: [], members: [], queue: [], appointments: [], schedules: [] };

const consultas: string[] = [];

/**
 * Tabelas com policy `tenant_isolation`: a linha só é visível quando o GUC
 * `app.current_barbershop_id` está vazio (leitura global) ou casar com o tenant.
 * `barbershop`/`organization`/`organization_members` não têm RLS.
 */
const TABELAS_COM_RLS = new Set(["queueItem", "appointment", "schedule", "user"]);

const OPERADORES_DE_FILTRO = new Set(["in", "notIn", "equals", "not", "gte", "gt", "lte", "lt"]);

function ts(value: unknown): number {
  return value instanceof Date ? value.getTime() : new Date(value as string).getTime();
}

function igual(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) return ts(a) === ts(b);
  return a === b;
}

function matchWhere(row: Row, where?: Row): boolean {
  for (const [chave, cond] of Object.entries(where ?? {})) {
    if (cond === undefined) continue;
    if (chave === "OR") {
      if (!(cond as Row[]).some((item) => matchWhere(row, item))) return false;
      continue;
    }
    if (chave === "AND") {
      if (!(cond as Row[]).every((item) => matchWhere(row, item))) return false;
      continue;
    }
    const valor = row[chave];
    if (valor == null && cond == null) continue;

    if (cond !== null && typeof cond === "object" && !(cond instanceof Date)) {
      const chaves = Object.keys(cond as Row);
      if (chaves.length > 0 && chaves.every((k) => OPERADORES_DE_FILTRO.has(k))) {
        for (const [op, esperado] of Object.entries(cond as Row)) {
          if (op === "in" && !(esperado as unknown[]).some((v) => igual(v, valor))) return false;
          if (op === "notIn" && (esperado as unknown[]).some((v) => igual(v, valor))) return false;
          if (op === "equals" && !igual(esperado, valor)) return false;
          if (op === "gte" && ts(valor) < ts(esperado)) return false;
          if (op === "gt" && ts(valor) <= ts(esperado)) return false;
          if (op === "lte" && ts(valor) > ts(esperado)) return false;
          if (op === "lt" && ts(valor) >= ts(esperado)) return false;
        }
        continue;
      }
      // Chave composta (`organizationId_userId`) ou filtro aninhado na mesma linha.
      if (!matchWhere(row, cond as Row)) return false;
      continue;
    }

    if (!igual(valor, cond)) return false;
  }
  return true;
}

function visivel(modelo: string, row: Row): boolean {
  if (!TABELAS_COM_RLS.has(modelo)) return true;
  const contexto = requestContext.getStore()?.barbershopId ?? "";
  if (contexto === "") return true;
  return row.barbershopId == null || row.barbershopId === contexto;
}

function projetar(row: Row, select?: Row): Row {
  if (!select) return { ...row };
  const saida: Row = {};
  for (const [campo, config] of Object.entries(select)) {
    if (!config) continue;
    if (config === true) saida[campo] = row[campo];
    else if (typeof config === "object" && (config as Row).select) {
      saida[campo] = row[campo] ? projetar(row[campo], (config as Row).select) : null;
    }
  }
  return saida;
}

function ler(modelo: string, tabela: Row[], where?: Row, select?: Row): Row[] {
  consultas.push(`${modelo}.${where ? "where" : "all"}`);
  return tabela.filter((row) => visivel(modelo, row) && matchWhere(row, where)).map((row) => projetar(row, select));
}

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    organization: {
      findUnique: async (args: { where: { id: string } }) => {
        consultas.push("organization.findUnique");
        return db.org && db.org.id === args.where.id ? db.org : null;
      },
    },
    barbershop: {
      findUnique: async (args: { where: { id: string } }) => {
        consultas.push("barbershop.findUnique");
        return db.barbershops.find((row) => row.id === args.where.id) ?? null;
      },
    },
    organizationMember: {
      findUnique: async (args: { where: { organizationId_userId: Row } }) => {
        consultas.push("organizationMember.findUnique");
        const { organizationId, userId } = args.where.organizationId_userId;
        return (
          db.members.find((row) => row.organizationId === organizationId && row.userId === userId) ?? null
        );
      },
    },
    user: {
      findMany: async (args: { where: Row; select?: Row }) => ler("user", db.users, args.where, args.select),
      findFirst: async (args: { where: Row; select?: Row }) =>
        ler("user", db.users, args.where, args.select)[0] ?? null,
    },
    queueItem: {
      findMany: async (args: { where: Row; select?: Row }) =>
        ler("queueItem", db.queue, args.where, args.select),
    },
    appointment: {
      findMany: async (args: { where: Row; select?: Row }) =>
        ler("appointment", db.appointments, args.where, args.select),
    },
    schedule: {
      findMany: async (args: { where: Row; select?: Row }) =>
        ler("schedule", db.schedules, args.where, args.select),
      findUnique: async (args: { where: Row; select?: Row }) =>
        ler("schedule", db.schedules, args.where, args.select)[0] ?? null,
    },
  },
}));

/** Agora fixo: 2026-10-01T02:00Z = 2026-09-30 23:00 em São Paulo, 2026-10-01 11:00 em Tóquio. */
const AGORA = new Date("2026-10-01T02:00:00.000Z");
const ORG = "org-1";

const SERVICO = { id: "svc-a", price: 45, avgTimeMinutes: 30 };
const SERVICO_LONGO = { id: "svc-b", price: 60, avgTimeMinutes: 90 };

function montarBanco() {
  const loja = (id: string, name: string, timezone: string, active = true): Row => ({
    id,
    name,
    logoUrl: null,
    timezone,
    active,
    organizationId: ORG,
    manualStatus: "AUTO",
    manualStatusSetAt: null,
    openingMode: "SCHEDULE",
    queueClosedAt: null,
  });

  db.barbershops = [
    loja("shop-sp", "Alpha Corte", "America/Sao_Paulo"),
    loja("shop-tk", "Beta Tokyo", "Asia/Tokyo"),
    loja("shop-ny", "Gamma Nova York", "America/New_York"),
    loja("shop-off", "Delta Fechado", "America/Sao_Paulo", false),
  ];
  db.org = {
    id: ORG,
    name: "Rede Exemplo",
    ownerId: "user-2",
    slug: "rede-exemplo",
    logoUrl: null,
    barbershops: db.barbershops,
    members: [
      { id: "m1", organizationId: ORG, userId: "user-1", role: "VIEWER" },
      { id: "m2", organizationId: ORG, userId: "user-2", role: "ADMIN" },
      { id: "m3", organizationId: ORG, userId: "user-3", role: "MEMBER" },
      // user-4 é MASTER_ADMIN e membro: os dois caminhos exigem `isMember` antes do atalho.
      { id: "m4", organizationId: ORG, userId: "user-4", role: "VIEWER" },
    ],
    owner: { id: "user-2" },
  };
  db.members = db.org.members;
  // user-1 é dono do salão de Tóquio — visível só quando o contexto da sessão é aquele salão.
  db.users = [
    { id: "user-1", barbershopId: "shop-tk", role: "OWNER", active: true, deletedAt: null },
    { id: "user-2", barbershopId: "shop-sp", role: "OWNER", active: true, deletedAt: null },
    { id: "user-3", barbershopId: "shop-ny", role: "EMPLOYEE", active: true, deletedAt: null },
  ];

  const fila = (
    id: string,
    barbershopId: string,
    status: string,
    joinedAt: string,
    extra: Row = {}
  ): Row => ({ id, barbershopId, status, joinedAt: new Date(joinedAt), service: SERVICO, ...extra });

  db.queue = [
    fila("q1", "shop-sp", "WAITING", "2026-09-30T21:30:00Z"),
    fila("q2", "shop-sp", "IN_CHAIR", "2026-09-30T20:00:00Z"),
    fila("q3", "shop-sp", "WAITING", "2026-09-29T21:30:00Z"), // ontem no fuso do salão
    fila("q4", "shop-tk", "WAITING", "2026-10-01T01:30:00Z"),
    fila("q5", "shop-tk", "IN_CHAIR", "2026-09-30T23:00:00Z"), // já é 01/10 em Tóquio
    fila("q6", "shop-ny", "WAITING", "2026-09-30T23:30:00Z"),
    fila("q7", "shop-ny", "WAITING", "2026-10-01T01:00:00Z"), // ainda 30/09 em Nova York
    fila("c1", "shop-sp", "COMPLETED", "2026-09-30T20:00:00Z", {
      completedAt: new Date("2026-09-30T21:00:00Z"),
      finalPrice: 100,
    }),
    fila("c2", "shop-sp", "COMPLETED", "2026-09-29T11:00:00Z", {
      completedAt: new Date("2026-09-29T12:00:00Z"),
      finalPrice: 50,
    }),
    fila("c3", "shop-sp", "COMPLETED", "2026-09-05T11:00:00Z", {
      completedAt: new Date("2026-09-05T12:00:00Z"),
      finalPrice: 30,
    }),
    fila("c4", "shop-sp", "COMPLETED", "2026-08-31T22:00:00Z", {
      completedAt: new Date("2026-08-31T23:00:00Z"),
      finalPrice: 999, // antes do rangeStart de SP: fora do WHERE antigo e do lote
    }),
    fila("c5", "shop-sp", "COMPLETED", "2026-09-28T09:00:00Z", {
      completedAt: new Date("2026-09-28T10:00:00Z"),
      finalPrice: null, // cai no fallback de service.price
      service: SERVICO_LONGO,
    }),
    fila("c6", "shop-tk", "COMPLETED", "2026-09-27T14:00:00Z", {
      // 00:00 de 28/09 em Tóquio: ymd cai na semana corrente, mas completedAt é
      // anterior ao rangeStart de Tóquio — o WHERE antigo descartava; o lote precisa
      // reaplicar o limite por salão para manter o mesmo número.
      completedAt: new Date("2026-09-27T15:00:00Z"),
      finalPrice: 777,
    }),
    fila("c7", "shop-tk", "COMPLETED", "2026-10-01T00:00:00Z", {
      completedAt: new Date("2026-10-01T01:00:00Z"),
      finalPrice: 70,
    }),
    fila("c8", "shop-tk", "COMPLETED", "2026-09-28T11:00:00Z", {
      completedAt: new Date("2026-09-28T12:00:00Z"),
      finalPrice: 40,
    }),
    fila("c9", "shop-ny", "COMPLETED", "2026-09-30T22:00:00Z", {
      completedAt: new Date("2026-09-30T22:30:00Z"),
      finalPrice: 90,
    }),
    fila("c10", "shop-ny", "COMPLETED", "2026-08-31T23:30:00Z", {
      completedAt: new Date("2026-09-01T00:00:00Z"), // == rangeStart de NY, e o ymd local ainda é 08/09
      finalPrice: 888,
    }),
  ];

  const agendamento = (
    id: string,
    barbershopId: string,
    status: string,
    date: string,
    time: string,
    service: Row = SERVICO
  ): Row => ({ id, barbershopId, status, date: new Date(date), time, service });

  db.appointments = [
    agendamento("a1", "shop-sp", "CONFIRMED", "2026-09-30T00:00:00Z", "22:30"), // na janela
    agendamento("a2", "shop-sp", "CONFIRMED", "2026-10-01T00:00:00Z", "23:30"), // "hoje" de Tóquio
    agendamento("a3", "shop-sp", "CHECKED_IN", "2026-09-30T00:00:00Z", "21:00"),
    agendamento("a4", "shop-tk", "CONFIRMED", "2026-10-01T00:00:00Z", "10:30"), // na janela
    agendamento("a5", "shop-tk", "CONFIRMED", "2026-09-30T00:00:00Z", "09:00"), // "hoje" de SP
    agendamento("a6", "shop-ny", "CONFIRMED", "2026-09-30T00:00:00Z", "21:30", SERVICO_LONGO),
    agendamento("a7", "shop-ny", "CANCELLED", "2026-09-30T00:00:00Z", "22:00"),
  ];

  db.schedules = [];
  for (let day = 0; day < 7; day += 1) {
    db.schedules.push({
      id: `sc-sp-${day}`,
      barbershopId: "shop-sp",
      dayOfWeek: day,
      isOpen: true,
      openTime: "00:00",
      closeTime: "23:59",
    });
    db.schedules.push({
      id: `sc-ny-${day}`,
      barbershopId: "shop-ny",
      dayOfWeek: day,
      isOpen: false,
      openTime: "00:00",
      closeTime: "23:59",
    });
    // shop-tk deliberadamente sem escala: abre = false nos dois caminhos.
  }
}

/**
 * Caminho ANTIGO (antes do B15): uma resolução de acesso + um lote de 4-5 consultas
 * POR salão, com troca de contexto RLS via `withShopContext`. Usado como referência de
 * resultado — se a implementação em lote divergir de qualquer número, este teste falha.
 */
async function dashboardAntigo(
  organizationId: string,
  userId: string,
  role: string,
  sessionBarbershopId?: string
): Promise<OrgDashboardShopDTO[]> {
  const org = await new OrganizationRepository().findById(organizationId);
  if (!org) throw new AppError("Organização não encontrada", 404);

  const isMember = org.ownerId === userId || org.members.some((m: any) => m.userId === userId);
  if (!isMember) throw new AppError("Sem acesso a esta organização", 403);

  const now = new Date();
  const shops = org.barbershops.filter((s: any) => s.active);

  const entries = await Promise.all(
    shops.map((shop: any) => buildShopEntryAntigo(shop, userId, role, now, sessionBarbershopId))
  );

  return entries
    .filter((entry): entry is OrgDashboardShopDTO => entry !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function buildShopEntryAntigo(
  shop: { id: string; name: string; logoUrl: string | null; timezone: string | null },
  userId: string,
  role: string,
  now: Date,
  sessionBarbershopId?: string
): Promise<OrgDashboardShopDTO | null> {
  const access = await resolveOrgAccessToBarbershop(userId, role, shop.id);
  if (access === "NONE") return null;

  const tz = shop.timezone || "America/Sao_Paulo";
  const todayYmd = ymdInTimeZone(now, tz);
  const weekday = weekdayInTimeZone(utcDateFromYmd(todayYmd), "UTC");
  const weekStartYmd = addDaysYmd(todayYmd, -((weekday + 6) % 7));
  const monthStartYmd = `${todayYmd.slice(0, 8)}01`;
  const rangeStartYmd = weekStartYmd < monthStartYmd ? weekStartYmd : monthStartYmd;
  const rangeStart = utcDateFromYmd(rangeStartYmd);
  const nowMinutes = minutesInTimeZone(now, tz);

  const data = await withShopContext(sessionBarbershopId, shop.id, async () => {
    const [activeQueue, todayAppointments, openState, completedRows] = await Promise.all([
      prisma.queueItem.findMany({
        where: {
          barbershopId: shop.id,
          status: { in: ["WAITING", "IN_CHAIR"] },
          joinedAt: { gte: utcDateFromYmd(todayYmd) },
        },
        select: { joinedAt: true, status: true },
      }),
      prisma.appointment.findMany({
        where: {
          barbershopId: shop.id,
          status: "CONFIRMED",
          date: utcDateFromYmd(todayYmd),
        },
        select: { time: true, service: { select: { avgTimeMinutes: true } } },
      }),
      getShopOpenState(shop.id, { now }),
      access === "FULL"
        ? prisma.queueItem.findMany({
            where: {
              barbershopId: shop.id,
              status: "COMPLETED",
              completedAt: { gte: rangeStart, lte: now },
            },
            select: {
              completedAt: true,
              finalPrice: true,
              service: { select: { price: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    return { activeQueue, todayAppointments, openState, completedRows };
  });

  const queueToday = data.activeQueue.filter((q: { joinedAt: Date }) =>
    ymdInTimeZone(q.joinedAt, tz) === todayYmd
  );
  const waitingCount = queueToday.filter((q: { status: string }) => q.status === "WAITING").length;
  const inServiceCount =
    queueToday.filter((q: { status: string }) => q.status === "IN_CHAIR").length +
    data.todayAppointments.filter(
      (a: { time: string; service: { avgTimeMinutes: number } | null }) => {
        const start = timeToMinutes(a.time);
        const end = start + (a.service?.avgTimeMinutes ?? 30);
        return start <= nowMinutes && nowMinutes < end;
      }
    ).length;
  const liveNow = waitingCount + inServiceCount;

  const entry: OrgDashboardShopDTO = {
    barbershopId: shop.id,
    name: shop.name,
    logoUrl: shop.logoUrl,
    isOpen: data.openState.open,
    accessLevel: access === "FULL" ? "FULL" : "OPERATIONAL",
    liveNow,
    waitingCount,
    inServiceCount,
  };

  if (access === "FULL") {
    const revenue = { today: 0, week: 0, month: 0 };
    for (const row of data.completedRows as Array<{
      completedAt: Date;
      finalPrice: number | null;
      service: { price: number } | null;
    }>) {
      const price = row.finalPrice ?? row.service?.price ?? 0;
      const ymd = ymdInTimeZone(row.completedAt, tz);
      if (ymd >= monthStartYmd) revenue.month += price;
      if (ymd >= weekStartYmd) revenue.week += price;
      if (ymd === todayYmd) revenue.today += price;
    }
    entry.revenue = {
      today: Math.round(revenue.today * 100) / 100,
      week: Math.round(revenue.week * 100) / 100,
      month: Math.round(revenue.month * 100) / 100,
    };
  }

  return entry;
}

async function rodarComSessao<T>(
  sessionBarbershopId: string | undefined,
  fn: () => Promise<T>
): Promise<T> {
  consultas.length = 0;
  return sessionBarbershopId
    ? requestContext.run({ barbershopId: sessionBarbershopId }, fn)
    : fn();
}

async function equivalente(
  sessionBarbershopId: string | undefined,
  userId: string,
  role: string
): Promise<{ antigo: OrgDashboardShopDTO[]; novo: OrgDashboardShopDTO[]; consultasDoAntigo: string[] }> {
  const antigo = await rodarComSessao(sessionBarbershopId, () =>
    dashboardAntigo(ORG, userId, role, sessionBarbershopId)
  );
  const consultasDoAntigo = [...consultas];
  const novo = await rodarComSessao(sessionBarbershopId, () =>
    new GetOrganizationDashboardUseCase().execute(ORG, userId, role, sessionBarbershopId)
  );
  return { antigo, novo, consultasDoAntigo };
}

beforeEach(() => {
  montarBanco();
  consultas.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GetOrganizationDashboardUseCase — equivalência com o caminho antigo", () => {
  it("OWNER/ADMIN da org: mesmos números para os 3 salões (fila, agenda, isOpen e receita)", async () => {
    const { antigo, novo } = await equivalente("shop-sp", "user-2", "OWNER");
    expect(novo).toEqual(antigo);
    expect(novo).toHaveLength(3);
    expect(novo.every((entry) => entry.accessLevel === "FULL")).toBe(true);
    expect(novo.every((entry) => entry.revenue !== undefined)).toBe(true);
  });

  it("MEMBER da org: tudo OPERATIONAL e nenhuma linha de receita lida", async () => {
    const { antigo, novo } = await equivalente("shop-sp", "user-3", "EMPLOYEE");
    expect(novo).toEqual(antigo);
    expect(novo.every((entry) => entry.accessLevel === "OPERATIONAL")).toBe(true);
    expect(novo.every((entry) => entry.revenue === undefined)).toBe(true);
  });

  it("dono de 1 salão só com a sessão naquele salão: FULL só no salão de Tóquio", async () => {
    const { antigo, novo } = await equivalente("shop-tk", "user-1", "EMPLOYEE");
    expect(novo).toEqual(antigo);
    const porId = new Map(novo.map((entry) => [entry.barbershopId, entry.accessLevel]));
    expect(porId.get("shop-tk")).toBe("FULL");
    expect(porId.get("shop-sp")).toBe("OPERATIONAL");
    expect(porId.get("shop-ny")).toBe("OPERATIONAL");
  });

  it("dono de 1 salão com a sessão em OUTRO salão: RLS esconde a linha de dono nos dois caminhos", async () => {
    const { antigo, novo } = await equivalente("shop-sp", "user-1", "EMPLOYEE");
    expect(novo).toEqual(antigo);
    expect(novo.every((entry) => entry.accessLevel === "OPERATIONAL")).toBe(true);
  });

  it("MASTER_ADMIN: acesso FULL em tudo sem consultar a tabela de usuários", async () => {
    const { antigo, novo } = await equivalente(undefined, "user-4", "MASTER_ADMIN");
    expect(novo).toEqual(antigo);
    expect(novo.every((entry) => entry.accessLevel === "FULL")).toBe(true);
    expect(consultas.some((nome) => nome.startsWith("user."))).toBe(false);
  });

  it("sem contexto de sessão (token sem barbershopId)", async () => {
    const { antigo, novo } = await equivalente(undefined, "user-2", "OWNER");
    expect(novo).toEqual(antigo);
  });

  it("descarta salão inativo e mantém a ordenação por nome", async () => {
    const { novo } = await equivalente("shop-sp", "user-2", "OWNER");
    expect(novo.map((entry) => entry.name)).toEqual(["Alpha Corte", "Beta Tokyo", "Gamma Nova York"]);
  });

  it("404 para organização inexistente e 403 para quem não é membro", async () => {
    await expect(
      new GetOrganizationDashboardUseCase().execute("org-x", "user-2", "OWNER")
    ).rejects.toMatchObject({ message: "Organização não encontrada", statusCode: 404 });
    await expect(
      new GetOrganizationDashboardUseCase().execute(ORG, "user-9", "EMPLOYEE")
    ).rejects.toMatchObject({ message: "Sem acesso a esta organização", statusCode: 403 });
  });
});

describe("GetOrganizationDashboardUseCase — queries por request (meta B15 ≤ 10)", () => {
  it("caminho novo: 6 consultas para 3 salões (antes: 23)", async () => {
    await rodarComSessao("shop-sp", () =>
      new GetOrganizationDashboardUseCase().execute(ORG, "user-2", "OWNER", "shop-sp")
    );
    const doNovo = [...consultas];
    expect(doNovo).toHaveLength(6);
    expect(doNovo.length).toBeLessThanOrEqual(10);

    await rodarComSessao("shop-sp", () => dashboardAntigo(ORG, "user-2", "OWNER", "shop-sp"));
    expect(consultas.length).toBe(23);
  });

  it("sem salão FULL: o lote de receita nem é emitido", async () => {
    await rodarComSessao("shop-sp", () =>
      new GetOrganizationDashboardUseCase().execute(ORG, "user-3", "EMPLOYEE", "shop-sp")
    );
    expect(consultas).toHaveLength(5);
  });

  it("não emite consulta quando a organização não tem salão ativo", async () => {
    db.barbershops = db.barbershops.map((shop) => ({ ...shop, active: false }));
    db.org = { ...db.org!, barbershops: db.barbershops };
    await rodarComSessao("shop-sp", () =>
      new GetOrganizationDashboardUseCase().execute(ORG, "user-2", "OWNER", "shop-sp")
    );
    expect(consultas).toEqual(["organization.findUnique"]);
  });
});
