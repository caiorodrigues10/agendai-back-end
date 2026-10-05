/// <reference types="vitest/globals" />

import { getMonitoringDashboard } from "./monitoringController";

const mocks = vi.hoisted(() => ({
  paymentCount: vi.fn(),
  fiadoCount: vi.fn(),
  errorLogCount: vi.fn(),
  zrange: vi.fn(),
  getApiRedisConnection: vi.fn(),
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    payment: { count: mocks.paymentCount },
    fiado: { count: mocks.fiadoCount },
    errorLog: { count: mocks.errorLogCount },
  },
}));

vi.mock("@/shared/infra/queue/redisConnection", () => ({
  getApiRedisConnection: mocks.getApiRedisConnection,
}));

function buildRequest() {
  return { user: { barbershopId: "shop-1" } } as never;
}

function buildReply() {
  return { send: vi.fn((payload: unknown) => payload) } as never;
}

describe("getMonitoringDashboard", () => {
  beforeEach(() => {
    mocks.paymentCount.mockResolvedValue(3);
    mocks.fiadoCount.mockResolvedValue(1);
    mocks.errorLogCount.mockResolvedValue(7);
    mocks.zrange.mockReset().mockResolvedValue([]);
    mocks.getApiRedisConnection.mockReset().mockReturnValue({
      zrange: mocks.zrange,
    });
  });

  it("lê deadJobs das filas reais e preserva o shape da resposta", async () => {
    mocks.zrange.mockImplementation(async (key: string) =>
      key === "bull:email:failed" ? ["job-1", "job-2"] : [],
    );

    const reply = buildReply();
    const result = (await getMonitoringDashboard(buildRequest(), reply)) as {
      pendingPayments: number;
      pendingFiados: number;
      deadJobs: string[];
      recentErrors: number;
      uptime: number;
      timestamp: string;
    };

    expect(mocks.zrange).toHaveBeenCalledWith("bull:email:failed", "0", "49");
    expect(mocks.zrange).toHaveBeenCalledWith("bull:whatsapp:failed", "0", "49");
    expect(mocks.zrange).toHaveBeenCalledWith("bull:post-broadcast:failed", "0", "49");
    expect(mocks.zrange).toHaveBeenCalledWith("bull:notifications-v2:failed", "0", "49");
    expect(result).toMatchObject({
      pendingPayments: 3,
      pendingFiados: 1,
      deadJobs: ["job-1", "job-2"],
      recentErrors: 7,
    });
    expect(typeof result.uptime).toBe("number");
    expect(typeof result.timestamp).toBe("string");
  });

  it("deduplica job ids presentes em mais de uma fila", async () => {
    mocks.zrange.mockResolvedValue(["job-shared"]);

    const result = (await getMonitoringDashboard(buildRequest(), buildReply())) as {
      deadJobs: string[];
    };

    expect(result.deadJobs).toEqual(["job-shared"]);
  });

  it("retorna deadJobs vazio quando a fila específica falha", async () => {
    mocks.zrange.mockRejectedValue(new Error("Redis fora"));

    const result = (await getMonitoringDashboard(buildRequest(), buildReply())) as {
      deadJobs: string[];
    };

    expect(result.deadJobs).toEqual([]);
  });

  it("retorna deadJobs vazio quando o Redis nem conecta", async () => {
    mocks.getApiRedisConnection.mockImplementation(() => {
      throw new Error("Stream isn't writeable");
    });

    const result = (await getMonitoringDashboard(buildRequest(), buildReply())) as {
      deadJobs: string[];
    };

    expect(result.deadJobs).toEqual([]);
    expect(mocks.zrange).not.toHaveBeenCalled();
  });
});
