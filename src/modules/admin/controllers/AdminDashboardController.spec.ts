/// <reference types="vitest/globals" />

const barbershopFindMany = vi.fn();
const barbershopCount = vi.fn();
const appointmentFindMany = vi.fn();
const appointmentCount = vi.fn();
const queueItemFindMany = vi.fn();
const queueItemCount = vi.fn();
const userCount = vi.fn();

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    barbershop: {
      findMany: (...args: unknown[]) => barbershopFindMany(...args),
      count: (...args: unknown[]) => barbershopCount(...args),
    },
    appointment: {
      findMany: (...args: unknown[]) => appointmentFindMany(...args),
      count: (...args: unknown[]) => appointmentCount(...args),
    },
    queueItem: {
      findMany: (...args: unknown[]) => queueItemFindMany(...args),
      count: (...args: unknown[]) => queueItemCount(...args),
    },
    user: { count: (...args: unknown[]) => userCount(...args) },
  },
}));

import { AdminDashboardController } from "./AdminDashboardController";

type Period = "day" | "week" | "1m" | "3m" | "6m" | "12m" | "1y" | "5y";
type Format = "day" | "week" | "month" | "year";
type Slot = { label: string; start: Date; end: Date };
type Row = { createdAt: Date; joinedAt: Date; status: string };

const FIXED_NOW = new Date(2026, 8, 29, 12, 0, 0);

function referencePeriodConfig(period: Period): { startDate: Date; format: Format } {
  const now = new Date();
  const start = new Date(now);
  switch (period) {
    case "day":
      start.setDate(now.getDate() - 1);
      return { startDate: start, format: "day" };
    case "week":
      start.setDate(now.getDate() - 7);
      return { startDate: start, format: "day" };
    case "1m":
      start.setMonth(now.getMonth() - 1);
      return { startDate: start, format: "day" };
    case "3m":
      start.setMonth(now.getMonth() - 3);
      return { startDate: start, format: "week" };
    case "6m":
      start.setMonth(now.getMonth() - 6);
      return { startDate: start, format: "month" };
    case "12m":
      start.setFullYear(now.getFullYear() - 1);
      return { startDate: start, format: "month" };
    case "1y":
      start.setFullYear(now.getFullYear() - 1);
      return { startDate: start, format: "month" };
    case "5y":
      start.setFullYear(now.getFullYear() - 5);
      return { startDate: start, format: "year" };
    default:
      start.setFullYear(now.getFullYear() - 1);
      return { startDate: start, format: "month" };
  }
}

function referenceLabel(date: Date, format: Format): string {
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  if (format === "day") return `${date.getDate()}/${months[date.getMonth()]}`;
  if (format === "week") return `S${Math.ceil(date.getDate() / 7)} ${months[date.getMonth()]}`;
  if (format === "month") return months[date.getMonth()] + "/" + String(date.getFullYear()).slice(2);
  return String(date.getFullYear());
}

function referenceSlots(period: Period): Slot[] {
  const { startDate, format } = referencePeriodConfig(period);
  const now = new Date();
  const slots: Slot[] = [];
  const current = new Date(startDate);

  while (current <= now) {
    const slotEnd = new Date(current);
    if (format === "day") slotEnd.setDate(current.getDate() + 1);
    else if (format === "week") slotEnd.setDate(current.getDate() + 7);
    else if (format === "month") slotEnd.setMonth(current.getMonth() + 1);
    else slotEnd.setFullYear(current.getFullYear() + 1);

    slots.push({ label: referenceLabel(new Date(current), format), start: new Date(current), end: slotEnd });

    if (format === "day") current.setDate(current.getDate() + 1);
    else if (format === "week") current.setDate(current.getDate() + 7);
    else if (format === "month") current.setMonth(current.getMonth() + 1);
    else current.setFullYear(current.getFullYear() + 1);
  }

  return slots;
}

/** Contagem antiga: 1 `count()` por slot com `gte slotStart` e `lt slotEnd`. */
function referenceCounts(slots: Slot[], rows: Row[], field: "createdAt" | "joinedAt", status?: string) {
  return slots.map((slot) =>
    rows.filter((row) => {
      if (status && row.status !== status) return false;
      const value = row[field].getTime();
      return value >= slot.start.getTime() && value < slot.end.getTime();
    }).length,
  );
}

function buildFixture(): Row[] {
  const rows: Row[] = [];
  const from = new Date(2021, 0, 1).getTime();
  const to = FIXED_NOW.getTime();

  for (let i = 0; i < 800; i += 1) {
    const offset = Math.floor(((i * 2654435761) % 100000) / 100000 * (to - from));
    const at = new Date(from + offset);
    rows.push({ createdAt: at, joinedAt: at, status: i % 3 === 0 ? "COMPLETED" : "WAITING" });
    rows.push({ createdAt: at, joinedAt: at, status: "CANCELLED" });
  }

  for (let i = 0; i < 40; i += 1) {
    const at = new Date(from + i * 86_400_000 * 17);
    rows.push({ createdAt: at, joinedAt: at, status: "COMPLETED" });
  }

  return rows;
}

function makeReply() {
  const reply = {
    status: vi.fn(),
    send: vi.fn(),
  };
  reply.status.mockReturnValue(reply);
  return reply;
}

async function renderChart(period: Period) {
  const reply = makeReply();
  const controller = new AdminDashboardController();
  await controller.getDashboard({ query: { period } } as never, reply as never);
  return reply.send.mock.calls[0][0] as {
    data: {
      chartData: Array<{ label: string; newShops: number; appointments: number; completedQueue: number }>;
    };
  };
}

describe("AdminDashboardController chartData", () => {
  let fixture: Row[];
  let activeRows: Row[];

  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_NOW);
    fixture = buildFixture();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    activeRows = fixture;

    barbershopCount.mockResolvedValue(0);
    userCount.mockResolvedValue(0);

    barbershopFindMany.mockImplementation(async (args: { take?: number; where?: { createdAt: { gte: Date; lt: Date } } }) => {
      if (args.take === 5) return [];
      const range = args.where?.createdAt;
      if (!range) return [];
      return activeRows
        .filter((row) => row.createdAt >= range.gte && row.createdAt < range.lt)
        .map((row) => ({ createdAt: row.createdAt }));
    });

    appointmentFindMany.mockImplementation(
      async (args: { where: { createdAt: { gte: Date; lt: Date } } }) =>
        activeRows
          .filter((row) => row.createdAt >= args.where.createdAt.gte && row.createdAt < args.where.createdAt.lt)
          .map((row) => ({ createdAt: row.createdAt })),
    );

    queueItemFindMany.mockImplementation(
      async (args: { where: { joinedAt: { gte: Date; lt: Date }; status: string } }) =>
        activeRows
          .filter(
            (row) =>
              row.status === args.where.status &&
              row.joinedAt >= args.where.joinedAt.gte &&
              row.joinedAt < args.where.joinedAt.lt,
          )
          .map((row) => ({ joinedAt: row.joinedAt })),
    );
  });

  it.each(["day", "week", "1m", "3m", "6m", "12m", "1y", "5y"] as Period[])(
    "preserva 1:1 a contagem por slot do cálculo antigo no período %s",
    async (period) => {
      const slots = referenceSlots(period);
      const boundary = slots[Math.min(3, slots.length - 1)];
      activeRows = [
        ...fixture,
        { createdAt: boundary.start, joinedAt: boundary.start, status: "COMPLETED" },
        { createdAt: boundary.end, joinedAt: boundary.end, status: "COMPLETED" },
        {
          createdAt: new Date(boundary.start.getTime() - 1),
          joinedAt: new Date(boundary.start.getTime() - 1),
          status: "COMPLETED",
        },
      ];

      const { data } = await renderChart(period);

      expect(data.chartData).toHaveLength(slots.length);
      expect(data.chartData.map((slot) => slot.label)).toEqual(slots.map((slot) => slot.label));
      expect(data.chartData.map((slot) => slot.newShops)).toEqual(referenceCounts(slots, activeRows, "createdAt"));
      expect(data.chartData.map((slot) => slot.appointments)).toEqual(
        referenceCounts(slots, activeRows, "createdAt"),
      );
      expect(data.chartData.map((slot) => slot.completedQueue)).toEqual(
        referenceCounts(slots, activeRows, "joinedAt", "COMPLETED"),
      );
    },
  );

  it("emite número constante de consultas, independente da quantidade de slots", async () => {
    const monthSlots = referenceSlots("1m").length;
    const yearSlots = referenceSlots("5y").length;
    expect(monthSlots).toBeGreaterThan(yearSlots);

    await renderChart("1m");
    await renderChart("5y");

    expect(appointmentFindMany).toHaveBeenCalledTimes(2);
    expect(queueItemFindMany).toHaveBeenCalledTimes(2);
    expect(appointmentCount).not.toHaveBeenCalled();
    expect(queueItemCount).not.toHaveBeenCalled();

    const chartBarbershopQueries = barbershopFindMany.mock.calls.filter(
      (call) => (call[0] as { take?: number }).take !== 5,
    );
    expect(chartBarbershopQueries).toHaveLength(2);
  });

  it("restringe a janela de busca ao primeiro e ao último slot", async () => {
    const slots = referenceSlots("1m");
    await renderChart("1m");

    const args = appointmentFindMany.mock.calls[0][0] as {
      where: { createdAt: { gte: Date; lt: Date } };
      select: Record<string, boolean>;
    };

    expect(args.where.createdAt.gte).toEqual(slots[0].start);
    expect(args.where.createdAt.lt).toEqual(slots[slots.length - 1].end);
    expect(args.select).toEqual({ createdAt: true });
  });
});
