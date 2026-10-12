import { describe, it, expect, beforeEach, vi } from "vitest";
import { AdminOperationsController } from "./AdminOperationsController";

const prismaMock = vi.hoisted(() => ({
  errorLog: { count: vi.fn(), groupBy: vi.fn() },
  cronRun: { count: vi.fn(), findMany: vi.fn() },
  notificationDelivery: { count: vi.fn() },
  notificationOutbox: { count: vi.fn() },
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: prismaMock,
}));

const controller = new AdminOperationsController();

function makeReply() {
  return {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
}

interface Counters {
  errors24h?: number;
  errors5xx24h?: number;
  errors5xxLastHour?: number;
  cronFailures24h?: number;
  cronRunning?: number;
  whatsapp24h?: number;
  whatsappFailed24h?: number;
  email24h?: number;
  emailFailed24h?: number;
  outboxPending?: number;
  outboxFailed?: number;
}

/** Os valores seguem a ordem exata de avaliação do Promise.all do controller. */
function prime(counters: Counters = {}) {
  prismaMock.errorLog.count
    .mockResolvedValueOnce(counters.errors24h ?? 0)
    .mockResolvedValueOnce(counters.errors5xx24h ?? 0)
    .mockResolvedValueOnce(counters.errors5xxLastHour ?? 0);
  prismaMock.errorLog.groupBy.mockResolvedValue([]);
  prismaMock.cronRun.count
    .mockResolvedValueOnce(counters.cronFailures24h ?? 0)
    .mockResolvedValueOnce(counters.cronRunning ?? 0);
  prismaMock.cronRun.findMany.mockResolvedValue([]);
  prismaMock.notificationDelivery.count
    .mockResolvedValueOnce(counters.whatsapp24h ?? 0)
    .mockResolvedValueOnce(counters.whatsappFailed24h ?? 0)
    .mockResolvedValueOnce(counters.email24h ?? 0)
    .mockResolvedValueOnce(counters.emailFailed24h ?? 0);
  prismaMock.notificationOutbox.count
    .mockResolvedValueOnce(counters.outboxPending ?? 0)
    .mockResolvedValueOnce(counters.outboxFailed ?? 0);
}

async function health(counters: Counters = {}) {
  prime(counters);
  const reply = makeReply();
  await controller.health({} as never, reply as never);
  const payload = reply.send.mock.calls[0][0] as {
    data: {
      status: string;
      statusBreakdown: Record<string, string>;
      statusReasons: { source: string; status: string; message: string }[];
    };
  };
  return payload.data;
}

/** Cálculo original do endpoint, usado como referência de contrato. */
function legacyStatus(c: Counters): string {
  const whatsapp24h = c.whatsapp24h ?? 0;
  const email24h = c.email24h ?? 0;
  const whatsappFailedRate =
    whatsapp24h > 0 ? Math.round(((c.whatsappFailed24h ?? 0) / whatsapp24h) * 1000) / 10 : 0;
  const emailFailedRate =
    email24h > 0 ? Math.round(((c.emailFailed24h ?? 0) / email24h) * 1000) / 10 : 0;
  const errors5xxLastHour = c.errors5xxLastHour ?? 0;
  const cronFailures24h = c.cronFailures24h ?? 0;
  const outboxFailed = c.outboxFailed ?? 0;

  let status = "HEALTHY";
  if (errors5xxLastHour > 0 || cronFailures24h > 0 || outboxFailed > 0) status = "DEGRADED";
  if (
    errors5xxLastHour >= 10 ||
    cronFailures24h >= 5 ||
    whatsappFailedRate >= 50 ||
    emailFailedRate >= 50
  ) {
    status = "UNHEALTHY";
  }
  return status;
}

const scenarios: { name: string; counters: Counters }[] = [
  { name: "tudo zerado", counters: {} },
  { name: "1 erro 5xx na última hora", counters: { errors5xxLastHour: 1 } },
  { name: "10 erros 5xx na última hora", counters: { errors5xxLastHour: 10 } },
  { name: "1 falha de cron", counters: { cronFailures24h: 1 } },
  { name: "5 falhas de cron", counters: { cronFailures24h: 5 } },
  { name: "outbox com falha", counters: { outboxFailed: 2 } },
  { name: "whatsapp 60% de falha", counters: { whatsapp24h: 5, whatsappFailed24h: 3 } },
  { name: "e-mail 100% de falha", counters: { email24h: 2, emailFailed24h: 2 } },
  { name: "erros e cron juntos", counters: { errors5xxLastHour: 2, cronFailures24h: 6 } },
  {
    name: "erros, cron, outbox e entrega juntos",
    counters: {
      errors5xxLastHour: 12,
      cronFailures24h: 7,
      outboxFailed: 4,
      whatsapp24h: 10,
      whatsappFailed24h: 6,
    },
  },
];

describe("AdminOperationsController.health", () => {
  beforeEach(() => vi.clearAllMocks());

  it("expõe o desmembramento por fonte junto do status geral", async () => {
    const data = await health({ cronFailures24h: 3 });

    expect(data.status).toBe("DEGRADED");
    expect(data.statusBreakdown).toEqual({
      errors: "HEALTHY",
      cron: "DEGRADED",
      delivery: "HEALTHY",
      outbox: "HEALTHY",
    });
    expect(data.statusReasons).toEqual([
      { source: "cron", status: "DEGRADED", message: "3 falhas de cron nas últimas 24h" },
    ]);
  });

  it("aponta só o cron quando a infraestrutura está limpa", async () => {
    const data = await health({ cronFailures24h: 6 });

    expect(data.status).toBe("UNHEALTHY");
    expect(data.statusBreakdown.errors).toBe("HEALTHY");
    expect(data.statusBreakdown.outbox).toBe("HEALTHY");
    expect(data.statusBreakdown.delivery).toBe("HEALTHY");
    expect(data.statusBreakdown.cron).toBe("UNHEALTHY");
    expect(data.statusReasons).toHaveLength(1);
    expect(data.statusReasons[0].source).toBe("cron");
  });

  it("não lista motivos quando está saudável", async () => {
    const data = await health();

    expect(data.status).toBe("HEALTHY");
    expect(data.statusBreakdown).toEqual({
      errors: "HEALTHY",
      cron: "HEALTHY",
      delivery: "HEALTHY",
      outbox: "HEALTHY",
    });
    expect(data.statusReasons).toEqual([]);
  });

  it("lista todas as fontes problemáticas, não só a primeira", async () => {
    const data = await health({
      errors5xxLastHour: 11,
      outboxFailed: 3,
      cronFailures24h: 5,
    });

    expect(data.statusReasons.map((reason) => reason.source)).toEqual([
      "errors",
      "cron",
      "outbox",
    ]);
  });

  it.each(scenarios)("mantém o status geral de contrato para: $name", async ({ counters }) => {
    const data = await health(counters);

    expect(data.status).toBe(legacyStatus(counters));
  });
});
