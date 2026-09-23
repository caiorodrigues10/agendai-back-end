import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateTaskUseCase } from "./tasks/UpdateTaskUseCase";
import { UpdateTicketUseCase } from "./tickets/UpdateTicketUseCase";

const prismaMock = vi.hoisted(() => ({
  ticket: {
    findUnique: vi.fn(),
  },
  task: {
    findUnique: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: prismaMock,
}));

describe("admin internal workflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        ticket: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            id: "00000000-0000-4000-8000-000000000101",
            protocol: "AGD-1",
            title: "Chamado",
            status: "OPEN",
            priority: "NORMAL",
            assignedToId: null,
            category: "QUESTION",
            version: 2,
            updatedAt: new Date("2026-09-22T12:00:00.000Z"),
            assignedTo: null,
          }),
        },
        ticketHistory: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
        task: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            id: "00000000-0000-4000-8000-000000000201",
            title: "Tarefa",
            description: "Nova descrição",
            status: "TODO",
            priority: "NORMAL",
            assignedToId: null,
            dueDate: null,
            version: 2,
            updatedAt: new Date("2026-09-22T12:00:00.000Z"),
            completedAt: null,
            assignedTo: null,
          }),
        },
        taskHistory: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
        auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
      })
    );
  });

  it("uses an atomic ticket version check when saving updates", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000101",
      status: "RESOLVED",
      priority: "NORMAL",
      assignedToId: null,
      category: "QUESTION",
      version: 3,
    });

    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        ticket: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        ticketHistory: { createMany: vi.fn() },
        auditLog: { create: vi.fn() },
      })
    );
    prismaMock.$transaction.mockImplementation(transaction);

    await expect(new UpdateTicketUseCase().execute({
      ticketId: "00000000-0000-4000-8000-000000000101",
      performedById: "00000000-0000-4000-8000-000000000001",
      status: "OPEN",
      version: 3,
    })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("clears ticket closing fields when reopening", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000101",
      status: "RESOLVED",
      priority: "NORMAL",
      assignedToId: null,
      category: "QUESTION",
      version: 3,
    });

    let updateData: unknown;
    prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        ticket: {
          updateMany: vi.fn((args) => {
            updateData = args.data;
            return Promise.resolve({ count: 1 });
          }),
          findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "ticket-1", status: "OPEN", version: 4 }),
        },
        ticketHistory: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
        auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
      })
    );

    await new UpdateTicketUseCase().execute({
      ticketId: "00000000-0000-4000-8000-000000000101",
      performedById: "00000000-0000-4000-8000-000000000001",
      status: "OPEN",
      version: 3,
    });

    expect(updateData).toMatchObject({
      status: "OPEN",
      resolvedAt: null,
      cancelledAt: null,
      cancelReason: null,
      resolveNote: null,
      version: { increment: 1 },
    });
  });

  it("applies task description and due date updates", async () => {
    prismaMock.task.findUnique.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000201",
      status: "TODO",
      priority: "NORMAL",
      assignedToId: null,
      title: "Tarefa",
      description: "Antiga",
      dueDate: null,
      version: 1,
    });

    let updateData: unknown;
    prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        task: {
          updateMany: vi.fn((args) => {
            updateData = args.data;
            return Promise.resolve({ count: 1 });
          }),
          findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "task-1", version: 2 }),
        },
        taskHistory: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
        auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
      })
    );

    await new UpdateTaskUseCase().execute({
      taskId: "00000000-0000-4000-8000-000000000201",
      performedById: "00000000-0000-4000-8000-000000000001",
      description: "Nova",
      dueDate: "2026-09-23T10:00:00.000Z",
      version: 1,
    });

    expect(updateData).toMatchObject({
      description: "Nova",
      dueDate: new Date("2026-09-23T10:00:00.000Z"),
      version: { increment: 1 },
    });
  });

  it("uses an atomic task version check when saving updates", async () => {
    prismaMock.task.findUnique.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000201",
      status: "TODO",
      priority: "NORMAL",
      assignedToId: null,
      title: "Tarefa",
      description: null,
      dueDate: null,
      version: 1,
    });

    prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        task: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        taskHistory: { createMany: vi.fn() },
        auditLog: { create: vi.fn() },
      })
    );

    await expect(new UpdateTaskUseCase().execute({
      taskId: "00000000-0000-4000-8000-000000000201",
      performedById: "00000000-0000-4000-8000-000000000001",
      priority: "HIGH",
      version: 1,
    })).rejects.toMatchObject({ statusCode: 409 });
  });
});
