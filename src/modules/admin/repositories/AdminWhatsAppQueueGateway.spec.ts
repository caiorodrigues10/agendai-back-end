import { describe, it, expect, vi, beforeEach } from "vitest";
import { AdminWhatsAppQueueGateway } from "./AdminWhatsAppQueueGateway";

const queueMocks = vi.hoisted(() => ({
  constructions: [] as string[],
  countsError: new Set<string>(),
  jobsError: new Set<string>(),
  states: new Map<string, string>(),
  retried: [] as string[],
  removed: [] as string[],
  failCounts: false,
  failJobs: false,
}));

vi.mock("bullmq", () => ({
  Queue: class {
    constructor(name: string) {
      queueMocks.constructions.push(name);
    }
  },
  QueueEvents: class {},
}));

vi.mock("@/shared/infra/queue/redisConnection", () => ({
  getRedisConnection: vi.fn(() => ({})),
}));

function fakeClient(name: string) {
  return {
    getJobCounts: vi.fn(async () => {
      if (queueMocks.failCounts) throw new Error("redis fora apikey=secret");
      return { wait: 1, active: 0, completed: 2, failed: 3, delayed: 0 };
    }),
    getFailed: vi.fn(async () => {
      if (queueMocks.failJobs) throw new Error("redis fora apikey=secret");
      return [
        {
          id: "job-1",
          name: "send",
          data: { phone: "11987654321" },
          failedReason: "timeout",
          attemptsMade: 3,
          timestamp: 10,
        },
      ];
    }),
    getJob: vi.fn(async (jobId: string) => {
      if (!queueMocks.states.has(jobId)) return undefined;
      return {
        id: jobId,
        name: "send",
        data: { phone: "11987654321" },
        failedReason: "timeout",
        attemptsMade: 3,
        timestamp: 10,
        getState: async () => queueMocks.states.get(jobId) ?? "unknown",
        retry: async () => {
          queueMocks.retried.push(`${name}:${jobId}`);
        },
        remove: async () => {
          queueMocks.removed.push(`${name}:${jobId}`);
        },
      };
    }),
  };
}

vi.mock("@/shared/infra/queue/whatsappQueue", () => ({
  whatsappQueue: fakeClient("whatsapp"),
}));

vi.mock("@/shared/infra/queue/whatsappAiQueue", () => ({
  whatsappAiQueue: fakeClient("whatsapp-ai"),
}));

vi.mock("@/shared/infra/queue/ownerBotQueue", () => ({
  ownerBotQueue: fakeClient("owner-bot"),
}));

describe("AdminWhatsAppQueueGateway", () => {
  beforeEach(() => {
    queueMocks.constructions.length = 0;
    queueMocks.retried.length = 0;
    queueMocks.removed.length = 0;
    queueMocks.states.clear();
    queueMocks.failCounts = false;
    queueMocks.failJobs = false;
  });

  it("não cria Queue nova por chamada", async () => {
    const gateway = new AdminWhatsAppQueueGateway();

    await gateway.counts(["whatsapp", "whatsapp-ai", "owner-bot"]);
    await gateway.counts(["whatsapp", "whatsapp-ai", "owner-bot"]);
    await gateway.failedJobs(["whatsapp"]);

    expect(queueMocks.constructions).toHaveLength(0);
  });

  it("devolve available:false quando a leitura da fila falha", async () => {
    queueMocks.failCounts = true;
    queueMocks.failJobs = true;
    const gateway = new AdminWhatsAppQueueGateway();

    const counts = await gateway.counts(["whatsapp"]);
    const failed = await gateway.failedJobs(["whatsapp"]);

    expect(counts.whatsapp.available).toBe(false);
    expect(counts.whatsapp).toHaveProperty("error");
    expect(JSON.stringify(counts.whatsapp)).not.toContain("secret");
    expect(failed.whatsapp.available).toBe(false);
  });

  it("lê o estado do job e reprocessa/remove", async () => {
    queueMocks.states.set("job-1", "failed");
    const gateway = new AdminWhatsAppQueueGateway();

    await expect(gateway.getJobState("whatsapp", "job-1")).resolves.toBe("failed");
    await expect(gateway.getJobState("whatsapp", "job-9")).resolves.toBeNull();

    await gateway.retry("whatsapp", "job-1");
    await gateway.remove("whatsapp", "job-1");

    expect(queueMocks.retried).toEqual(["whatsapp:job-1"]);
    expect(queueMocks.removed).toEqual(["whatsapp:job-1"]);
  });
});
